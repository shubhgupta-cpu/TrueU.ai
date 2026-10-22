// The job queue on the Airtable "Jobs" table (architecture.md §3).
// - enqueue() writes a queued job and starts it in the background of the same request (Vercel
//   waitUntil), so the UI never waits on Claude or Dropbox.
// - Retries (backoff) and jobs whose function instance died are picked up by sweep(): it runs on
//   the daily cron, and at most once a minute per instance while the app is being used.
// Airtable has no row locks: a claim writes a random Lock ID and reads it back. Two workers racing
// for the same job within milliseconds is unlikely at this volume; handlers stay idempotent anyway.
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import {
  type AtRecord,
  and,
  createOne,
  eq,
  first,
  get,
  isIn,
  jsonField,
  link,
  list,
  nowIso,
  num,
  str,
  T,
  toJson,
  updateOne,
} from '../airtable.js';
import { errorMessage } from '../http.js';
import { activity, notifyAdmins } from '../log.js';
import { handlerFor } from './handlers.js';
import { failureOutcome, type JobRow, PermanentJobError, STALE_LOCK_MINUTES } from './rules.js';

export class DuplicateJobError extends Error {}

export interface EnqueueOptions {
  dedupeKey?: string;
  maxAttempts?: number;
  projectId?: string | null;
  /** Defaults to true: start right away in the background of this request. */
  start?: boolean;
}

function toRow(r: AtRecord): JobRow {
  return {
    id: r.id,
    type: str(r.fields, 'Type') ?? '',
    payload: jsonField(r.fields, 'Payload', {}),
    status: (str(r.fields, 'Status') ?? 'queued') as JobRow['status'],
    attempts: num(r.fields, 'Attempts') ?? 0,
    max_attempts: num(r.fields, 'Max Attempts') ?? 3,
    project_id: link(r.fields, 'Project'),
  };
}

/** Runs a promise after the response is sent, without letting it crash the request. */
export function background(work: Promise<unknown>): void {
  const safe = work.catch((err) => console.error('background work failed', err));
  waitUntil(safe);
}

/** A pending (queued or running) job with this dedupe key, if any. */
export async function pendingJob(dedupeKey: string): Promise<AtRecord | null> {
  return first(T.jobs, {
    filterByFormula: and(eq('Dedupe Key', dedupeKey), isIn('Status', ['queued', 'running'])),
  });
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<string> {
  if (opts.dedupeKey && (await pendingJob(opts.dedupeKey))) {
    throw new DuplicateJobError('This is already queued or running.');
  }
  const now = nowIso();
  const rec = await createOne(T.jobs, {
    Name: [type, opts.dedupeKey].filter(Boolean).join(' · '),
    Type: type,
    Payload: toJson(payload),
    Status: 'queued',
    Attempts: 0,
    'Max Attempts': opts.maxAttempts ?? 3,
    'Run After': now,
    'Dedupe Key': opts.dedupeKey,
    Created: now,
    Updated: now,
    ...(opts.projectId ? { Project: [opts.projectId] } : {}),
  });
  if (opts.start !== false) background(runJob(rec.id));
  return rec.id;
}

/** Claims a queued, due job. Returns the claimed row, or null if it isn't runnable / was taken. */
async function claim(id: string): Promise<JobRow | null> {
  const rec = await get(T.jobs, id);
  if (!rec) return null;
  const job = toRow(rec);
  const runAfter = str(rec.fields, 'Run After');
  if (job.status !== 'queued' || (runAfter && Date.parse(runAfter) > Date.now())) return null;

  const lockId = randomUUID();
  await updateOne(T.jobs, id, {
    Status: 'running',
    'Lock ID': lockId,
    'Locked At': nowIso(),
    Attempts: job.attempts + 1,
    Updated: nowIso(),
  });
  const check = await get(T.jobs, id);
  if (str(check?.fields ?? {}, 'Lock ID') !== lockId) return null; // another worker won
  return { ...job, status: 'running', attempts: job.attempts + 1 };
}

export async function runJob(id: string): Promise<'succeeded' | 'requeued' | 'failed' | 'skipped'> {
  const job = await claim(id);
  if (!job) return 'skipped';
  const handler = handlerFor(job.type);
  try {
    if (!handler) throw new PermanentJobError(`Unknown job type "${job.type}"`);
    const result = await handler.run(job);
    await updateOne(T.jobs, id, {
      Status: 'succeeded',
      Result: toJson(result),
      'Last Error': null,
      'Locked At': null,
      Updated: nowIso(),
    });
    return 'succeeded';
  } catch (err) {
    const message = errorMessage(err);
    console.error(`job ${job.type} ${id} failed:`, message);
    const outcome = failureOutcome(job, message, new Date(), err instanceof PermanentJobError);
    await updateOne(T.jobs, id, {
      Status: outcome.status,
      'Last Error': outcome.last_error,
      ...(outcome.status === 'queued' ? { 'Run After': outcome.run_after } : {}),
      'Locked At': null,
      Updated: nowIso(),
    });
    if (outcome.status === 'queued') return 'requeued';
    await onFinalFailure(job, message);
    return 'failed';
  }
}

/** Final failure: the handler's cleanup, the activity log and an in-app notice to admins. */
async function onFinalFailure(job: JobRow, message: string): Promise<void> {
  try {
    await handlerFor(job.type)?.onFailed?.(job, message);
  } catch (err) {
    console.error('onFailed handler threw', job.type, errorMessage(err));
  }
  await activity({
    event: 'job_failed',
    projectId: job.project_id,
    details: { job_id: job.id, type: job.type, attempts: job.attempts, error: message },
  });
  await notifyAdmins({
    kind: 'job_failed',
    title: `Job ${job.type} failed`,
    body: message,
    link: '/admin/jobs',
  });
}

/** A running job locked for too long is assumed dead (its function instance timed out). */
async function releaseStaleLocks(): Promise<void> {
  const cutoff = Date.now() - STALE_LOCK_MINUTES * 60_000;
  const running = await list(T.jobs, { filterByFormula: eq('Status', 'running') });
  for (const rec of running) {
    const lockedAt = str(rec.fields, 'Locked At');
    if (lockedAt && Date.parse(lockedAt) > cutoff) continue;
    const job = toRow(rec);
    const message = 'The worker stopped before the job finished';
    const outcome = failureOutcome(job, message, new Date());
    await updateOne(T.jobs, job.id, {
      Status: outcome.status,
      'Last Error': message,
      ...(outcome.status === 'queued' ? { 'Run After': outcome.run_after } : {}),
      'Locked At': null,
      Updated: nowIso(),
    });
    if (outcome.status === 'failed') await onFinalFailure(job, message);
  }
}

/** Stop starting new jobs after this long, well inside the function's max duration. */
const SWEEP_BUDGET_MS = 200_000;

/** Runs every due queued job (retries, missed starts) and releases dead locks. */
export async function sweep(): Promise<Record<string, number>> {
  const started = Date.now();
  await releaseStaleLocks();
  const due = await list(T.jobs, {
    filterByFormula: and(eq('Status', 'queued'), `OR({Run After}="",IS_BEFORE({Run After},NOW()))`),
    sort: [{ field: 'Run After', direction: 'asc' }],
    maxRecords: 20,
  });
  const summary: Record<string, number> = { succeeded: 0, requeued: 0, failed: 0, skipped: 0 };
  for (const rec of due) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break;
    summary[await runJob(rec.id)]!++;
  }
  return summary;
}

let lastSweep = 0;
/** Opportunistic sweep from normal app traffic, at most once a minute per instance. */
export function sweepSoon(): void {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  background(sweep());
}

/** Admin "Retry": a failed or cancelled job goes back to the queue with a fresh attempt budget. */
export async function retryJob(id: string): Promise<void> {
  const rec = await get(T.jobs, id);
  if (!rec) throw new PermanentJobError('Job not found');
  const job = toRow(rec);
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    throw new DuplicateJobError(
      `Only failed or cancelled jobs can be retried (this one is ${job.status}).`,
    );
  }
  await updateOne(T.jobs, id, {
    Status: 'queued',
    Attempts: 0,
    'Run After': nowIso(),
    'Last Error': null,
    Updated: nowIso(),
  });
  background(runJob(id));
}
