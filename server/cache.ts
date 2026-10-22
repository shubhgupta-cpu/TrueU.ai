// A tiny per-instance cache for data that is read on every request but rarely changes (the signed-in user,
// settings, prompts). Concurrent reads of the same key share one Airtable call. Another serverless instance
// can serve a value up to `ttlMs` old, so keep TTLs short and drop keys right after a write on this instance.

const store = new Map<string, { exp: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { exp: Date.now() + ttlMs, value });
  // A failed load must not be cached.
  value.catch(() => store.delete(key));
  return value;
}

/** Forgets every key that starts with `prefix` (call after writing that data). */
export function dropMemo(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
