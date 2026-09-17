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
  if (url.includes('/api/v1/settings')) return 60_000;
  if (url.includes('/api/v1/stats/dashboard')) return 30_000;
  if (url.includes('/api/v1/stats/reading-calendar')) return 60_000;
  if (url.includes('/api/v1/stats')) return 30_000;
  if (url.includes('/api/v1/annotations/tags')) return 120_000;
  if (url.includes('/api/v1/annotations')) return 15_000;
  if (url.includes('/api/v1/reading-sessions')) return 15_000;
  if (url.includes('/api/v1/agents/history')) return 60_000;
  if (url.includes('/api/v1/challenges')) return 300_000;
  if (url.includes('/api/v1/recommendations')) return 300_000;
  if (url.includes('/api/v1/books')) return 30_000;
  if (url.includes('/api/v1/discovery')) return 60_000;
  if (url.includes('/api/v1/friend/status')) return 60_000;
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
  if (url.includes('/api/v1/books') || url.includes('/api/v1/annotations') || url.includes('/api/v1/reading-sessions')) {
    invalidateCache(cache, '/api/v1/stats');
    invalidateCache(cache, '/api/v1/challenges');
    invalidateCache(cache, '/api/v1/recommendations');
    invalidateCache(cache, '/api/v1/collections');
  }
  if (url.includes('/api/v1/collections')) {
    invalidateCache(cache, '/api/v1/collections');
  }
  const resourcePrefix = url.split('/').slice(0, 4).join('/');
  const collectionPrefix = url.split('/').slice(0, 3).join('/');
  invalidateCache(cache, resourcePrefix);
  invalidateCache(cache, collectionPrefix);
  if (url.includes('/api/v1/settings')) {
    invalidateCache(cache, '/api/v1/settings');
    invalidateCache(cache, '/api/v1/stats');
  }
}
