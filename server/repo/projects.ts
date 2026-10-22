// Project reads and writes on Airtable.
import type { Project, ProjectDetail, Topic } from '../../src/types/api.js';
import {
  type AtRecord,
  byIds,
  createOne,
  eq,
  get,
  link,
  list,
  lit,
  nowIso,
  str,
  T,
  updateOne,
} from '../airtable.js';
import { activity } from '../log.js';
import {
  toBlogVersion,
  toCaptionSet,
  toContentItem,
  toJob,
  toProject,
  toProjectTranscript,
  toProjectVideo,
  toScriptVersion,
  toTopic,
} from '../mappers.js';
import { titleSlug } from '../paths.js';

export async function listProjects(): Promise<Project[]> {
  const rows = await list(T.projects, { sort: [{ field: 'Created', direction: 'desc' }] });
  return rows.map(toProject);
}

export async function loadProject(id: string): Promise<Project | null> {
  const rec = await get(T.projects, id);
  return rec ? toProject(rec) : null;
}

export async function projectDetail(id: string): Promise<ProjectDetail | null> {
  const rec = await get(T.projects, id);
  if (!rec) return null;
  const scriptIds = (rec.fields['Script Versions'] as string[] | undefined) ?? [];
  const blogIds = (rec.fields['Blog Versions'] as string[] | undefined) ?? [];
  const setIds = (rec.fields['Caption Sets'] as string[] | undefined) ?? [];
  const jobIds = (rec.fields['Jobs'] as string[] | undefined) ?? [];
  const topicId = (rec.fields['Topic'] as string[] | undefined)?.[0];
  const transcriptIds = (rec.fields['Transcripts'] as string[] | undefined) ?? [];
  const [scripts, blogs, sets, jobs, topicRec, videos, transcripts] = await Promise.all([
    scriptIds.length ? list(T.scriptVersions, { filterByFormula: byIds(scriptIds) }) : [],
    blogIds.length ? list(T.blogVersions, { filterByFormula: byIds(blogIds) }) : [],
    setIds.length ? list(T.captionSets, { filterByFormula: byIds(setIds) }) : [],
    // Newest links are last; enough to cover every pipeline step's latest run.
    jobIds.length ? list(T.jobs, { filterByFormula: byIds(jobIds.slice(-60)) }) : [],
    topicId ? get(T.topics, topicId) : null,
    list(T.assets, { filterByFormula: eq('Current', true) }),
    transcriptIds.length ? list(T.transcripts, { filterByFormula: byIds(transcriptIds) }) : [],
  ]);
  const socialSets = sets.filter((s) => (s.fields['Kind'] ?? 'social') === 'social');
  const kindSets = [
    socialSets,
    ...['youtube', 'cta', 'poll'].map((k) => sets.filter((s) => s.fields['Kind'] === k)),
  ];
  // One query for the live posts of all four sets (was one query per set).
  const itemIds = kindSets.flatMap(
    (ss) => (newestLive(ss)?.fields['Content Items'] as string[] | undefined) ?? [],
  );
  const itemRows: AtRecord[] = [];
  for (let i = 0; i < itemIds.length; i += 50)
    itemRows.push(
      ...(await list(T.contentItems, { filterByFormula: byIds(itemIds.slice(i, i + 50)) })),
    );
  const topic = topicRec ? toTopic(topicRec) : null;
  const scoreRec = topic?.latest_score_id ? await get(T.topicScores, topic.latest_score_id) : null;
  return {
    ...toProject(rec),
    topic: topic && {
      source: topic.source,
      status: topic.status,
      score_total: topic.score_total,
      score_max: topic.score_max,
      regenerated_from: topic.regenerated_from,
      created_at: topic.created_at,
      scored_at: scoreRec
        ? ((scoreRec.fields['Created'] as string | undefined) ?? scoreRec.createdTime)
        : null,
    },
    scripts: scripts.map(toScriptVersion).sort((a, b) => b.version - a.version),
    blogs: blogs.map(toBlogVersion).sort((a, b) => b.version - a.version),
    captions: captionsOf(socialSets, itemRows),
    youtube: captionsOf(
      sets.filter((s) => s.fields['Kind'] === 'youtube'),
      itemRows,
    ),
    ctas: captionsOf(
      sets.filter((s) => s.fields['Kind'] === 'cta'),
      itemRows,
    ),
    polls: captionsOf(
      sets.filter((s) => s.fields['Kind'] === 'poll'),
      itemRows,
    ),
    jobs: jobs.map(toJob).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    videos: videos.filter((v) => link(v.fields, 'Project') === id).map(toProjectVideo),
    // The newest transcript per video.
    transcripts: [
      ...new Map(
        [...transcripts]
          .sort((a, b) =>
            (str(a.fields, 'Requested At') ?? '').localeCompare(
              str(b.fields, 'Requested At') ?? '',
            ),
          )
          .map((r) => [str(r.fields, 'Role') ?? '', toProjectTranscript(r)] as const),
      ).values(),
    ],
  };
}

const CHANNEL_ORDER = [
  'linkedin',
  'linkedin_carousel',
  'instagram',
  'twitter',
  'facebook',
  'pinterest',
  'threads',
  'reels_tiktok',
];
const POST_ORDER = ['long_video', 'image', 'video_1', 'video_2', 'video_3'];

const newestLive = (sets: AtRecord[]): AtRecord | undefined =>
  sets
    .map((rec) => ({ rec, set: toCaptionSet(rec) }))
    .filter((s) => s.set.status !== 'superseded')
    .sort((a, b) => b.set.version - a.set.version)[0]?.rec;

/** The newest non-superseded caption set and its live posts, in prompt order. */
function captionsOf(sets: AtRecord[], rows: AtRecord[]): ProjectDetail['captions'] {
  const current = newestLive(sets);
  if (!current) return { set: null, items: [], versions: sets.length };
  const ids = new Set((current.fields['Content Items'] as string[] | undefined) ?? []);
  const items = rows
    .filter((r) => ids.has(r.id))
    .map(toContentItem)
    .filter((i) => i.status !== 'superseded')
    .sort(
      (a, b) =>
        CHANNEL_ORDER.indexOf(a.channel ?? '') - CHANNEL_ORDER.indexOf(b.channel ?? '') ||
        POST_ORDER.indexOf(a.post ?? '') - POST_ORDER.indexOf(b.post ?? ''),
    );
  return { set: toCaptionSet(current), items, versions: sets.length };
}

/** F5.1: one project per selected topic. `cycleMonth` is "YYYY-MM-01". */
export async function createProjectForTopic(
  topic: Topic,
  cycleMonth: string,
  actorId: string | null,
): Promise<Project> {
  const sameMonth = await list(T.projects, {
    filterByFormula: `DATETIME_FORMAT({Cycle Month},'YYYY-MM-DD')=${lit(cycleMonth)}`,
    fields: ['Sequence'],
  });
  const sequence =
    Math.max(0, ...sameMonth.map((r) => (r.fields['Sequence'] as number | undefined) ?? 0)) + 1;
  const template = (
    await list(T.scheduleTemplates, { filterByFormula: eq('Default', true), maxRecords: 1 })
  )[0];
  const now = nowIso();
  const rec = await createOne(T.projects, {
    Title: topic.title,
    'Cycle Month': cycleMonth,
    Sequence: sequence,
    Slug: titleSlug(topic.title),
    Status: 'selected',
    'Status Detail': 'Creating the Dropbox folder…',
    Topic: [topic.id],
    Created: now,
    Updated: now,
    ...(template ? { 'Schedule Template': [template.id] } : {}),
    ...(actorId ? { 'Created By': [actorId] } : {}),
  });
  const project = toProject(rec);
  await activity({
    event: 'project_created',
    projectId: project.id,
    topicId: topic.id,
    actorId,
    details: { sequence },
  });
  return project;
}

export async function setProjectStatus(
  project: Project,
  status: Project['status'],
  detail: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await updateOne(T.projects, project.id, {
    Status: status,
    'Status Detail': detail,
    Updated: nowIso(),
    ...extra,
  });
  if (status !== project.status) {
    await activity({
      event: 'project_status_changed',
      projectId: project.id,
      details: { from: project.status, to: status },
    });
  }
}
