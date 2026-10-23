// The editor's transcript of the long video (a PDF / Word / text file in "Long Youtube Final Video") gives the
// YouTube chapters and description what is really said. Read by scan_uploads (syncTranscriptFile);
// generate_youtube reads loadTranscripts; syncTranscripts (every minute) rewrites unapproved metadata once.
import { and, create, eq, link, list, nowIso, str, T, updateOne, num } from '../airtable.js';
import { listFiles, temporaryLink } from '../dropbox.js';
import { isMock } from '../env.js';
import { mockDurationSec, mockSegments } from '../fixtures/transcript.js';
import { activity } from '../log.js';
import { fileText, MAX_TRANSCRIPT_BYTES, TRANSCRIPT_FILE } from '../transcript-file.js';
import { parseSegments, segmentsFromText, type Segment } from '../transcripts.js';
import { DuplicateJobError, enqueue, pendingJob } from './queue.js';

const LONG_FOLDER = 'Long Youtube Final Video';

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
      durationSec: num(r.fields, 'Duration Seconds') ?? 0,
    });
  }
  return out;
}

/** Looks for the transcript file next to the long video and stores it (a new revision replaces the old one). */
export async function syncTranscriptFile(projectId: string, folder: string): Promise<boolean> {
  const files = (await listFiles(`${folder}/${LONG_FOLDER}`)).filter((f) =>
    TRANSCRIPT_FILE.test(f.name),
  );
  const file = files.find((f) => /transcript/i.test(f.name)) ?? files.at(-1);
  if (!file) return false;
  const [assets, rows] = await Promise.all([
    list(T.assets, { filterByFormula: and(eq('Current', true), eq('Role', 'long_video')) }),
    list(T.transcripts, { filterByFormula: eq('Role', 'long_video') }),
  ]);
  const asset = assets.find((a) => link(a.fields, 'Project') === projectId);
  if (!asset) return false; // wait for the video itself
  const key = `file:${file.id}:${file.rev}`;
  const mine = rows.filter((r) => link(r.fields, 'Project') === projectId);
  const same = mine.find((r) => str(r.fields, 'Name') === key);
  if (same) {
    if (link(same.fields, 'Asset') !== asset.id)
      await updateOne(T.transcripts, same.id, { Asset: [asset.id], Updated: nowIso() });
    return false;
  }

  let fields: Record<string, unknown>;
  try {
    const res = await fetch(await temporaryLink(file.id));
    const data = new Uint8Array(await res.arrayBuffer());
    if (!res.ok || data.length > MAX_TRANSCRIPT_BYTES) throw new Error('could not download it');
    const segments = segmentsFromText(await fileText(file.name, data));
    if (segments.length === 0) throw new Error('no text found in it');
    const json = JSON.stringify(segments);
    if (json.length > 95_000) throw new Error('it is too long for a 15-minute video');
    fields = {
      Status: 'done',
      'Duration Seconds': segments.some((s) => s.e > 0) ? Math.round(segments.at(-1)!.e) : 0,
      Text: segments.map((s) => s.t).join(' '),
      Segments: json,
      Error: '',
    };
  } catch (err) {
    const why = err instanceof Error ? err.message : 'unknown error';
    fields = { Status: 'failed', Error: `Couldn’t read ${file.name}: ${why.slice(0, 120)}` };
  }
  const row = {
    Name: key,
    Asset: [asset.id],
    'Used At': '',
    'Requested At': nowIso(),
    'Finished At': nowIso(),
    Updated: nowIso(),
    ...fields,
  };
  if (mine[0]) await updateOne(T.transcripts, mine[0].id, row);
  else
    await create(T.transcripts, [
      { ...row, Role: 'long_video', Project: [projectId], Created: nowIso() },
    ]);
  await activity({
    event: 'transcript_file_read',
    projectId,
    details: { file: file.name, status: fields['Status'] },
  });
  return true;
}

/** The owner's "Check again": forgets a failed read so the file is tried once more. */
export async function retryTranscripts(projectId: string): Promise<number> {
  const rows = (await list(T.transcripts, { filterByFormula: eq('Status', 'failed') })).filter(
    (r) => link(r.fields, 'Project') === projectId,
  );
  for (const r of rows) await updateOne(T.transcripts, r.id, { Name: 'retry', Updated: nowIso() });
  const project = (
    await list(T.projects, { filterByFormula: `RECORD_ID()="${projectId}"`, maxRecords: 1 })
  )[0];
  const folder = project
    ? (str(project.fields, 'Videos Folder Path') ?? str(project.fields, 'Dropbox Folder Path'))
    : null;
  if (folder) await syncTranscriptFile(projectId, folder);
  return rows.length;
}

/** Every minute: rewrite unapproved YouTube metadata from a new transcript (mock mode first makes one). */
export async function syncTranscripts(): Promise<Record<string, number>> {
  if (isMock()) await mockTranscripts();
  return { auto_regenerated: await regenerateFromNewTranscripts() };
}

/** Mock mode has no Dropbox files: each settled long video gets a fixture transcript. */
async function mockTranscripts(): Promise<void> {
  const [assets, rows] = await Promise.all([
    list(T.assets, { filterByFormula: and(eq('Current', true), eq('Role', 'long_video')) }),
    list(T.transcripts),
  ]);
  for (const a of assets) {
    if (!str(a.fields, 'Settled At') || rows.some((r) => link(r.fields, 'Asset') === a.id))
      continue;
    await create(T.transcripts, [
      {
        Name: `mock · ${str(a.fields, 'File Name') ?? ''}`,
        Role: 'long_video',
        Asset: [a.id],
        Project: [link(a.fields, 'Project')].filter(Boolean),
        Status: 'done',
        'Duration Seconds': mockDurationSec,
        Text: mockSegments.map((s) => s.t).join(' '),
        Segments: JSON.stringify(mockSegments),
        'Requested At': nowIso(),
        'Finished At': nowIso(),
        Created: nowIso(),
        Updated: nowIso(),
      },
    ]);
  }
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
