// CTAs & hooks (cta_generate) and Yes/No polls (poll_generate), generated after the blog is
// approved. Each run is a Caption Set (kind "cta" / "poll") with Content Items: one per CTA
// platform group (7) or one per poll (5). Regenerating makes a new set; earlier items are superseded.
import { z } from 'zod';
import {
  create,
  createOne,
  type Fields,
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
import { loadProject, setProjectStatus } from '../repo/projects.js';
import { loadTopic } from '../repo/topics.js';
import { Blog } from '../schemas/blog.js';
import {
  CTA_GROUPS,
  Ctas,
  ctaWarnings,
  extrasInput,
  fieldLabel,
  Polls,
  pollWarnings,
} from '../schemas/extras.js';
import { Script } from '../schemas/script.js';
import { getSettings } from '../settings.js';
import { blogVersions } from './blog.js';
import { captionSets, type SetKind, setItems } from './captions.js';
import type { JobHandler } from './handlers.js';
import { scriptVersions } from './projects.js';
import { PermanentJobError } from './rules.js';
import { payload } from './topics.js';

const Payload = z.object({ project_id: z.string().min(1), notes: z.string().optional() });

async function context(projectId: string) {
  const project = await loadProject(projectId);
  if (!project) throw new PermanentJobError(`Project ${projectId} not found`);
  const script = (await scriptVersions(project.id)).find(
    (r) => str(r.fields, 'Status') === 'approved',
  );
  const blog = (await blogVersions(project.id)).find((r) => str(r.fields, 'Status') === 'approved');
  if (!script || !blog) throw new PermanentJobError('Approve the script and the blog first.');
  const scriptJson = Script.safeParse(jsonField(script.fields, 'Script JSON', null)).data;
  if (!scriptJson)
    throw new PermanentJobError('The approved script has no readable Script JSON in Airtable');
  const topic = project.topic_id ? await loadTopic(project.topic_id) : null;
  const { blog_url, lead_magnet } = await getSettings(['blog_url', 'lead_magnet'] as const);
  const ym = (project.cycle_month ?? '').slice(0, 7).replace('-', '') || '000000';
  const inputs = extrasInput({
    topicTitle: topic?.title ?? project.title,
    category: topic?.category ?? null,
    script: scriptJson,
    blog: Blog.safeParse(jsonField(blog.fields, 'Blog JSON', null)).data ?? null,
    videoId: `vid${ym}${String(project.sequence ?? 0).padStart(2, '0')}0`,
    blogUrlTemplate: blog_url,
    leadMagnet: lead_magnet,
    icpSegment: '',
  });
  return { project, inputs };
}

/** Supersedes the current set of this kind, then creates a new set with its items. */
async function replaceSet(args: {
  kind: SetKind;
  projectId: string;
  projectTitle: string;
  label: string;
  json: unknown;
  inputs: unknown;
  notes?: string;
  prompt: { key: string; version: number };
  items: Fields[];
}) {
  const sets = await captionSets(args.projectId, args.kind);
  for (const old of sets.filter((s) => str(s.fields, 'Status') !== 'superseded')) {
    const items = await setItems(old);
    await update(
      T.contentItems,
      items.map((i) => ({ id: i.id, fields: { Status: 'superseded', Updated: nowIso() } })),
    );
    await updateOne(T.captionSets, old.id, { Status: 'superseded', Updated: nowIso() });
  }
  const version = (num(sets[0]?.fields ?? {}, 'Version') ?? 0) + 1;
  const now = nowIso();
  const set = await createOne(T.captionSets, {
    Name: `${args.projectTitle} · ${args.label} v${version}`,
    Kind: args.kind,
    Project: [args.projectId],
    Version: version,
    Status: 'draft',
    'Caption JSON': toJson(args.json),
    Warnings: toJson([]),
    Inputs: toJson(args.inputs),
    'Regen Scope': 'all',
    'Regen Notes': args.notes,
    'Prompt Key': args.prompt.key,
    'Prompt Version': args.prompt.version,
    Created: now,
    Updated: now,
  });
  const created = await create(
    T.contentItems,
    args.items.map((f) => ({
      ...f,
      Version: version,
      'Prompt Key': args.prompt.key,
      'Prompt Version': args.prompt.version,
      Project: [args.projectId],
      'Caption Set': [set.id],
      Created: now,
      Updated: now,
    })),
  );
  return {
    set,
    version,
    flagged: created.filter((c) => c.fields['Status'] === 'needs_edit').length,
    count: created.length,
  };
}

async function failed(job: { payload: unknown }, what: string, message: string) {
  const parsed = Payload.safeParse(job.payload);
  if (!parsed.success) return;
  const project = await loadProject(parsed.data.project_id);
  if (project) await setProjectStatus(project, project.status, `${what} failed: ${message}`);
}

export const generateCtas: JobHandler = {
  async run(job) {
    const { project_id, notes } = payload(Payload, job.payload);
    const { project, inputs } = await context(project_id);
    const run = await runPrompt('cta_generate', { ...inputs.cta, notes: notes ?? '' }, Ctas, {
      jobId: job.id,
      projectId: project.id,
    });
    const items = CTA_GROUPS.map(({ key, label, main }) => {
      const fields = run.data.ctas[key] as Record<string, string>;
      const warnings = ctaWarnings(key, fields);
      return {
        Name: `CTA · ${label}`,
        Channel: 'cta',
        'CTA Group': key,
        Title: fields[main],
        Caption: Object.entries(fields)
          .map(([k, v]) => `${fieldLabel(k)}: ${v}`)
          .join('\n'),
        Extra: toJson(fields),
        Status: warnings.length ? 'needs_edit' : 'draft',
        Validation: toJson(warnings),
      };
    });
    const r = await replaceSet({
      kind: 'cta',
      projectId: project.id,
      projectTitle: project.title,
      label: 'CTAs',
      json: run.data,
      inputs: inputs.cta,
      notes,
      prompt: run.prompt,
      items,
    });
    if (run.data.lead_magnet_match) {
      await updateOne(T.captionSets, r.set.id, {
        Warnings: toJson([]),
        Inputs: toJson({ ...inputs.cta, lead_magnet_match: run.data.lead_magnet_match }),
      });
    }
    const fresh = await loadProject(project.id);
    if (fresh)
      await setProjectStatus(
        fresh,
        fresh.status,
        `CTAs & hooks v${r.version} ready for review (7 platforms${r.flagged ? `, ${r.flagged} need a look` : ''}).`,
      );
    await activity({
      event: 'ctas_generated',
      projectId: project.id,
      details: { version: r.version, flagged: r.flagged, notes: notes ?? null },
    });
    return { set_id: r.set.id, version: r.version, flagged: r.flagged };
  },
  onFailed: (job, message) => failed(job, 'CTAs & hooks', message),
};

export const generatePolls: JobHandler = {
  async run(job) {
    const { project_id, notes } = payload(Payload, job.payload);
    const { project, inputs } = await context(project_id);
    const run = await runPrompt('poll_generate', { ...inputs.poll, notes: notes ?? '' }, Polls, {
      jobId: job.id,
      projectId: project.id,
    });
    const items = run.data.polls.map((p, i) => {
      const warnings = pollWarnings(p, run.data.polls);
      return {
        Name: `Poll ${i + 1}`,
        Channel: 'poll',
        Occurrence: i + 1,
        Title: p.category,
        Caption: p.question,
        Extra: toJson({
          expected_split: p.expected_split,
          why_engaging: p.why_engaging,
          platform_note: p.platform_note,
        }),
        Status: warnings.length ? 'needs_edit' : 'draft',
        Validation: toJson(warnings),
      };
    });
    const r = await replaceSet({
      kind: 'poll',
      projectId: project.id,
      projectTitle: project.title,
      label: 'polls',
      json: run.data,
      inputs: inputs.poll,
      notes,
      prompt: run.prompt,
      items,
    });
    const fresh = await loadProject(project.id);
    if (fresh)
      await setProjectStatus(
        fresh,
        fresh.status,
        `Polls v${r.version} ready for review (5 questions${r.flagged ? `, ${r.flagged} need a look` : ''}).`,
      );
    await activity({
      event: 'polls_generated',
      projectId: project.id,
      details: { version: r.version, flagged: r.flagged, notes: notes ?? null },
    });
    return { set_id: r.set.id, version: r.version, flagged: r.flagged };
  },
  onFailed: (job, message) => failed(job, 'Polls', message),
};
