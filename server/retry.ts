// Retries for external calls: 3 attempts with exponential backoff (architecture.md §7).

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** 429, 5xx and network failures are worth retrying; other 4xx are not. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof UpstreamError)
    return err.status === undefined || err.status === 429 || err.status >= 500;
  return err instanceof TypeError; // fetch network errors
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 500 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

/** GET/POST returning parsed JSON; non-2xx becomes an UpstreamError carrying the status. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 30_000,
): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new UpstreamError(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}
