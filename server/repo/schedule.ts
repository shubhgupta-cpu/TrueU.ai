// Scheduled posts: the 15-day plan built from the default Schedule Template (docs/publishing-schedule.md).
import { contentKey } from '../publish-map.js';
import { buildSchedule, localToUtc, type SlotDef } from '../../src/lib/schedule.js';
import type { ScheduleView } from '../../src/types/api.js';
import {
  type AtRecord,
  create,
  destroy,
  first,
  get,
  link,
  list,
  nowIso,
  num,
  str,
  T,
  updateOne,
  bool,
  eq,
} from '../airtable.js';
import { activity } from '../log.js';
import { toScheduledPost } from '../mappers.js';
import { getSettings } from '../settings.js';
import { HttpError } from '../http.js';
import { loadProject } from './projects.js';

/** Posts in these states are already with Metricool; rebuilding them needs an explicit confirmation (not built yet). */
const LIVE = ['sent', 'scheduled', 'published'];

async function defaultSlots(): Promise<SlotDef[]> {
  const tpl = await first(T.scheduleTemplates, { filterByFormula: eq('Default', true) });
  if (!tpl) throw new HttpError(409, 'No default schedule template. Run npm run airtable:seed.');
  return (await list(T.scheduleSlots, { sort: [{ field: 'Sort Order', direction: 'asc' }] }))
    .filter((r) => link(r.fields, 'Template') === tpl.id)
    .map((r) => ({
      id: r.id,
      asset_role: str(r.fields, 'Asset Role'),
      platform: str(r.fields, 'Platform') ?? 'other',
      day: num(r.fields, 'Day Number') ?? 1,
      local_time: str(r.fields, 'Local Time') ?? '09:00',
      window_end: str(r.fields, 'Window End'),
      allow_best_time: bool(r.fields, 'Allow Best Time'),
      media_type: str(r.fields, 'Media Type') ?? 'video',
      notes: str(r.fields, 'Notes'),
    }));
}

export async function scheduleView(projectId?: string): Promise<ScheduleView> {
  const [{ timezone }, posts, projects, items, assets] = await Promise.all([
    getSettings(['timezone']),
    list(T.scheduledPosts, { sort: [{ field: 'Scheduled At', direction: 'asc' }] }),
    list(T.projects, { fields: ['Title'] }),
    list(T.contentItems, { filterByFormula: `{Status}!="superseded"` }),
    list(T.assets, { filterByFormula: eq('Current', true) }),
  ]);
  /** Why a post can't go out yet (shown in the editor); null = ready. */
  const blockedReason = (r: AtRecord): string | null => {
    const key = contentKey(str(r.fields, 'Platform') ?? '', str(r.fields, 'Asset Role'));
    if (!key) return null;
    const project = link(r.fields, 'Project');
    const item = items.find(
      (i) =>
        link(i.fields, 'Project') === project &&
        str(i.fields, 'Channel') === key.channel &&
        str(i.fields, 'Post') === key.post,
    );
    if (!item) return 'No caption generated yet';
    if (str(item.fields, 'Status') !== 'approved') return 'Caption not approved yet';
    const asset = assets.find(
      (a) =>
        link(a.fields, 'Project') === project &&
        str(a.fields, 'Role') === str(r.fields, 'Asset Role'),
    );
    if (!asset) return 'Video not found in Dropbox yet';
    return str(asset.fields, 'Settled At') ? null : 'Video still uploading';
  };
  const titles = new Map(projects.map((p) => [p.id, str(p.fields, 'Title') ?? '(untitled)']));
  return {
    timezone,
    posts: posts
      .filter((r) => r.fields['Project'] && (!projectId || link(r.fields, 'Project') === projectId))
      .map((r) =>
        toScheduledPost(
          r,
          titles.get(link(r.fields, 'Project') ?? '') ?? '(deleted project)',
          timezone,
          blockedReason(r),
        ),
      ),
  };
}

/** Replaces the project's unsent posts with a fresh plan starting on `day1` (a local 'YYYY-MM-DD'). */
export async function buildProjectSchedule(
  projectId: string,
  day1: string,
  actor: string | null,
  weeks = 2,
): Promise<number> {
  const project = await loadProject(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  const [{ timezone }, slots, existing] = await Promise.all([
    getSettings(['timezone']),
    defaultSlots(),
    list(T.scheduledPosts),
  ]);
  const mine = existing.filter((r) => link(r.fields, 'Project') === projectId);
  if (mine.some((r) => LIVE.includes(str(r.fields, 'Publish Status') ?? ''))) {
    throw new HttpError(
      409,
      'Some posts are already sent to Metricool; changing Day 1 for them is not built yet.',
    );
  }
  const planned = buildSchedule(slots, day1, timezone, weeks);
  await destroy(
    T.scheduledPosts,
    mine.map((r) => r.id),
  );
  await create(
    T.scheduledPosts,
    planned.map((p) => ({
      Name: `Day ${p.day} · ${p.asset_role ?? 'project'} · ${p.platform}${p.notes?.startsWith('soft') ? ' (optional)' : ''}`,
      Project: [projectId],
      ...(p.asset_role ? { 'Asset Role': p.asset_role } : {}),
      Platform: p.platform,
      'Day Number': p.day,
      'Scheduled At': p.scheduled_at,
      'Use Best Time': p.allow_best_time,
      'Publish Status': 'planned',
      Created: nowIso(),
      Updated: nowIso(),
    })),
  );
  await activity({
    event: 'schedule_built',
    projectId,
    actorId: actor,
    details: { day1, posts: planned.length },
  });
  return planned.length;
}

/** The owner moves one post to a local date and time ('YYYY-MM-DDTHH:mm' in settings.timezone). */
export async function setPostTime(id: string, local: string, actor: string | null): Promise<void> {
  const post = await get(T.scheduledPosts, id);
  if (!post) throw new HttpError(404, 'Post not found');
  const status = str(post.fields, 'Publish Status') ?? 'planned';
  if (!['planned', 'failed'].includes(status)) {
    throw new HttpError(409, 'This post was already sent. Changing a sent post is not built yet.');
  }
  const { timezone } = await getSettings(['timezone']);
  const [date, time] = local.split('T') as [string, string];
  await updateOne(T.scheduledPosts, id, {
    'Scheduled At': localToUtc(date, time, timezone),
    'Custom Time': true,
    'Publish Status': 'planned',
    'Last Error': null,
    Updated: nowIso(),
  });
  await activity({
    event: 'post_time_changed',
    projectId: link(post.fields, 'Project'),
    actorId: actor,
    details: { post: id, local },
  });
}
