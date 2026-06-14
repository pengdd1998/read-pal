/**
 * Cache logic for the API client.
 *
 * - Per-endpoint TTL with stale-while-revalidate
 * - Automatic pruning of expired entries
 * - Prefix-based invalidation for mutations
 */

interface CacheEntry {
  data: unknown;
  expiry: number;
  stale?: boolean;
}

const STALE_TTL = 300_000; // 5 minutes — serve stale while revalidating
const MAX_CACHE_SIZE = 200;

export { STALE_TTL, MAX_CACHE_SIZE };
export type { CacheEntry };

/** Return per-endpoint cache TTL in ms (0 = not cacheable) */
export function getCacheTTL(url: string): number {
  // Book detail: match /api/books/{uuid} exactly (anchored, UUID-shaped).
  // Must not match nested paths like /api/books/{id}/content (TTL=0),
  // or non-book routes under /api/books/ like /api/books/stats (TTL=30s).
  if (url.match(/\/api\/books\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\?.*)?$/)) return 300_000;
  if (url.includes('/content')) return 0;
  if (url.includes('/api/settings')) return 60_000;
  if (url.includes('/api/stats/dashboard')) return 30_000;
  if (url.includes('/api/stats/reading-calendar')) return 60_000;
  if (url.includes('/api/stats')) return 30_000;
  if (url.includes('/api/annotations/tags')) return 120_000;
  if (url.includes('/api/annotations')) return 15_000;
  if (url.includes('/api/reading-sessions')) return 15_000;
  if (url.includes('/api/agents/history')) return 60_000;
  if (url.includes('/api/challenges')) return 300_000;
  if (url.includes('/api/recommendations')) return 300_000;
  if (url.includes('/api/books')) return 30_000;
  if (url.includes('/api/discovery')) return 60_000;
  if (url.includes('/api/friend/status')) return 60_000;
  return 0;
}

/** Remove expired entries and enforce max cache size */
export function pruneStaleEntries(cache: Map<string, CacheEntry>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiry + STALE_TTL) {
      cache.delete(key);
    }
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }
}

/** Invalidate cache entries matching a prefix */
export function invalidateCache(cache: Map<string, CacheEntry>, prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Invalidate cache entries related to a specific data change */
export function invalidateAfterMutation(cache: Map<string, CacheEntry>, url: string): void {
  if (url.includes('/api/books') || url.includes('/api/annotations') || url.includes('/api/reading-sessions')) {
    invalidateCache(cache, '/api/stats');
    invalidateCache(cache, '/api/challenges');
    invalidateCache(cache, '/api/recommendations');
    invalidateCache(cache, '/api/collections');
  }
  if (url.includes('/api/collections')) {
    invalidateCache(cache, '/api/collections');
  }
  const resourcePrefix = url.split('/').slice(0, 4).join('/');
  const collectionPrefix = url.split('/').slice(0, 3).join('/');
  invalidateCache(cache, resourcePrefix);
  invalidateCache(cache, collectionPrefix);
  if (url.includes('/api/settings')) {
    invalidateCache(cache, '/api/settings');
    invalidateCache(cache, '/api/stats');
  }
}
