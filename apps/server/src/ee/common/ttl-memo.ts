// Tiny per-process TTL memo with in-flight de-dupe, for expensive admin reads.
// ponytail: per-process, <=ttl stale; swap for Redis `withCache` if multi-node consistency matters.
const MAX_ENTRIES = 500;
const store = new Map<string, { p: Promise<unknown>; exp: number }>();

export function ttlMemo<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.p as Promise<T>;

  if (store.size >= MAX_ENTRIES) {
    for (const [k, v] of store) if (v.exp <= now) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.clear();
  }

  const p = fn();
  store.set(key, { p, exp: now + ttlMs });
  p.catch(() => store.delete(key)); // never cache failures
  return p;
}
