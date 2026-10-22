// Pure job-queue rules (architecture.md §3). No I/O here so it can be unit-tested.

export interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  project_id: string | null;
}

/** A running job whose lock is older than this is assumed dead (worker crashed or timed out). */
export const STALE_LOCK_MINUTES = 10;

/** Backoff after a failed attempt: run_after = now + 2^attempts minutes. */
export function backoffUntil(attempts: number, now: Date): Date {
  return new Date(now.getTime() + 2 ** attempts * 60_000);
}

export type FailureOutcome =
  | { status: 'queued'; run_after: string; last_error: string }
  | { status: 'failed'; last_error: string };

/**
 * What happens to a job whose handler threw. `attempts` has already been incremented by the claim.
 * Permanent errors (e.g. unknown job type, invalid payload) skip the retries.
 */
export function failureOutcome(
  job: Pick<JobRow, 'attempts' | 'max_attempts'>,
  error: string,
  now: Date,
  permanent = false,
): FailureOutcome {
  if (permanent || job.attempts >= job.max_attempts) return { status: 'failed', last_error: error };
  return {
    status: 'queued',
    run_after: backoffUntil(job.attempts, now).toISOString(),
    last_error: error,
  };
}

/** Thrown by handlers for errors that retrying can't fix. */
export class PermanentJobError extends Error {}
