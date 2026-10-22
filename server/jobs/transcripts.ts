// Video transcripts: asks the Python worker (worker/transcribe.py, run by GitHub Actions) to turn each
// uploaded video into text with times, and uses the result for the YouTube chapters and description.
// Called every minute from /api/cron/minute (syncTranscripts); generate_youtube reads loadTranscripts.
import { and, create, eq, link, list, nowIso, str, T, updateOne, num } from '../airtable.js';
import { temporaryLink } from '../dropbox.js';
import { isMock } from '../env.js';
import { dispatchTranscribe, workerConfigured } from '../github.js';
import { mockDurationSec, mockSegments } from '../fixtures/transcript.js';
import { activity } from '../log.js';
import { parseSegments, type Segment } from '../transcripts.js';
import { DuplicateJobError, enqueue, pendingJob } from './queue.js';

const ROLES = ['long_video', 'short_1', 'short_2', 'short_3'];
const REQUEST_AGAIN_MIN = 20; // queued and untouched this long: start the worker again
const RUNNING_TIMEOUT_MIN = 75; // the workflow itself stops at 90
const minutesSince = (iso: string | null) =>
  iso ? (Date.now() - Date.parse(iso)) / 60_000 : Infinity;

export interface ProjectTranscript {
  role: string;
  rowId: string;
  segments: Segment[];
  durationSec: number;
}

/** The finished transcripts of the project's current videos, one per role. */
export async function loadTranscripts(projectId: string): Promise<Map<string, ProjectTranscript>> {
  const [assets, rows] = await Promise.all([
    list(T.assets, { filterByFormula: eq('Current', true) }),
    list(T.transcripts, { filterByFormula: eq('Status', 'done') }),
  ]);
  const current = new Set(
    assets.filter((a) => link(a.fields, 'Project') === projectId).map((a) => a.id),
  );
  const out = new Map<string, ProjectTranscript>();
  for (const r of rows) {
    const asset = link(r.fields, 'Asset');
    if (!asset || !current.has(asset)) continue;
    const segments = parseSegments(str(r.fields, 'Segments'));
    if (segments.length === 0) continue;
    out.set(str(r.fields, 'Role') ?? '', {
      role: str(r.fields, 'Role') ?? '',
      rowId: r.id,
      segments,
      durationSec: num(r.fields, 'Duration Seconds') ?? segments.at(-1)!.e,
    });
  }
  return out;
}

/** Re-queues failed transcripts (the owner's Retry) with a fresh download link. */
export async function retryTranscripts(projectId: string): Promise<number> {
  const rows = (await list(T.transcripts, { filterByFormula: eq('Status', 'failed') })).filter(
    (r) => link(r.fields, 'Project') === projectId,
  );
  for (const r of rows) {
    const asset = link(r.fields, 'Asset');
    const rec = asset
      ? (await list(T.assets, { filterByFormula: `RECORD_ID()="${asset}"`, maxRecords: 1 }))[0]
      : null;
    await updateOne(T.transcripts, r.id, {
      Status: 'queued',
      Error: '',
      'Source URL': rec ? await temporaryLink(str(rec.fields, 'Dropbox File ID') ?? '') : '',
      'Requested At': nowIso(),
      Updated: nowIso(),
    });
  }
  if (rows.length && !isMock()) await dispatchTranscribe();
  return rows.length;
}

export async function syncTranscripts(): Promise<Record<string, number>> {
  const stats = { created: 0, redispatched: 0, timed_out: 0, auto_regenerated: 0 };
  if (!isMock() && !workerConfigured()) return stats; // Settings → Integrations shows it as not set up

  const [assets, rows] = await Promise.all([
    list(T.assets, { filterByFormula: and(eq('Current', true)) }),
    list(T.transcripts),
  ]);
  let dispatch = false;

  // 1. A settled video with no transcript row yet → queue one.
  for (const a of assets) {
    const role = str(a.fields, 'Role') ?? '';
    if (!ROLES.includes(role) || !str(a.fields, 'Settled At')) continue;
    if (rows.some((r) => link(r.fields, 'Asset') === a.id)) continue;
    const base = {
      Name: `${role} · ${str(a.fields, 'File Name') ?? ''}`,
      Role: role,
      Asset: [a.id],
      Project: [link(a.fields, 'Project')].filter(Boolean),
      'Requested At': nowIso(),
      Created: nowIso(),
      Updated: nowIso(),
    };
    if (isMock()) {
      await create(T.transcripts, [
        {
          ...base,
          Status: 'done',
          Language: 'en',
          'Duration Seconds': role === 'long_video' ? mockDurationSec : 45,
          Text: mockSegments.map((s) => s.t).join(' '),
          Segments: JSON.stringify(role === 'long_video' ? mockSegments : mockSegments.slice(0, 3)),
          'Finished At': nowIso(),
        },
      ]);
    } else {
      await create(T.transcripts, [
        {
          ...base,
          Status: 'queued',
          'Source URL': await temporaryLink(str(a.fields, 'Dropbox File ID') ?? ''),
        },
      ]);
      dispatch = true;
    }
    stats.created++;
  }

  // 2. Rows the worker has not picked up, or that got stuck.
  for (const r of rows) {
    const status = str(r.fields, 'Status');
    if (
      status === 'queued' &&
      minutesSince(str(r.fields, 'Requested At')) > REQUEST_AGAIN_MIN &&
      !isMock()
    ) {
      const asset = link(r.fields, 'Asset');
      const rec = assets.find((x) => x.id === asset);
      await updateOne(T.transcripts, r.id, {
        // The download link lasts ~4 hours: refresh it whenever we ask again.
        ...(rec
          ? { 'Source URL': await temporaryLink(str(rec.fields, 'Dropbox File ID') ?? '') }
          : {}),
        'Requested At': nowIso(),
      });
      dispatch = true;
      stats.redispatched++;
    }
    if (status === 'running' && minutesSince(str(r.fields, 'Started At')) > RUNNING_TIMEOUT_MIN) {
      await updateOne(T.transcripts, r.id, {
        Status: 'failed',
        Error: 'Timed out: the worker did not finish. Use Retry.',
        'Source URL': '',
        'Finished At': nowIso(),
      });
      stats.timed_out++;
    }
  }
  if (dispatch) await dispatchTranscribe();

  stats.auto_regenerated = await regenerateFromNewTranscripts();
  return stats;
}

/**
 * When a project's YouTube metadata exists, nothing in it is approved yet, and a finished transcript has not
 * been used: write it again from the transcripts (once per transcript). Approved items are never replaced
 * automatically: the panel offers "Regenerate from video" instead.
 */
async function regenerateFromNewTranscripts(): Promise<number> {
  const fresh = (await list(T.transcripts, { filterByFormula: eq('Status', 'done') })).filter(
    (r) => !str(r.fields, 'Used At'),
  );
  const projects = [
    ...new Set(fresh.map((r) => link(r.fields, 'Project')).filter((p): p is string => !!p)),
  ];
  let n = 0;
  for (const projectId of projects) {
    const sets = await list(T.captionSets, {
      filterByFormula: and(eq('Kind', 'youtube'), `{Status}!="superseded"`),
    });
    const set = sets.find((s) => link(s.fields, 'Project') === projectId);
    if (!set) continue; // no metadata yet: it will use the transcripts when it is first generated
    const items = (
      await list(T.contentItems, { filterByFormula: eq('Channel', 'youtube') })
    ).filter(
      (i) => link(i.fields, 'Project') === projectId && str(i.fields, 'Status') !== 'superseded',
    );
    if (items.some((i) => str(i.fields, 'Status') === 'approved')) {
      // Approved work is never replaced by itself: mark these as handled; the panel offers "Regenerate from video".
      for (const r of fresh.filter((x) => link(x.fields, 'Project') === projectId)) {
        await updateOne(T.transcripts, r.id, { 'Used At': nowIso() });
      }
      continue;
    }
    if (await pendingJob(`generate_youtube:${projectId}`)) continue;
    try {
      await enqueue(
        'generate_youtube',
        { project_id: projectId },
        {
          dedupeKey: `generate_youtube:${projectId}`,
          projectId,
          start: false,
          maxAttempts: 2,
        },
      );
    } catch (err) {
      if (err instanceof DuplicateJobError) continue;
      throw err;
    }
    for (const r of fresh.filter((x) => link(x.fields, 'Project') === projectId)) {
      await updateOne(T.transcripts, r.id, { 'Used At': nowIso() });
    }
    await activity({ event: 'youtube_regenerated_from_transcripts', projectId });
    n++;
  }
  return n;
}
