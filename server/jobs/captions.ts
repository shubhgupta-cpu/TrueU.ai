// Social captions (F10): generate_captions runs captions_generate once the blog is approved and
// stores each run as a Caption Set with one Content Item per post (28). Regenerating everything
// makes a new set; regenerating one channel replaces only that channel's posts in the current set.
import { z } from 'zod';
import {
  type AtRecord,
  byIds,
  create,
  createOne,
  get,
  jsonField,
  list,
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
import { loadProject, setProjectStatus } from '../repo/projects.js';
import { loadTopic } from '../repo/topics.js';
import { Blog } from '../schemas/blog.js';
import {
  CHANNEL_SPECS,
  CHANNELS,
  type Captions as CaptionsT,
  Captions,
  captionInput,
  type FlatPost,
  flattenPosts,
  graphicText,
  postText,
  postWarnings,
  setWarnings,
} from '../schemas/captions.js';
import { Script } from '../schemas/script.js';
import { getSettings } from '../settings.js';
import { blogVersions } from './blog.js';
import type { JobHandler } from './handlers.js';
import { scriptVersions } from './projects.js';
import { PermanentJobError } from './rules.js';
import { payload } from './topics.js';

const SLOT_LABEL = {
  image: 'Image',
  video_1: 'Video 1',
  video_2: 'Video 2',
  video_3: 'Video 3',
} as const;
const ASSET_ROLE = {
  image: 'graphic',
  video_1: 'short_1',
  video_2: 'short_2',
  video_3: 'short_3',
} as const;

export type SetKind = 'social' | 'youtube' | 'cta' | 'poll';

/** A project's caption sets of one kind, newest first (sets without a Kind are social). */
export async function captionSets(
  projectId: string,
  kind: SetKind = 'social',
): Promise<AtRecord[]> {
  const ids =
    ((await get(T.projects, projectId))?.fields['Caption Sets'] as string[] | undefined) ?? [];
  if (!ids.length) return [];
  const rows = await list(T.captionSets, { filterByFormula: byIds(ids) });
  return rows
    .filter((r) => (str(r.fields, 'Kind') ?? 'social') === kind)
    .sort((a, b) => (num(b.fields, 'Version') ?? 0) - (num(a.fields, 'Version') ?? 0));
}

/** The Content Items of a set. */
export async function setItems(set: AtRecord): Promise<AtRecord[]> {
  const ids = (set.fields['Content Items'] as string[] | undefined) ?? [];
  if (!ids.length) return [];
  const out: AtRecord[] = [];
  for (let i = 0; i < ids.length; i += 50)
    out.push(...(await list(T.contentItems, { filterByFormula: byIds(ids.slice(i, i + 50)) })));
  return out;
}

function itemFields(
  x: FlatPost,
  ctx: {
    projectId: string;
    setId: string;
    version: number;
    promptKey: string;
    promptVersion: number;
  },
) {
  const spec = CHANNEL_SPECS[x.channel];
  const warnings = postWarnings(x.channel, x.post);
  const now = nowIso();
  const video = x.slot !== 'image';
  return {
    Name: `${spec.label} · ${SLOT_LABEL[x.slot]}`,
    Channel: x.channel,
    Post: x.slot,
    Platform: video ? spec.platform.video : spec.platform.image,
    'Asset Role': ASSET_ROLE[x.slot],
    'Media Type': video ? 'video' : 'image',
    Title: graphicText(x.post),
    Caption: postText(x.channel, x.post),
    Hashtags: x.post.hashtags.trim(),
    Extra: toJson({
      graphic_label: x.post.graphic_label,
      graphic_points: x.post.graphic_points,
      cover_subtext: x.post.cover_subtext,
      slides: x.post.slides,
    }),
    Status: warnings.length ? 'needs_edit' : 'draft',
    Version: ctx.version,
    Validation: toJson(warnings),
    'Prompt Key': ctx.promptKey,
    'Prompt Version': ctx.promptVersion,
    Project: [ctx.projectId],
    'Caption Set': [ctx.setId],
    Created: now,
    Updated: now,
  };
}

const GeneratePayload = z.object({
  project_id: z.string().min(1),
  notes: z.string().optional(),
  channel: z.enum(CHANNELS).optional(),
});

export const generateCaptions: JobHandler = {
  async run(job) {
    const { project_id, notes, channel } = payload(GeneratePayload, job.payload);
    const project = await loadProject(project_id);
    if (!project) throw new PermanentJobError(`Project ${project_id} not found`);

    const approvedScript = (await scriptVersions(project.id)).find(
      (r) => str(r.fields, 'Status') === 'approved',
    );
    const approvedBlog = (await blogVersions(project.id)).find(
      (r) => str(r.fields, 'Status') === 'approved',
    );
    if (!approvedScript || !approvedBlog) {
      throw new PermanentJobError(
        'Approve the script and the blog first: the captions promote them.',
      );
    }
    const script =
      Script.safeParse(jsonField(approvedScript.fields, 'Script JSON', null)).data ?? null;
    const blog = Blog.safeParse(jsonField(approvedBlog.fields, 'Blog JSON', null)).data ?? null;
    const topic = project.topic_id ? await loadTopic(project.topic_id) : null;
    const { weekly_hashtags, social_content_url } = await getSettings([
      'weekly_hashtags',
      'social_content_url',
    ] as const);

    const sets = await captionSets(project.id);
    const current = sets.find((s) => str(s.fields, 'Status') !== 'superseded') ?? null;
    if (channel && !current)
      throw new PermanentJobError('There are no captions yet to regenerate a single channel of.');

    const inputs = captionInput({
      topicTitle: topic?.title ?? project.title,
      category: topic?.category ?? null,
      script,
      blog,
      urlTemplate: social_content_url,
      weeklyHashtags: weekly_hashtags,
    });
    const focus = channel
      ? `Only the ${CHANNEL_SPECS[channel].label} posts (key "${channel}") will be used from this run: give them fresh angles. Still return the complete JSON.`
      : '';
    const run = await runPrompt(
      'captions_generate',
      { ...inputs, notes: notes ?? '', focus },
      Captions,
      {
        jobId: job.id,
        projectId: project.id,
      },
    );

    if (!channel) {
      // A whole new set: earlier sets and their posts are superseded (their approvals lapse).
      for (const old of sets.filter((s) => str(s.fields, 'Status') !== 'superseded')) {
        const items = await setItems(old);
        await update(
          T.contentItems,
          items.map((i) => ({ id: i.id, fields: { Status: 'superseded', Updated: nowIso() } })),
        );
        await updateOne(T.captionSets, old.id, { Status: 'superseded', Updated: nowIso() });
      }
      const version = (num(sets[0]?.fields ?? {}, 'Version') ?? 0) + 1;
      const set = await createOne(T.captionSets, {
        Name: `${project.title} · captions v${version}`,
        Kind: 'social',
        Project: [project.id],
        Version: version,
        Status: 'draft',
        'Caption JSON': toJson(run.data),
        Warnings: toJson(setWarnings(run.data)),
        Inputs: toJson(inputs),
        'Regen Scope': 'all',
        'Regen Notes': notes,
        'Prompt Key': run.prompt.key,
        'Prompt Version': run.prompt.version,
        Created: nowIso(),
        Updated: nowIso(),
      });
      const posts = flattenPosts(run.data);
      const created = await create(
        T.contentItems,
        posts.map((x) =>
          itemFields(x, {
            projectId: project.id,
            setId: set.id,
            version,
            promptKey: run.prompt.key,
            promptVersion: run.prompt.version,
          }),
        ),
      );
      const flagged = created.filter((c) => c.fields['Status'] === 'needs_edit').length;
      await setProjectStatus(
        project,
        project.status,
        `Social captions v${version} ready for review (${created.length} posts${flagged ? `, ${flagged} need a look` : ''}).`,
      );
      await activity({
        event: 'captions_generated',
        projectId: project.id,
        details: { version, set_id: set.id, posts: created.length, flagged, notes: notes ?? null },
      });
      return { set_id: set.id, version, posts: created.length, flagged };
    }

    // One channel: replace its posts in the current set.
    const set = current!;
    const items = await setItems(set);
    const old = items.filter(
      (i) => str(i.fields, 'Channel') === channel && str(i.fields, 'Status') !== 'superseded',
    );
    const itemVersion = Math.max(0, ...old.map((i) => num(i.fields, 'Version') ?? 0)) + 1;
    await update(
      T.contentItems,
      old.map((i) => ({ id: i.id, fields: { Status: 'superseded', Updated: nowIso() } })),
    );
    const posts = flattenPosts(run.data, channel);
    const created = await create(
      T.contentItems,
      posts.map((x) =>
        itemFields(x, {
          projectId: project.id,
          setId: set.id,
          version: itemVersion,
          promptKey: run.prompt.key,
          promptVersion: run.prompt.version,
        }),
      ),
    );
    const stored = Captions.safeParse(jsonField(set.fields, 'Caption JSON', null));
    if (stored.success) {
      const merged = { ...stored.data, [channel]: run.data[channel] } as CaptionsT;
      await updateOne(T.captionSets, set.id, {
        'Caption JSON': toJson(merged),
        Warnings: toJson(setWarnings(merged)),
        'Regen Scope': channel,
        'Regen Notes': notes,
        Updated: nowIso(),
      });
    }
    await setProjectStatus(
      project,
      project.status,
      `${CHANNEL_SPECS[channel].label} captions rewritten (${created.length} posts).`,
    );
    await activity({
      event: 'captions_channel_regenerated',
      projectId: project.id,
      details: { channel, posts: created.length, notes: notes ?? null },
    });
    return { set_id: set.id, channel, posts: created.length };
  },

  async onFailed(job, message) {
    const parsed = GeneratePayload.safeParse(job.payload);
    if (!parsed.success) return;
    const project = await loadProject(parsed.data.project_id);
    if (project)
      await setProjectStatus(project, project.status, `Social captions failed: ${message}`);
  },
};
