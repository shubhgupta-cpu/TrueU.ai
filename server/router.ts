// The whole HTTP API in one router (one Vercel function: api/index.ts). Every route checks the
// caller itself; secrets never leave the server (CLAUDE.md rule 2).
import { z } from 'zod';
import type { Json, Profile } from '../src/types/api.js';
import {
  type AtRecord,
  and,
  create,
  createOne,
  destroy,
  eq,
  get,
  link,
  list,
  nowIso,
  num,
  str,
  T,
  toJson,
  update,
  updateOne,
} from './airtable.js';
import {
  afterFailure,
  clearedCookie,
  createSessionToken,
  currentUser,
  findUserByEmail,
  loginAttempt,
  requireCron,
  requireUser,
  sessionCookie,
  verifyPassword,
} from './auth.js';
import { callPrompt, preparePrompt, validateOutput } from './claude.js';
import { monthlyTopicsRunKey, weeklyTrendsRunKey } from './cron.js';
import { dropMemo } from './cache.js';
import { env } from './env.js';
import { errorMessage, HttpError, json, readBody } from './http.js';
import { blogVersions } from './jobs/blog.js';
import { setItems } from './jobs/captions.js';
import { scriptVersions } from './jobs/projects.js';
import {
  background,
  DuplicateJobError,
  enqueue,
  pendingJob,
  retryJob,
  sweep,
  sweepSoon,
} from './jobs/queue.js';
import { PermanentJobError } from './jobs/rules.js';
import { activity } from './log.js';
import { toJob, toPrompt, toSeedKeyword } from './mappers.js';
import { promptSpec } from './prompt-registry.js';
import {
  createProjectForTopic,
  listProjects,
  loadProject,
  projectDetail,
  setProjectStatus,
} from './repo/projects.js';
import { timingSafeEqual } from 'node:crypto';
import { applyCallback, queueDue } from './jobs/publish.js';
import { projectPreviews, videoLinkTarget } from './repo/previews.js';
import { temporaryLink } from './dropbox.js';
import { platformRules, templateSlots, updateSlot } from './repo/config.js';
import { integrationChecks } from './repo/integrations.js';
import {
  changeRole,
  createUser,
  listUsers,
  removeAccess,
  resetPassword,
  usageSummary,
} from './repo/admin.js';
import { buildProjectSchedule, scheduleView, setPostTime } from './repo/schedule.js';
import {
  deleteTopicCascade,
  insertTopics,
  listTopics,
  loadTopic,
  setTopicStatus,
  topicScores,
} from './repo/topics.js';
import { CHANNELS } from './schemas/captions.js';
import { YT_VIDEOS } from './schemas/youtube.js';
import { evaluationWarnings, type TopicEvaluation } from './schemas/topics.js';
import { allSettings, getSettings } from './settings.js';
import { localDate } from './topics.js';

type Params = Record<string, string>;
type Handler = (req: Request, params: Params, url: URL) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:([a-z_]+)/g, (_m, k: string) => {
      keys.push(k);
      return '([^/]+)';
    })}/?$`,
  );
  routes.push({ method, pattern, keys, handler });
}

/** Every script/blog decision is recorded in Approvals (F7.5) and the activity log. */
async function recordDecision(
  subject: 'script' | 'blog',
  projectId: string,
  version: AtRecord,
  decision: 'approved' | 'changes_requested' | 'rejected',
  notes: string | null,
  user: Profile,
): Promise<void> {
  const v = num(version.fields, 'Version');
  await createOne(T.approvals, {
    Name: `${subject === 'script' ? 'Script' : 'Blog'} v${v} · ${decision.replace('_', ' ')}`,
    'Subject Type': subject,
    'Subject ID': version.id,
    Decision: decision,
    Notes: notes,
    Via: 'app',
    'Decided Email': user.email,
    Project: [projectId],
    'Decided By': [user.id],
    Created: nowIso(),
  });
  await activity({
    event: `${subject}_${decision}`,
    projectId,
    actorId: user.id,
    details: { version: v, version_id: version.id, notes },
  });
}

/** Turns "already queued" into a 409 the UI can show as is. */
async function enqueueOr409(...args: Parameters<typeof enqueue>): Promise<string> {
  try {
    return await enqueue(...args);
  } catch (err) {
    if (err instanceof DuplicateJobError) throw new HttpError(409, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- auth

route('POST', '/api/auth/login', async (req) => {
  const { email, password } = await readBody(
    req,
    z.object({
      email: z.string().trim().email('Enter a valid email address'),
      password: z.string().min(1, 'Enter your password'),
    }),
  );
  const rec = await findUserByEmail(email);
  const hash = rec?.fields['Password Hash'];
  if (rec) {
    const lock = loginAttempt(
      {
        failed: num(rec.fields, 'Failed Logins') ?? 0,
        lockedUntil: str(rec.fields, 'Locked Until'),
      },
      Date.now(),
    );
    if (lock.locked) {
      throw new HttpError(
        429,
        `Too many wrong passwords. Try again in ${lock.minutes} minute${lock.minutes === 1 ? '' : 's'}.`,
      );
    }
  }
  // Same message either way: don't reveal which emails have accounts.
  if (!rec || typeof hash !== 'string' || !(await verifyPassword(password, hash))) {
    if (rec)
      await updateOne(
        T.users,
        rec.id,
        afterFailure(num(rec.fields, 'Failed Logins') ?? 0, Date.now()),
      );
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  await updateOne(T.users, rec.id, { 'Failed Logins': 0, 'Last Sign In': nowIso() });
  await activity({ event: 'user_signed_in', actorId: rec.id });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(createSessionToken(rec.id)) });
});

route('POST', '/api/auth/logout', async () =>
  json({ ok: true }, 200, { 'Set-Cookie': clearedCookie() }),
);

route('GET', '/api/auth/me', async (req) => json({ profile: await currentUser(req) }));

// ---------------------------------------------------------------- admin: users and usage

route('GET', '/api/admin/users', async (req) => {
  await requireUser(req, ['admin']);
  return json(await listUsers());
});

route('POST', '/api/admin/users', async (req) => {
  const admin = await requireUser(req, ['admin']);
  const v = await readBody(
    req,
    z.object({
      email: z.string().trim().email('Enter a valid email address'),
      role: z.enum(['admin', 'owner', 'editor']),
      full_name: z.string().trim().max(100).optional(),
    }),
  );
  // The password is shown once, here; only its hash is stored.
  return json(await createUser(v.email, v.role, v.full_name || null, admin.id), 201);
});

route('PATCH', '/api/admin/users/:id', async (req, { id }) => {
  const admin = await requireUser(req, ['admin']);
  const { role } = await readBody(req, z.object({ role: z.enum(['admin', 'owner', 'editor']) }));
  await changeRole(id!, role, admin.id);
  return json({ ok: true });
});

route('POST', '/api/admin/users/:id/revoke', async (req, { id }) => {
  const admin = await requireUser(req, ['admin']);
  await removeAccess(id!, admin.id);
  return json({ ok: true });
});

route('POST', '/api/admin/users/:id/reset-password', async (req, { id }) => {
  const admin = await requireUser(req, ['admin']);
  return json({ password: await resetPassword(id!, admin.id) });
});

route('GET', '/api/admin/integrations', async (req) => {
  await requireUser(req, ['admin']);
  return json(await integrationChecks());
});

route('GET', '/api/admin/platforms', async (req) => {
  await requireUser(req, ['admin']);
  return json(platformRules());
});

route('GET', '/api/admin/schedule-slots', async (req) => {
  await requireUser(req, ['admin']);
  return json(await templateSlots());
});

/** Changes one slot of the default plan. Applies to schedules built afterwards, not to existing ones. */
route('PATCH', '/api/admin/schedule-slots/:id', async (req, { id }) => {
  const user = await requireUser(req, ['admin']);
  const v = await readBody(
    req,
    z.object({
      local_time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 14:00')
        .optional(),
      day: z.number().int().min(1).max(15).optional(),
      asset_role: z.enum(['long_video', 'short_1', 'short_2', 'short_3']).optional(),
    }),
  );
  await updateSlot(id!, v, user.id);
  return json({ ok: true });
});

route('GET', '/api/admin/usage', async (req) => {
  await requireUser(req, ['admin']);
  return json(await usageSummary());
});

// ---------------------------------------------------------------- topics

route('GET', '/api/topics', async (req) => {
  await requireUser(req);
  sweepSoon();
  return json(await listTopics());
});

route('POST', '/api/topics', async (req) => {
  const user = await requireUser(req);
  const body = await readBody(
    req,
    z.object({
      title: z
        .string()
        .trim()
        .min(3, 'Title must be at least 3 characters')
        .max(120, 'Title must be 120 characters or fewer'),
      description: z.string().trim().max(2000).optional().nullable(),
      category: z.string().trim().optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    }),
  );
  if (body.category) {
    const { topic_categories } = await getSettings(['topic_categories'] as const);
    if (!topic_categories.includes(body.category))
      throw new HttpError(400, `Unknown category "${body.category}"`);
  }
  const [topic] = await insertTopics(
    [
      {
        title: body.title,
        description: body.description || null,
        category: body.category || null,
        owner_notes: body.notes || null,
        source: 'owner',
        submitted_by: user.id,
      },
    ],
    user.id,
  );
  return json(
    { id: topic!.id, topic_number: topic!.topic_number, duplicate_of: topic!.duplicate_of },
    201,
  );
});

route('GET', '/api/topics/:id/scores', async (req, { id }) => {
  await requireUser(req);
  return json(await topicScores(id!));
});

route('PATCH', '/api/topics/:id', async (req, { id }) => {
  const user = await requireUser(req);
  const body = await readBody(
    req,
    z.object({
      title: z.string().trim().min(3).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      owner_notes: z.string().trim().max(2000).nullable().optional(),
    }),
  );
  const topic = await loadTopic(id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  await updateOne(T.topics, topic.id, {
    ...(body.title !== undefined ? { Title: body.title } : {}),
    ...(body.description !== undefined ? { Description: body.description } : {}),
    ...(body.owner_notes !== undefined ? { 'Owner Notes': body.owner_notes } : {}),
    Updated: nowIso(),
  });
  await activity({ event: 'topic_edited', topicId: topic.id, actorId: user.id });
  return json({ ok: true });
});

route('POST', '/api/topics/:id/status', async (req, { id }) => {
  const user = await requireUser(req);
  const { status } = await readBody(req, z.object({ status: z.enum(['saved', 'rejected']) }));
  const topic = await loadTopic(id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  if (topic.status === 'selected')
    throw new HttpError(409, 'A selected topic already has a project.');
  await setTopicStatus(topic, status, { 'Selected For Month': null }, user.id);
  return json({ ok: true });
});

/** F4.4 + F5: select → project → setup_project (Dropbox) → generate_script → export_script. */
route('POST', '/api/topics/:id/select', async (req, { id }) => {
  const user = await requireUser(req);
  const topic = await loadTopic(id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  if (topic.project_id) return json({ project_id: topic.project_id }); // one project per topic
  if (!['qualified', 'needs_work', 'saved'].includes(topic.status)) {
    throw new HttpError(409, `A ${topic.status.replace('_', ' ')} topic can’t be selected.`);
  }
  const { timezone } = await getSettings(['timezone'] as const);
  const cycleMonth = `${localDate(new Date(), timezone).slice(0, 7)}-01`;

  const project = await createProjectForTopic(topic, cycleMonth, user.id);
  await setTopicStatus(topic, 'selected', { 'Selected For Month': cycleMonth }, user.id);
  await enqueue(
    'setup_project',
    { project_id: project.id },
    { dedupeKey: `setup_project:${project.id}`, projectId: project.id },
  );
  return json({ project_id: project.id }, 201);
});

route('POST', '/api/topics/:id/rescore', async (req, { id }) => {
  await requireUser(req);
  const topic = await loadTopic(id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  await enqueueOr409(
    'score_topic',
    { topic_id: topic.id },
    { dedupeKey: `score_topic:${topic.id}`, maxAttempts: 2 },
  );
  return json({ ok: true }, 202);
});

/** "Regenerate from suggestions": rewrite a below-threshold topic using its latest score's suggestions. */
route('POST', '/api/topics/:id/regenerate', async (req, { id }) => {
  const user = await requireUser(req);
  const topic = await loadTopic(id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  const { score_threshold } = await getSettings(['score_threshold'] as const);
  if (topic.score_total === null || !topic.latest_score_id)
    throw new HttpError(409, 'Score the topic first.');
  if (topic.score_total >= score_threshold) {
    throw new HttpError(
      409,
      `This topic already passes (${topic.score_total} ≥ ${score_threshold}).`,
    );
  }
  if (['new', 'scoring', 'selected'].includes(topic.status)) {
    throw new HttpError(409, `A ${topic.status} topic can’t be regenerated.`);
  }
  await enqueueOr409(
    'regenerate_topic',
    { topic_id: topic.id, manual: true },
    { dedupeKey: `regenerate_topic:${topic.id}`, maxAttempts: 2 },
  );
  await activity({ event: 'topic_regeneration_requested', topicId: topic.id, actorId: user.id });
  return json({ ok: true }, 202);
});

/** The latest "Generate with Claude" and "Pull trends" runs, so the Inbox can say what happened. */
route('GET', '/api/topics/jobs', async (req) => {
  await requireUser(req);
  const rows = await list(T.jobs, {
    filterByFormula: `OR({Type}="generate_topics",{Type}="pull_trends")`,
    sort: [{ field: 'Created', direction: 'desc' }],
    maxRecords: 10,
  });
  const jobs = rows.map(toJob);
  return json({
    generate_topics: jobs.find((j) => j.type === 'generate_topics') ?? null,
    pull_trends: jobs.find((j) => j.type === 'pull_trends') ?? null,
  });
});

/**
 * Delete a topic and everything generated for it in Airtable: its scores and, if it was selected,
 * its project (script, blog, captions, YouTube, CTA and poll records). Pending jobs are cancelled.
 * Dropbox files are NOT touched. History (Activity Log, Approvals, Usage Log) is kept.
 */
route('DELETE', '/api/topics/:id', async (req, { id }) => {
  const user = await requireUser(req);
  const topic = await get(T.topics, id!);
  if (!topic) throw new HttpError(404, 'Topic not found');
  const summary = await deleteTopicCascade(topic);
  await activity({
    event: 'topic_deleted',
    actorId: user.id,
    details: { topic_id: topic.id, title: topic.fields['Title'], ...summary },
  });
  return json({ ok: true, ...summary });
});

route('POST', '/api/topics/generate', async (req) => {
  await requireUser(req);
  await enqueueOr409('generate_topics', {}, { dedupeKey: 'generate_topics' });
  return json({ ok: true }, 202);
});

route('POST', '/api/topics/trends', async (req) => {
  await requireUser(req);
  await enqueueOr409('pull_trends', {}, { dedupeKey: 'pull_trends' });
  return json({ ok: true }, 202);
});

// ---------------------------------------------------------------- projects

route('GET', '/api/projects', async (req) => {
  await requireUser(req);
  sweepSoon();
  return json(await listProjects());
});

route('GET', '/api/projects/:id', async (req, { id }) => {
  await requireUser(req);
  const detail = await projectDetail(id!);
  if (!detail) throw new HttpError(404, 'Project not found');
  return json(detail);
});

route('GET', '/api/schedule', async (req) => {
  await requireUser(req);
  return json(await scheduleView());
});

route('GET', '/api/projects/:id/schedule', async (req, { id }) => {
  await requireUser(req);
  return json(await scheduleView(id!));
});

/** Builds (or rebuilds) the project's 15-day plan from Day 1, a local date. */
route('POST', '/api/projects/:id/schedule', async (req, { id }) => {
  const user = await requireUser(req);
  const { day1, weeks } = await readBody(
    req,
    z.object({
      day1: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      weeks: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
    }),
  );
  const posts = await buildProjectSchedule(id!, day1, user.id, weeks);
  return json({ ok: true, posts });
});

/** Where the editor's videos are, when it is not the folder the app created (empty clears it). */
route('PATCH', '/api/projects/:id/videos-folder', async (req, { id }) => {
  const user = await requireUser(req);
  const { path } = await readBody(
    req,
    z.object({
      path: z
        .string()
        .trim()
        .max(500)
        .refine((p) => p === '' || p.startsWith('/'), 'Start the path with /'),
    }),
  );
  await updateOne(T.projects, id!, {
    'Videos Folder Path': path === '' ? null : path.replace(/\/+$/, ''),
    Updated: nowIso(),
  });
  await activity({
    event: 'videos_folder_set',
    projectId: id!,
    actorId: user.id,
    details: { path },
  });
  await enqueueOr409(
    'scan_uploads',
    {},
    { dedupeKey: `scan_uploads:manual:${id}`, projectId: id! },
  );
  return json({ ok: true });
});

/** "Check Dropbox now": looks for the editor's videos right away instead of waiting for the 5-minute check. */
route('POST', '/api/projects/:id/scan', async (req, { id }) => {
  await requireUser(req);
  await enqueueOr409(
    'scan_uploads',
    {},
    { dedupeKey: `scan_uploads:manual:${id}`, projectId: id! },
  );
  return json({ ok: true }, 202);
});

route('GET', '/api/projects/:id/previews', async (req, { id }) => {
  await requireUser(req);
  return json(await projectPreviews(id!));
});

/** A short-lived streaming link for the preview player (the Dropbox file never leaves the server's account). */
route('GET', '/api/assets/:id/video', async (req, { id }) => {
  await requireUser(req);
  const fileId = await videoLinkTarget(id!);
  if (!fileId) throw new HttpError(404, 'Video not found');
  return json({ url: await temporaryLink(fileId) });
});

/** Moves one post to a chosen local date and time. */
route('PATCH', '/api/scheduled-posts/:id', async (req, { id }) => {
  const user = await requireUser(req);
  const { local } = await readBody(
    req,
    z.object({ local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }),
  );
  await setPostTime(id!, local, user.id);
  return json({ ok: true });
});

route('POST', '/api/projects/:id/setup', async (req, { id }) => {
  await requireUser(req);
  await enqueueOr409(
    'setup_project',
    { project_id: id! },
    { dedupeKey: `setup_project:${id}`, projectId: id! },
  );
  return json({ ok: true }, 202);
});

/** Regenerate (F6.3). With notes from the owner's review, the current version is marked "changes requested". */
route('POST', '/api/projects/:id/script', async (req, { id }) => {
  const user = await requireUser(req);
  const { notes } = await readBody(
    req,
    z.object({ notes: z.string().trim().max(4000).optional() }),
  );
  const project = await loadProject(id!);
  if (!project) throw new HttpError(404, 'Project not found');
  await enqueueOr409(
    'generate_script',
    { project_id: project.id, ...(notes ? { notes } : {}) },
    { dedupeKey: `generate_script:${project.id}`, projectId: project.id, maxAttempts: 2 },
  );
  const current = (await scriptVersions(project.id))[0];
  if (current && str(current.fields, 'Status') !== 'superseded') {
    await recordDecision('script', project.id, current, 'changes_requested', notes ?? null, user);
    await updateOne(T.scriptVersions, current.id, {
      Status: 'changes_requested',
      Updated: nowIso(),
    });
  }
  return json({ ok: true }, 202);
});

/** Approve a script version (F7.5, in-app): it becomes the final script; older ones are superseded. */
route('POST', '/api/scripts/:id/approve', async (req, { id }) => {
  const user = await requireUser(req);
  const rec = await get(T.scriptVersions, id!);
  if (!rec) throw new HttpError(404, 'Script version not found');
  const projectId = link(rec.fields, 'Project');
  const project = projectId ? await loadProject(projectId) : null;
  if (!project) throw new HttpError(404, 'Project not found');

  const all = await scriptVersions(project.id);
  if (all[0]?.id !== rec.id) throw new HttpError(409, 'Only the newest version can be approved.');
  const status = str(rec.fields, 'Status');
  if (status === 'approved') return json({ ok: true });
  if (!['draft', 'awaiting_approval'].includes(status ?? '')) {
    throw new HttpError(409, `A ${String(status).replace('_', ' ')} version can’t be approved.`);
  }
  if ((await pendingJob(`generate_script:${project.id}`)) !== null) {
    throw new HttpError(409, 'A new version is being written. Approve it once it’s ready.');
  }

  await updateOne(T.scriptVersions, rec.id, { Status: 'approved', Updated: nowIso() });
  await recordDecision('script', project.id, rec, 'approved', null, user);
  await setProjectStatus(
    project,
    'script_approved',
    `Script v${num(rec.fields, 'Version')} approved. Saving the final copy to Dropbox…`,
  );
  await enqueue(
    'on_script_approved',
    { version_id: rec.id },
    { dedupeKey: `on_script_approved:${rec.id}`, projectId: project.id },
  );
  return json({ ok: true });
});

route('POST', '/api/scripts/:id/export', async (req, { id }) => {
  await requireUser(req);
  await enqueueOr409('export_script', { version_id: id! }, { dedupeKey: `export_script:${id}` });
  return json({ ok: true }, 202);
});

// ---------------------------------------------------------------- blog (F9)

/** Loads a blog version with its project, and whether it's the newest one. */
async function blogContext(versionId: string) {
  const rec = await get(T.blogVersions, versionId);
  if (!rec) throw new HttpError(404, 'Blog version not found');
  const projectId = link(rec.fields, 'Project');
  const project = projectId ? await loadProject(projectId) : null;
  if (!project) throw new HttpError(404, 'Project not found');
  const newest = (await blogVersions(project.id))[0]?.id === rec.id;
  return { rec, project, newest, status: str(rec.fields, 'Status') };
}

/** Regenerate the blog (optionally with the owner's notes). Needs an approved script. */
route('POST', '/api/projects/:id/blog', async (req, { id }) => {
  const user = await requireUser(req);
  const { notes } = await readBody(
    req,
    z.object({ notes: z.string().trim().max(4000).optional() }),
  );
  const project = await loadProject(id!);
  if (!project) throw new HttpError(404, 'Project not found');
  const approvedScript = (await scriptVersions(project.id)).some(
    (r) => str(r.fields, 'Status') === 'approved',
  );
  if (!approvedScript)
    throw new HttpError(409, 'Approve the script first: the blog is written from it.');
  await enqueueOr409(
    'generate_blog',
    { project_id: project.id, ...(notes ? { notes } : {}) },
    { dedupeKey: `generate_blog:${project.id}`, projectId: project.id, maxAttempts: 2 },
  );
  const current = (await blogVersions(project.id))[0];
  if (current && str(current.fields, 'Status') === 'draft') {
    await recordDecision('blog', project.id, current, 'changes_requested', notes ?? null, user);
    await updateOne(T.blogVersions, current.id, { Status: 'changes_requested', Updated: nowIso() });
  }
  return json({ ok: true }, 202);
});

/** Approve the newest blog draft: it's then written to the topic's Blog_Script folder. */
route('POST', '/api/blogs/:id/approve', async (req, { id }) => {
  const user = await requireUser(req);
  const { rec, project, newest, status } = await blogContext(id!);
  if (status === 'approved') return json({ ok: true });
  if (!newest) throw new HttpError(409, 'Only the newest version can be approved.');
  if (status !== 'draft')
    throw new HttpError(409, `A ${String(status).replace('_', ' ')} blog can’t be approved.`);
  if ((await pendingJob(`generate_blog:${project.id}`)) !== null) {
    throw new HttpError(409, 'A new version is being written. Approve it once it’s ready.');
  }
  await updateOne(T.blogVersions, rec.id, { Status: 'approved', Updated: nowIso() });
  await recordDecision('blog', project.id, rec, 'approved', null, user);
  await setProjectStatus(
    project,
    project.status,
    `Blog v${num(rec.fields, 'Version')} approved. Saving it to Dropbox…`,
  );
  await enqueue(
    'on_blog_approved',
    { version_id: rec.id },
    { dedupeKey: `on_blog_approved:${rec.id}`, projectId: project.id },
  );
  return json({ ok: true });
});

/** Reject the newest blog draft without writing a new one (the owner can regenerate later). */
route('POST', '/api/blogs/:id/reject', async (req, { id }) => {
  const user = await requireUser(req);
  const { notes } = await readBody(
    req,
    z.object({ notes: z.string().trim().max(4000).optional() }),
  );
  const { rec, project, newest, status } = await blogContext(id!);
  if (!newest || status !== 'draft')
    throw new HttpError(409, 'Only the newest draft can be rejected.');
  await updateOne(T.blogVersions, rec.id, { Status: 'rejected', Updated: nowIso() });
  await recordDecision('blog', project.id, rec, 'rejected', notes ?? null, user);
  await setProjectStatus(
    project,
    project.status,
    `Blog v${num(rec.fields, 'Version')} rejected. Regenerate it when ready.`,
  );
  return json({ ok: true });
});

// ---------------------------------------------------------------- social captions (F10)

/** Approval records for posts, batched (one per post, subject content_item). */
async function recordItemDecisions(
  projectId: string,
  items: AtRecord[],
  decision: 'approved' | 'rejected',
  notes: string | null,
  user: Profile,
): Promise<void> {
  if (!items.length) return;
  await create(
    T.approvals,
    items.map((i) => ({
      Name: `${str(i.fields, 'Name') ?? 'Post'} · ${decision}`,
      'Subject Type': 'content_item',
      'Subject ID': i.id,
      Decision: decision,
      Notes: notes,
      Via: 'app',
      'Decided Email': user.email,
      Project: [projectId],
      'Decided By': [user.id],
      Created: nowIso(),
    })),
  );
  await activity({
    event: `content_items_${decision}`,
    projectId,
    actorId: user.id,
    details: { count: items.length, item_ids: items.map((i) => i.id), notes },
  });
}

/** Regenerate the captions: all channels (a new set) or one channel, with optional notes. */
route('POST', '/api/projects/:id/captions', async (req, { id }) => {
  await requireUser(req);
  const { notes, channel } = await readBody(
    req,
    z.object({
      notes: z.string().trim().max(4000).optional(),
      channel: z.enum(CHANNELS).optional(),
    }),
  );
  const project = await loadProject(id!);
  if (!project) throw new HttpError(404, 'Project not found');
  const approvedBlog = (await blogVersions(project.id)).some(
    (r) => str(r.fields, 'Status') === 'approved',
  );
  if (!approvedBlog)
    throw new HttpError(409, 'Approve the blog first: the captions are written after it.');
  await enqueueOr409(
    'generate_captions',
    { project_id: project.id, ...(notes ? { notes } : {}), ...(channel ? { channel } : {}) },
    { dedupeKey: `generate_captions:${project.id}`, projectId: project.id, maxAttempts: 2 },
  );
  return json({ ok: true }, 202);
});

/** Regenerate the YouTube metadata: all four videos (a new set) or one, with optional notes. */
route('POST', '/api/projects/:id/youtube', async (req, { id }) => {
  await requireUser(req);
  const { notes, video } = await readBody(
    req,
    z.object({
      notes: z.string().trim().max(4000).optional(),
      video: z.enum(YT_VIDEOS).optional(),
    }),
  );
  const project = await loadProject(id!);
  if (!project) throw new HttpError(404, 'Project not found');
  const approvedScript = (await scriptVersions(project.id)).some(
    (r) => str(r.fields, 'Status') === 'approved',
  );
  if (!approvedScript)
    throw new HttpError(409, 'Approve the script first: the YouTube metadata is written from it.');
  await enqueueOr409(
    'generate_youtube',
    { project_id: project.id, ...(notes ? { notes } : {}), ...(video ? { video } : {}) },
    { dedupeKey: `generate_youtube:${project.id}`, projectId: project.id, maxAttempts: 2 },
  );
  return json({ ok: true }, 202);
});

/** Regenerate CTAs & hooks or polls (a new set each time), with optional notes. */
for (const [path, type, what] of [
  ['ctas', 'generate_ctas', 'CTAs'],
  ['polls', 'generate_polls', 'polls'],
] as const) {
  route('POST', `/api/projects/:id/${path}`, async (req, { id }) => {
    await requireUser(req);
    const { notes } = await readBody(
      req,
      z.object({ notes: z.string().trim().max(4000).optional() }),
    );
    const project = await loadProject(id!);
    if (!project) throw new HttpError(404, 'Project not found');
    const approvedBlog = (await blogVersions(project.id)).some(
      (r) => str(r.fields, 'Status') === 'approved',
    );
    if (!approvedBlog)
      throw new HttpError(409, `Approve the blog first: the ${what} are written after it.`);
    await enqueueOr409(
      type,
      { project_id: project.id, ...(notes ? { notes } : {}) },
      {
        dedupeKey: `${type}:${project.id}`,
        projectId: project.id,
        maxAttempts: 2,
      },
    );
    return json({ ok: true }, 202);
  });
}

/** A poll's "posted on" platforms and results notes (the old poll_N_posted_* checkboxes). */
route('PATCH', '/api/content-items/:id/poll', async (req, { id }) => {
  const user = await requireUser(req);
  const body = await readBody(
    req,
    z.object({
      posted_on: z.array(z.enum(['linkedin', 'x', 'instagram', 'tiktok', 'facebook'])).optional(),
      results_notes: z.string().trim().max(4000).nullable().optional(),
    }),
  );
  const rec = await get(T.contentItems, id!);
  if (!rec || str(rec.fields, 'Channel') !== 'poll') throw new HttpError(404, 'Poll not found');
  await updateOne(T.contentItems, rec.id, {
    ...(body.posted_on ? { 'Posted On': body.posted_on } : {}),
    ...(body.results_notes !== undefined ? { 'Results Notes': body.results_notes } : {}),
    Updated: nowIso(),
  });
  await activity({
    event: 'poll_updated',
    projectId: link(rec.fields, 'Project'),
    actorId: user.id,
    details: { item_id: rec.id, ...body },
  });
  return json({ ok: true });
});

async function itemContext(itemId: string) {
  const rec = await get(T.contentItems, itemId);
  if (!rec) throw new HttpError(404, 'Post not found');
  const projectId = link(rec.fields, 'Project');
  if (!projectId) throw new HttpError(409, 'This post has no project');
  return { rec, projectId, status: str(rec.fields, 'Status') };
}

/** Approve one post (a post with warnings can still be approved: the owner has read them). */
route('POST', '/api/content-items/:id/approve', async (req, { id }) => {
  const user = await requireUser(req);
  const { rec, projectId, status } = await itemContext(id!);
  if (status === 'approved') return json({ ok: true });
  if (!['draft', 'needs_edit', 'rejected'].includes(status ?? ''))
    throw new HttpError(409, `A ${status} post can’t be approved.`);
  await updateOne(T.contentItems, rec.id, {
    Status: 'approved',
    'Approved At': nowIso(),
    'Approved By': [user.id],
    Updated: nowIso(),
  });
  // The audit rows are written after the response is sent: the owner doesn't wait for them.
  background(recordItemDecisions(projectId, [rec], 'approved', null, user));
  return json({ ok: true });
});

route('POST', '/api/content-items/:id/reject', async (req, { id }) => {
  const user = await requireUser(req);
  const { notes } = await readBody(
    req,
    z.object({ notes: z.string().trim().max(2000).optional() }),
  );
  const { rec, projectId, status } = await itemContext(id!);
  if (status === 'superseded') throw new HttpError(409, 'This post was replaced by a newer one.');
  await updateOne(T.contentItems, rec.id, {
    Status: 'rejected',
    'Review Notes': notes ?? null,
    'Approved At': null,
    'Approved By': [],
    Updated: nowIso(),
  });
  // The audit rows are written after the response is sent: the owner doesn't wait for them.
  background(recordItemDecisions(projectId, [rec], 'rejected', notes ?? null, user));
  return json({ ok: true });
});

/** Approve every pending post in a set (draft or needs edit). Rejected posts stay rejected. */
route('POST', '/api/caption-sets/:id/approve-all', async (req, { id }) => {
  const user = await requireUser(req);
  const set = await get(T.captionSets, id!);
  if (!set) throw new HttpError(404, 'Caption set not found');
  if (str(set.fields, 'Status') === 'superseded')
    throw new HttpError(409, 'These captions were replaced by a newer set.');
  const projectId = link(set.fields, 'Project');
  if (!projectId) throw new HttpError(409, 'This set has no project');
  const kind = str(set.fields, 'Kind') ?? 'social';
  const jobType =
    {
      social: 'generate_captions',
      youtube: 'generate_youtube',
      cta: 'generate_ctas',
      poll: 'generate_polls',
    }[kind] ?? 'generate_captions';
  if ((await pendingJob(`${jobType}:${projectId}`)) !== null) {
    throw new HttpError(409, 'These are being rewritten. Approve them once they’re ready.');
  }
  const pending = (await setItems(set)).filter((i) =>
    ['draft', 'needs_edit'].includes(str(i.fields, 'Status') ?? ''),
  );
  await update(
    T.contentItems,
    pending.map((i) => ({
      id: i.id,
      fields: {
        Status: 'approved',
        'Approved At': nowIso(),
        'Approved By': [user.id],
        Updated: nowIso(),
      },
    })),
  );
  // The audit rows are written after the response is sent: the owner doesn't wait for them.
  background(recordItemDecisions(projectId, pending, 'approved', null, user));
  return json({ ok: true, approved: pending.length });
});

// ---------------------------------------------------------------- prompts (admin)

route('GET', '/api/prompts', async (req) => {
  await requireUser(req, ['admin']);
  const rows = await list(T.prompts, {
    sort: [{ field: 'Key' }, { field: 'Version', direction: 'desc' }],
  });
  return json(rows.map(toPrompt));
});

route('POST', '/api/prompts', async (req) => {
  const user = await requireUser(req, ['admin']);
  const v = await readBody(
    req,
    z.object({
      key: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      model: z.string().nullable(),
      max_tokens: z.number().int().positive().nullable(),
      notes: z.string().nullable(),
    }),
  );
  const same = await list(T.prompts, { filterByFormula: eq('Key', v.key), fields: ['Version'] });
  const version =
    Math.max(0, ...same.map((r) => (r.fields['Version'] as number | undefined) ?? 0)) + 1;
  // Every save is a new version (F15.1). It isn't used until it's activated.
  const rec = await createOne(T.prompts, {
    Name: `${v.key} v${version}`,
    Key: v.key,
    Version: version,
    Title: v.title,
    Body: v.body,
    Model: v.model,
    'Max Tokens': v.max_tokens,
    Notes: v.notes,
    Active: false,
    'Created By': [user.id],
    Created: nowIso(),
  });
  return json(toPrompt(rec), 201);
});

route('POST', '/api/prompts/:id/activate', async (req, { id }) => {
  const user = await requireUser(req, ['admin']);
  const rec = await get(T.prompts, id!);
  if (!rec) throw new HttpError(404, 'Prompt not found');
  const key = rec.fields['Key'] as string;
  const active = await list(T.prompts, {
    filterByFormula: and(eq('Key', key), eq('Active', true)),
  });
  // Activate first, then deactivate the others: there's never a moment with no active version.
  await updateOne(T.prompts, rec.id, { Active: true });
  const others = active.filter((r) => r.id !== rec.id);
  if (others.length) {
    for (const o of others) await updateOne(T.prompts, o.id, { Active: false });
  }
  dropMemo('prompt:');
  await activity({
    event: 'prompt_activated',
    actorId: user.id,
    details: { key, version: rec.fields['Version'] },
  });
  return json({ ok: true });
});

route('GET', '/api/prompts/sample', async (req, _p, url) => {
  await requireUser(req, ['admin']);
  const key = url.searchParams.get('key') ?? '';
  const spec = promptSpec(key);
  return json({ key, variables: spec.sample, has_schema: spec.schema !== null });
});

route('POST', '/api/prompts/test-run', async (req) => {
  await requireUser(req, ['admin']);
  const { key, body, model, variables } = await readBody(
    req,
    z.object({
      key: z.string().min(1),
      body: z.string().optional(),
      model: z.string().optional(),
      variables: z.record(z.unknown()).optional(),
    }),
  );
  const spec = promptSpec(key);
  const vars = variables ?? spec.sample;
  let prepared;
  try {
    prepared = await preparePrompt(key, vars, spec.schema, { body, model });
  } catch (err) {
    // Missing variables, n8n placeholders, unconfigured prompt: show the reason in the panel.
    if (err instanceof PermanentJobError) throw new HttpError(400, err.message);
    throw err;
  }
  const started = Date.now();
  let res;
  try {
    res = await callPrompt(key, vars, prepared, {});
  } catch (err) {
    throw new HttpError(502, `Claude call failed: ${errorMessage(err)}`);
  }
  const validation = validateOutput(res.text, spec.schema ?? z.unknown());
  let warnings: string[] = [];
  if (validation.ok && (key === 'topic_score' || key === 'topic_regenerate')) {
    const { score_threshold } = await getSettings(['score_threshold'] as const);
    warnings = evaluationWarnings((validation.data as TopicEvaluation).evaluation, score_threshold);
  }
  return json({
    model: res.model,
    duration_ms: Date.now() - started,
    usage: { input_tokens: res.inputTokens, output_tokens: res.outputTokens },
    rendered_prompt: prepared.content,
    raw: res.text,
    valid: validation.ok,
    errors: validation.ok ? null : validation.error,
    warnings,
    schema_checked: spec.schema !== null,
  });
});

// ---------------------------------------------------------------- settings

route('GET', '/api/settings', async (req) => {
  await requireUser(req);
  return json(await allSettings());
});

route('PATCH', '/api/settings/:key', async (req, { key }) => {
  const user = await requireUser(req, ['admin']);
  const { value } = await readBody(
    req,
    z.object({ value: z.custom<Json>((v) => v !== undefined, 'value is required') }),
  );
  const rows = await list(T.settings, { filterByFormula: eq('Key', key!) });
  if (rows[0]) {
    await updateOne(T.settings, rows[0].id, { Value: toJson(value), Updated: nowIso() });
  } else {
    await createOne(T.settings, { Key: key, Value: toJson(value), Updated: nowIso() });
  }
  dropMemo('settings');
  await activity({ event: 'setting_changed', actorId: user.id, details: { key } });
  return json({ ok: true });
});

route('GET', '/api/seed-keywords', async (req) => {
  await requireUser(req);
  const rows = await list(T.seedKeywords, { sort: [{ field: 'Keyword' }] });
  return json(rows.map(toSeedKeyword));
});

route('POST', '/api/seed-keywords', async (req) => {
  await requireUser(req);
  const { keyword } = await readBody(
    req,
    z.object({ keyword: z.string().trim().min(1, 'Enter a keyword').max(100) }),
  );
  const all = await list(T.seedKeywords, { fields: ['Keyword'] });
  if (all.some((r) => String(r.fields['Keyword'] ?? '').toLowerCase() === keyword.toLowerCase())) {
    throw new HttpError(409, 'That keyword already exists.');
  }
  const [rec] = await create(T.seedKeywords, [
    { Keyword: keyword, Active: true, Created: nowIso() },
  ]);
  return json(toSeedKeyword(rec!), 201);
});

route('PATCH', '/api/seed-keywords/:id', async (req, { id }) => {
  await requireUser(req);
  const { is_active } = await readBody(req, z.object({ is_active: z.boolean() }));
  await updateOne(T.seedKeywords, id!, { Active: is_active });
  return json({ ok: true });
});

route('DELETE', '/api/seed-keywords/:id', async (req, { id }) => {
  await requireUser(req);
  await destroy(T.seedKeywords, [id!]);
  return json({ ok: true });
});

// ---------------------------------------------------------------- jobs (admin)

route('GET', '/api/jobs', async (req) => {
  await requireUser(req, ['admin']);
  sweepSoon();
  const rows = await list(T.jobs, {
    sort: [{ field: 'Created', direction: 'desc' }],
    maxRecords: 50,
  });
  return json(rows.map(toJob));
});

route('POST', '/api/jobs/test', async (req) => {
  await requireUser(req, ['admin']);
  await enqueue('noop', { requested_at: nowIso() });
  return json({ ok: true }, 202);
});

route('POST', '/api/jobs/:id/retry', async (req, { id }) => {
  await requireUser(req, ['admin']);
  try {
    await retryJob(id!);
  } catch (err) {
    if (err instanceof DuplicateJobError) throw new HttpError(409, err.message);
    throw err;
  }
  return json({ ok: true }, 202);
});

// ---------------------------------------------------------------- cron (Vercel Cron, daily)

route('GET', '/api/cron/daily', async (req) => {
  requireCron(req);
  const { timezone } = await getSettings(['timezone'] as const);
  const now = new Date();
  const queued: string[] = [];
  const once = async (type: string, key: string | null) => {
    if (!key) return;
    // The key is kept on the job forever, so a repeated cron run never queues the same run twice.
    const ran = await list(T.jobs, { filterByFormula: eq('Dedupe Key', key), maxRecords: 1 });
    if (ran.length) return;
    await enqueue(type, {}, { dedupeKey: key, start: false });
    queued.push(key);
  };
  await once('generate_topics', monthlyTopicsRunKey(now, timezone));
  await once('pull_trends', weeklyTrendsRunKey(now, timezone));
  const summary = await sweep();
  return json({ queued, ...summary });
});

/** Every minute (Vercel Pro): send due approved posts, look for new videos (at most every 5 minutes), run queued jobs. */
route('GET', '/api/cron/minute', async (req) => {
  requireCron(req);
  const now = new Date();
  const posts = await queueDue(now);
  const slot = Math.floor(now.getTime() / 300_000);
  try {
    await enqueue(
      'scan_uploads',
      {},
      { dedupeKey: `scan_uploads:${slot}`, start: false, maxAttempts: 2 },
    );
  } catch (err) {
    if (!(err instanceof DuplicateJobError)) throw err;
  }
  return json({ posts, ...(await sweep()) });
});

/** Make.com reports back after posting to Metricool (header X-Cockpit-Secret). */
route('POST', '/api/webhooks/publish-callback', async (req) => {
  const given = Buffer.from(req.headers.get('x-cockpit-secret') ?? '');
  const expected = Buffer.from(env('MAKE_WEBHOOK_SECRET') ?? '');
  if (
    expected.length === 0 ||
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    throw new HttpError(401, 'Unauthorized');
  }
  const body = await readBody(
    req,
    z.object({
      scheduled_post_id: z.string().min(1),
      status: z.enum(['scheduled', 'published', 'failed']),
      metricool_post_id: z.string().optional(),
      published_url: z.string().optional(),
      error: z.string().max(1000).optional(),
    }),
  );
  return json({ result: await applyCallback(body) });
});

// ---------------------------------------------------------------- dispatch

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // vercel.json rewrites /api/<path> to /api?path=<path>; locally the path arrives as is.
  const forwarded = url.searchParams.get('__path');
  const path = forwarded !== null ? `/api/${forwarded}` : url.pathname;
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.pattern);
      if (!m) continue;
      const params: Params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return await r.handler(req, params, url);
    }
    const known = routes.some((r) => r.pattern.test(path));
    throw new HttpError(known ? 405 : 404, known ? 'Method not allowed' : 'Not found');
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(`${req.method} ${path} failed`, err);
    return json({ error: `Something went wrong: ${errorMessage(err)}` }, 500);
  }
}
