// YouTube metadata (F10.1): generate_youtube runs youtube_metadata_generate once per video — the
// long video and Short 1–3 — from the approved script. Each run is a YouTube "Caption Set" with one
// Content Item per video. Regenerating one video replaces only that item in the current set.
import { z } from 'zod';
import {
  create,
  createOne,
  get,
  jsonField,
  nowIso,
  num,
  str,
  T,
  toJson,
  update,
  updateOne,
} from '../airtable.js';
import { runPrompt } from '../claude.js';
import { activity } from '../log.js';
import { applyTranscript } from '../transcripts.js';
import { loadTranscripts } from './transcripts.js';
import { loadProject, setProjectStatus } from '../repo/projects.js';
import { loadTopic } from '../repo/topics.js';
import { Script } from '../schemas/script.js';
import {
  descriptionHashtags,
  duplicateTitleWarnings,
  YouTubeMeta,
  YT_LABEL,
  YT_VIDEOS,
  type YtVideo,
  youtubeInput,
  youtubeWarnings,
} from '../schemas/youtube.js';
import { captionSets, setItems } from './captions.js';
import type { JobHandler } from './handlers.js';
import { scriptVersions } from './projects.js';
import { PermanentJobError } from './rules.js';
import { payload } from './topics.js';

const GeneratePayload = z.object({
  project_id: z.string().min(1),
  notes: z.string().optional(),
  video: z.enum(YT_VIDEOS).optional(),
});

/** "vid" + digits (the prompt's format): cycle YYYYMM + project sequence + 0 (long) or 1–3 (short). */
function videoId(cycleMonth: string | null, sequence: number | null, video: YtVideo): string {
  const ym = (cycleMonth ?? '').slice(0, 7).replace('-', '') || '000000';
  const n = String(sequence ?? 0).padStart(2, '0');
  return `vid${ym}${n}${video === 'long_video' ? 0 : video.slice(-1)}`;
}

export const generateYouTube: JobHandler = {
  async run(job) {
    const { project_id, notes, video } = payload(GeneratePayload, job.payload);
    const project = await loadProject(project_id);
    if (!project) throw new PermanentJobError(`Project ${project_id} not found`);
    const approved = (await scriptVersions(project.id)).find(
      (r) => str(r.fields, 'Status') === 'approved',
    );
    if (!approved)
      throw new PermanentJobError(
        'Approve the script first: the YouTube metadata is written from it.',
      );
    const script = Script.safeParse(jsonField(approved.fields, 'Script JSON', null)).data;
    if (!script)
      throw new PermanentJobError('The approved script has no readable Script JSON in Airtable');

    const topic = project.topic_id ? await loadTopic(project.topic_id) : null;
    const score = topic?.latest_score_id ? await get(T.topicScores, topic.latest_score_id) : null;
    const evaluation = score
      ? jsonField<Record<string, unknown>>(score.fields, 'Evaluation', {})
      : {};

    const sets = await captionSets(project.id, 'youtube');
    const current = sets.find((s) => str(s.fields, 'Status') !== 'superseded') ?? null;
    if (video && !current)
      throw new PermanentJobError('There’s no YouTube metadata yet to regenerate one video of.');

    const videos = video ? [video] : [...YT_VIDEOS];
    // What the finished videos really say (Python worker), per video; absent until they are uploaded.
    const transcripts = await loadTranscripts(project.id);
    // The four videos are independent: run them side by side.
    const results = await Promise.all(
      videos.map(async (v) => {
        const scriptInput = youtubeInput({
          video: v,
          topicTitle: topic?.title ?? project.title,
          category: topic?.category ?? null,
          script,
          evaluation,
          videoId: videoId(project.cycle_month, project.sequence, v),
        });
        // Timing and summary come from the video itself when its transcript is ready, else from the script.
        const tx = transcripts.get(v === 'long_video' ? 'long_video' : `short_${v.slice(-1)}`);
        const input = tx
          ? applyTranscript(scriptInput, v, { segments: tx.segments, durationSec: tx.durationSec })
          : scriptInput;
        const { duration_seconds, ...vars } = input;
        const run = await runPrompt(
          'youtube_metadata_generate',
          { ...vars, notes: notes ?? '' },
          YouTubeMeta,
          {
            jobId: job.id,
            projectId: project.id,
          },
        );
        return {
          video: v,
          input,
          durationSec: duration_seconds,
          run,
          source: tx ? 'video' : 'script',
        };
      }),
    );

    let set = current;
    let version = num(current?.fields ?? {}, 'Version') ?? 0;
    const merged: Record<string, unknown> =
      video && current ? jsonField(current.fields, 'Caption JSON', {}) : {};
    for (const r of results) merged[r.video] = r.run.data;

    if (!video) {
      // A whole new set: the earlier one and its items are superseded.
      for (const old of sets.filter((s) => str(s.fields, 'Status') !== 'superseded')) {
        const items = await setItems(old);
        await update(
          T.contentItems,
          items.map((i) => ({ id: i.id, fields: { Status: 'superseded', Updated: nowIso() } })),
        );
        await updateOne(T.captionSets, old.id, { Status: 'superseded', Updated: nowIso() });
      }
      version = (num(sets[0]?.fields ?? {}, 'Version') ?? 0) + 1;
      set = await createOne(T.captionSets, {
        Name: `${project.title} · YouTube v${version}`,
        Kind: 'youtube',
        Project: [project.id],
        Version: version,
        Status: 'draft',
        'Caption JSON': toJson(merged),
        Warnings: toJson([]),
        Inputs: toJson(Object.fromEntries(results.map((r) => [r.video, r.input]))),
        'Regen Scope': 'all',
        'Regen Notes': notes,
        'Prompt Key': results[0]!.run.prompt.key,
        'Prompt Version': results[0]!.run.prompt.version,
        Created: nowIso(),
        Updated: nowIso(),
      });
    } else {
      const old = (await setItems(set!)).filter(
        (i) => str(i.fields, 'Post') === video && str(i.fields, 'Status') !== 'superseded',
      );
      await update(
        T.contentItems,
        old.map((i) => ({ id: i.id, fields: { Status: 'superseded', Updated: nowIso() } })),
      );
      await updateOne(T.captionSets, set!.id, {
        'Caption JSON': toJson(merged),
        'Regen Scope': video,
        'Regen Notes': notes,
        Updated: nowIso(),
      });
    }

    // Each video needs its own title: compare across the whole set (including untouched videos).
    const titles: Partial<Record<YtVideo, string>> = {};
    for (const [v, m] of Object.entries(merged)) {
      const parsed = YouTubeMeta.safeParse(m);
      if (parsed.success) titles[v as YtVideo] = parsed.data.titles.recommended;
    }
    const duplicates = duplicateTitleWarnings(titles);

    const now = nowIso();
    const created = await create(
      T.contentItems,
      results.map((r) => {
        const m = r.run.data;
        const warnings = youtubeWarnings(m, r.video, r.durationSec, r.input.primary_keyword);
        if (duplicates[r.video]) warnings.push(duplicates[r.video]!);
        const long = r.video === 'long_video';
        return {
          Name: `YouTube · ${YT_LABEL[r.video]}`,
          Channel: 'youtube',
          Post: r.video,
          Platform: long ? 'youtube' : 'youtube_shorts',
          'Asset Role': long ? 'long_video' : `short_${r.video.slice(-1)}`,
          'Media Type': 'video',
          Title: m.titles.recommended,
          Caption: m.description.full_text,
          Hashtags: descriptionHashtags(m.description.full_text),
          Extra: toJson({
            title_options: m.titles.options,
            tags: m.tags,
            thumbnail_text_options: m.thumbnail_text_options,
            seo_notes: m.seo_notes,
            language: m.language,
            video_id: m.video_id,
            duration: r.input.video_duration,
            /** Where the timing and summary came from: the uploaded video's transcript, or the script. */
            source: r.source,
          }),
          Status: warnings.length ? 'needs_edit' : 'draft',
          Version: version,
          Validation: toJson(warnings),
          'Prompt Key': r.run.prompt.key,
          'Prompt Version': r.run.prompt.version,
          Project: [project.id],
          'Caption Set': [set!.id],
          Created: now,
          Updated: now,
        };
      }),
    );

    // These transcripts are now used: the automatic rewrite must not run again for them.
    for (const t of transcripts.values())
      await updateOne(T.transcripts, t.rowId, { 'Used At': nowIso() });

    const flagged = created.filter((c) => c.fields['Status'] === 'needs_edit').length;
    const fresh = await loadProject(project.id);
    if (fresh) {
      await setProjectStatus(
        fresh,
        fresh.status,
        video
          ? `YouTube metadata rewritten for ${YT_LABEL[video]}.`
          : `YouTube metadata v${version} ready for review (4 videos${flagged ? `, ${flagged} need a look` : ''}).`,
      );
    }
    await activity({
      event: video ? 'youtube_video_regenerated' : 'youtube_generated',
      projectId: project.id,
      details: { version, videos, flagged, notes: notes ?? null },
    });
    return { set_id: set!.id, version, videos: created.length, flagged };
  },

  async onFailed(job, message) {
    const parsed = GeneratePayload.safeParse(job.payload);
    if (!parsed.success) return;
    const project = await loadProject(parsed.data.project_id);
    if (project)
      await setProjectStatus(project, project.status, `YouTube metadata failed: ${message}`);
  },
};
