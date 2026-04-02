/**
 * Simple in-memory API response cache with TTL.
 * Used for frequently accessed, rarely changing data like parks list,
 * feature flags, and permissions.
 *
 * Falls back gracefully — if cache misses, the original query runs.
 * No Redis dependency — pure in-memory for simplicity.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// Clean expired entries periodically
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt < now) cache.delete(key);
    }
  }, 60_000); // Cleanup every minute
  // Don't prevent process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Get a cached value or compute it.
 *
 * @param key - Cache key (e.g., "parks:tenant123")
 * @param ttlMs - Time-to-live in milliseconds (default: 30 seconds)
 * @param fn - Async function to compute the value if not cached
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  ensureCleanup();

  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    return existing.data;
  }

  const data = await fn();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string) {
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
  } else {
    // Prefix match
    for (const key of cache.keys()) {
      if (key.startsWith(keyOrPrefix)) cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache() {
  cache.clear();
}

// Common TTL constants
export const CACHE_TTL = {
  SHORT: 10_000,      // 10 seconds — for frequently changing data
  MEDIUM: 30_000,     // 30 seconds — for parks list, settings
  LONG: 120_000,      // 2 minutes — for feature flags, permissions
  VERY_LONG: 300_000, // 5 minutes — for rarely changing config
} as const;
