// Topic reads and writes on Airtable. Inserting topics replaces the old DB triggers: it numbers
// them, flags likely duplicates (F2.4), logs, and queues scoring for new ones.
import type { Topic, TopicScore } from '../../src/types/api.js';
import {
  and,
  type AtRecord,
  byIds,
  create,
  destroy,
  eq,
  get,
  isIn,
  jsonField,
  list,
  nowIso,
  T,
  toJson,
  update,
  updateOne,
} from '../airtable.js';
import { enqueue } from '../jobs/queue.js';
import { activity } from '../log.js';
import { toTopic, toTopicScore } from '../mappers.js';
import { findDuplicate } from '../topics.js';

export async function listTopics(): Promise<Topic[]> {
  const records = await list(T.topics, { sort: [{ field: 'Created', direction: 'desc' }] });
  const scoreIds = records
    .map((r) => (r.fields['Latest Score'] as string[] | undefined)?.[0])
    .filter((id): id is string => !!id);
  const scores = new Map<string, TopicScore>();
  // Formula length limits: fetch the latest scores in chunks.
  for (let i = 0; i < scoreIds.length; i += 50) {
    for (const r of await list(T.topicScores, {
      filterByFormula: byIds(scoreIds.slice(i, i + 50)),
      fields: ['Total', 'Passed', 'Recommendation', 'Created', 'Topic'],
    })) {
      scores.set(r.id, toTopicScore(r));
    }
  }
  // Topics with a rewrite in progress (automatic or "Regenerate from suggestions").
  const pending = await list(T.jobs, {
    filterByFormula: and(eq('Type', 'regenerate_topic'), isIn('Status', ['queued', 'running'])),
    fields: ['Payload'],
  });
  const regenerating = new Set(
    pending.map((j) => jsonField<{ topic_id?: string }>(j.fields, 'Payload', {}).topic_id),
  );
  return records.map((r) => {
    const id = (r.fields['Latest Score'] as string[] | undefined)?.[0];
    return { ...toTopic(r, id ? scores.get(id) : null), regenerating: regenerating.has(r.id) };
  });
}

export async function loadTopic(id: string): Promise<Topic | null> {
  const rec = await get(T.topics, id);
  return rec ? toTopic(rec) : null;
}

export async function topicScores(topicId: string): Promise<TopicScore[]> {
  const rec = await get(T.topics, topicId);
  const ids = (rec?.fields['Topic Scores'] as string[] | undefined) ?? [];
  if (!ids.length) return [];
  const rows = await list(T.topicScores, { filterByFormula: byIds(ids) });
  return rows.map(toTopicScore).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface NewTopic {
  title: string;
  description?: string | null;
  category?: string | null;
  owner_notes?: string | null;
  source: Topic['source'];
  source_detail?: Record<string, unknown>;
  /** 'new' queues scoring; regenerations are inserted as 'scoring' with their score attached. */
  status?: 'new' | 'scoring';
  regenerated_from?: string | null;
  regeneration_notes?: string | null;
  submitted_by?: string | null;
}

/** Inserts topics, numbering them and flagging duplicates. Returns the created topics. */
export async function insertTopics(
  rows: NewTopic[],
  actorId: string | null = null,
): Promise<Topic[]> {
  if (!rows.length) return [];
  const existing = await list(T.topics, { fields: ['Title', 'Topic Number', 'Created'] });
  let next =
    Math.max(0, ...existing.map((r) => (r.fields['Topic Number'] as number | undefined) ?? 0)) + 1;
  const pool = existing.map((r) => ({
    id: r.id,
    title: (r.fields['Title'] as string | undefined) ?? '',
    created_at: (r.fields['Created'] as string | undefined) ?? r.createdTime,
  }));
  const now = nowIso();

  const created = await create(
    T.topics,
    rows.map((t) => {
      // Regenerations point at their original on purpose; they aren't duplicates.
      const dup = t.regenerated_from ? null : findDuplicate(t.title, pool, new Date());
      pool.push({ id: '', title: t.title, created_at: now });
      return {
        Title: t.title,
        'Topic Number': next++,
        Description: t.description ?? undefined,
        Category: t.category ?? undefined,
        'Owner Notes': t.owner_notes ?? undefined,
        Source: t.source,
        'Source Detail': toJson(t.source_detail ?? {}),
        Status: t.status ?? 'new',
        'Regeneration Notes': t.regeneration_notes ?? undefined,
        Created: now,
        Updated: now,
        ...(dup?.id ? { 'Duplicate Of': [dup.id] } : {}),
        ...(t.regenerated_from ? { 'Regenerated From': [t.regenerated_from] } : {}),
        ...(t.submitted_by ? { 'Submitted By': [t.submitted_by] } : {}),
      };
    }),
  );

  for (const rec of created) {
    const topic = toTopic(rec);
    await activity({
      event: 'topic_created',
      topicId: topic.id,
      actorId,
      details: { source: topic.source, topic_number: topic.topic_number },
    });
    if (topic.status === 'new') {
      await enqueue(
        'score_topic',
        { topic_id: topic.id },
        { dedupeKey: `score_topic:${topic.id}`, maxAttempts: 2 },
      );
    }
  }
  return created.map((r) => toTopic(r));
}

/** Status change with its activity entry (replaces the log_topic_status_change trigger). */
export async function setTopicStatus(
  topic: Topic,
  status: Topic['status'],
  extra: Record<string, unknown> = {},
  actorId: string | null = null,
): Promise<void> {
  await updateOne(T.topics, topic.id, { Status: status, Updated: nowIso(), ...extra });
  if (status !== topic.status) {
    await activity({
      event: 'topic_status_changed',
      topicId: topic.id,
      actorId,
      details: { from: topic.status, to: status },
    });
  }
}

const ids = (r: AtRecord | null, field: string) =>
  ((r?.fields[field] as string[] | undefined) ?? []).filter(Boolean);

/**
 * Deletes a topic, its scores and (if selected) its project with every generated record:
 * script / blog versions, caption sets and their content items. Queued or running jobs for it
 * are cancelled first. Dropbox files, the Activity Log, Approvals and the Usage Log are kept.
 */
export async function deleteTopicCascade(topic: AtRecord) {
  const projects = await Promise.all(ids(topic, 'Projects').map((id) => get(T.projects, id)));
  const live = projects.filter((p): p is AtRecord => !!p);

  // Stop work in flight: the project's jobs, and the topic's own scoring / rewrite jobs.
  const keys = [`score_topic:${topic.id}`, `regenerate_topic:${topic.id}`];
  // Formulas can't match linked records by ID, so filter the (few) pending jobs here.
  const pending = await list(T.jobs, {
    filterByFormula: isIn('Status', ['queued', 'running']),
    fields: ['Status', 'Project', 'Dedupe Key'],
  });
  const toCancel = pending.filter(
    (j) =>
      keys.includes(String(j.fields['Dedupe Key'] ?? '')) ||
      live.some((p) => ((j.fields['Project'] as string[] | undefined) ?? []).includes(p.id)),
  );
  await update(
    T.jobs,
    toCancel.map((j) => ({
      id: j.id,
      fields: { Status: 'cancelled', 'Last Error': 'Topic deleted', Updated: nowIso() },
    })),
  );

  let items: string[] = [];
  const sets: string[] = [];
  const scripts: string[] = [];
  const blogs: string[] = [];
  for (const p of live) {
    scripts.push(...ids(p, 'Script Versions'));
    blogs.push(...ids(p, 'Blog Versions'));
    sets.push(...ids(p, 'Caption Sets'));
    items.push(...ids(p, 'Content Items'));
  }
  for (const setId of sets) items.push(...ids(await get(T.captionSets, setId), 'Content Items'));
  items = [...new Set(items)];

  await destroy(T.contentItems, items);
  await destroy(T.captionSets, sets);
  await destroy(T.scriptVersions, scripts);
  await destroy(T.blogVersions, blogs);
  await destroy(
    T.projects,
    live.map((p) => p.id),
  );
  const scores = ids(topic, 'Topic Scores');
  await destroy(T.topicScores, scores);
  await destroy(T.topics, [topic.id]);
  return {
    scores: scores.length,
    projects: live.length,
    scripts: scripts.length,
    blogs: blogs.length,
    caption_sets: sets.length,
    content_items: items.length,
    jobs_cancelled: toCancel.length,
    dropbox_folders_kept: live.map((p) => p.fields['Dropbox Folder Path']).filter(Boolean),
  };
}
