// Sends due, approved posts to the client's Make.com webhook (which posts them to Metricool).
// The cron (/api/cron/minute) claims due posts and queues one `dispatch_post` job each; the job
// re-reads the post and its caption right before sending, so an unapproved or edited caption is
// never sent (non-negotiable rule 1).
import { and, eq, get, link, list, nowIso, num, str, T, updateOne } from '../airtable.js';
import { sharedLink } from '../dropbox.js';
import { env, isMock } from '../env.js';
import { activity } from '../log.js';
import { contentKey, directLink, webhookBody, WEBHOOK_ENV } from '../publish-map.js';
import type { JobHandler } from './handlers.js';
import { DuplicateJobError, enqueue } from './queue.js';
import { PermanentJobError } from './rules.js';

/** A post more than this long past its time is not sent late: it is marked failed for the owner to reschedule. */
export const LATE_GRACE_MINUTES = 60;

export type Resolved =
  | { ok: true; platform: string; body: Record<string, string> }
  | { ok: false; reason: string };

/** Everything the webhook needs, or the reason the post can't go out yet. Reads Airtable fresh. */
export async function resolvePost(postId: string): Promise<Resolved> {
  const post = await get(T.scheduledPosts, postId);
  if (!post) return { ok: false, reason: 'Post not found' };
  const platform = str(post.fields, 'Platform') ?? '';
  const role = str(post.fields, 'Asset Role');
  const projectId = link(post.fields, 'Project');
  const key = contentKey(platform, role);
  if (!key || !projectId)
    return {
      ok: false,
      reason: 'Not wired to publishing yet (blog and newsletter are sent separately)',
    };

  const items = await list(T.contentItems, {
    filterByFormula: and(eq('Channel', key.channel), eq('Post', key.post)),
  });
  const item = items.find(
    (r) => link(r.fields, 'Project') === projectId && str(r.fields, 'Status') !== 'superseded',
  );
  if (!item) return { ok: false, reason: 'No caption generated for this post' };
  if (str(item.fields, 'Status') !== 'approved')
    return { ok: false, reason: 'Caption is not approved yet' };

  const assets = await list(T.assets, {
    filterByFormula: and(eq('Role', role ?? ''), eq('Current', true)),
  });
  const asset = assets.find((r) => link(r.fields, 'Project') === projectId);
  if (!asset) return { ok: false, reason: `No ${role} video found in Dropbox yet` };
  if (!str(asset.fields, 'Settled At')) return { ok: false, reason: 'Video is still uploading' };

  const project = await get(T.projects, projectId);
  const url = directLink(await sharedLink(str(asset.fields, 'Dropbox File ID') ?? ''));
  // Facebook / Instagram titles come from the YouTube metadata of the same video; fall back to the topic title.
  const ytItem =
    key.channel === 'youtube'
      ? item
      : (
          await list(T.contentItems, {
            filterByFormula: and(eq('Channel', 'youtube'), eq('Post', key.post)),
          })
        ).find(
          (r) =>
            link(r.fields, 'Project') === projectId && str(r.fields, 'Status') !== 'superseded',
        );
  return {
    ok: true,
    platform,
    body: {
      // scheduled_post_id and platform let the Make scenario answer back and tell Reels from Feed.
      scheduled_post_id: post.id,
      platform,
      ...webhookBody(platform, {
        video_title:
          str(ytItem?.fields ?? {}, 'Title') ?? str(project?.fields ?? {}, 'Title') ?? '',
        video_url: url,
        post_content: str(item.fields, 'Caption') ?? '',
        hashtags: str(item.fields, 'Hashtags') ?? '',
      }),
    },
  };
}

/** Cron step: claim every due post that can go out and queue its job. Returns what happened. */
export async function queueDue(
  now = new Date(),
): Promise<{ queued: number; late: number; waiting: number }> {
  const due = await list(T.scheduledPosts, {
    filterByFormula: and(
      eq('Publish Status', 'planned'),
      `IS_BEFORE({Scheduled At},${JSON.stringify(now.toISOString())})`,
    ),
  });
  const out = { queued: 0, late: 0, waiting: 0 };
  for (const post of due) {
    const at = Date.parse(str(post.fields, 'Scheduled At') ?? '');
    if (now.getTime() - at > LATE_GRACE_MINUTES * 60_000) {
      await updateOne(T.scheduledPosts, post.id, {
        'Publish Status': 'failed',
        'Last Error': 'missed: not ready in time (approval or video missing). Reschedule it.',
        Updated: nowIso(),
      });
      await activity({
        event: 'post_missed',
        projectId: link(post.fields, 'Project'),
        details: { post: post.id },
      });
      out.late++;
      continue;
    }
    const r = await resolvePost(post.id);
    if (!r.ok) {
      if (/Not wired/.test(r.reason)) continue;
      if (str(post.fields, 'Last Error') !== r.reason)
        await updateOne(T.scheduledPosts, post.id, { 'Last Error': r.reason });
      out.waiting++;
      continue;
    }
    await updateOne(T.scheduledPosts, post.id, {
      'Publish Status': 'queued',
      'Last Error': null,
      Updated: nowIso(),
    });
    try {
      await enqueue(
        'dispatch_post',
        { post_id: post.id },
        {
          dedupeKey: `dispatch_post:${post.id}`,
          projectId: link(post.fields, 'Project'),
          start: false,
          maxAttempts: 3,
        },
      );
      out.queued++;
    } catch (err) {
      if (!(err instanceof DuplicateJobError)) throw err;
    }
  }
  return out;
}

async function sendToMake(platform: string, payload: Record<string, string>): Promise<void> {
  if (isMock()) return;
  const name = WEBHOOK_ENV[platform];
  const url = name ? env(name) : undefined;
  if (!url)
    throw new PermanentJobError(
      `The Make.com webhook for ${platform} is not set: add ${name ?? 'a webhook'} to the server settings.`,
    );
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cockpit-Secret': env('MAKE_WEBHOOK_SECRET') ?? '',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.ok) return;
  const body = (await res.text().catch(() => '')).slice(0, 200);
  const msg = `Make webhook answered ${res.status}: ${body}`;
  // A 4xx means our request is wrong (retrying won't fix it); 5xx / 429 are worth retrying.
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentJobError(msg);
  throw new Error(msg);
}

export const dispatchPost: JobHandler = {
  async run(job) {
    const postId = String(job.payload['post_id'] ?? '');
    const post = await get(T.scheduledPosts, postId);
    if (!post) throw new PermanentJobError('Post not found');
    if (str(post.fields, 'Publish Status') !== 'queued')
      return { skipped: str(post.fields, 'Publish Status') };
    const r = await resolvePost(postId);
    if (!r.ok) {
      // Approval was withdrawn or the video disappeared after the claim: back to planned, not sent.
      await updateOne(T.scheduledPosts, postId, {
        'Publish Status': 'planned',
        'Last Error': r.reason,
        Updated: nowIso(),
      });
      return { held: r.reason };
    }
    await sendToMake(r.platform, r.body);
    await updateOne(T.scheduledPosts, postId, {
      'Publish Status': 'sent',
      'Sent At': nowIso(),
      Attempts: (num(post.fields, 'Attempts') ?? 0) + 1,
      'Last Error': null,
      Updated: nowIso(),
    });
    await activity({
      event: 'post_sent',
      projectId: link(post.fields, 'Project'),
      details: { post: postId, platform: r.platform },
    });
    return { sent: postId };
  },
  async onFailed(job, message) {
    const postId = String(job.payload['post_id'] ?? '');
    if (!postId) return;
    await updateOne(T.scheduledPosts, postId, {
      'Publish Status': 'failed',
      'Last Error': message,
      Updated: nowIso(),
    }).catch(() => undefined);
  },
};

/** What the Make.com scenario reports back after posting to Metricool (idempotent: never moves a post backwards). */
const RANK: Record<string, number> = { planned: 0, queued: 1, sent: 2, scheduled: 3, published: 4 };
export async function applyCallback(body: {
  scheduled_post_id: string;
  status: 'scheduled' | 'published' | 'failed';
  metricool_post_id?: string | undefined;
  published_url?: string | undefined;
  error?: string | undefined;
}): Promise<'updated' | 'ignored'> {
  const post = await get(T.scheduledPosts, body.scheduled_post_id);
  if (!post) return 'ignored';
  const current = str(post.fields, 'Publish Status') ?? 'planned';
  if (current === 'published' || current === 'cancelled') return 'ignored';
  if (body.status !== 'failed' && RANK[body.status]! <= (RANK[current] ?? 0)) return 'ignored';
  await updateOne(T.scheduledPosts, post.id, {
    'Publish Status': body.status,
    ...(body.metricool_post_id ? { 'Metricool Post ID': body.metricool_post_id } : {}),
    ...(body.published_url ? { 'Published URL': body.published_url } : {}),
    ...(body.status === 'published' ? { 'Published At': nowIso() } : {}),
    ...(body.status === 'failed'
      ? { 'Last Error': body.error ?? 'Make reported a failure' }
      : { 'Last Error': null }),
    Updated: nowIso(),
  });
  await activity({
    event: `post_${body.status}`,
    projectId: link(post.fields, 'Project'),
    actorType: 'webhook',
    details: { post: post.id },
  });
  return 'updated';
}
