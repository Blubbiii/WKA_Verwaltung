/**
 * Redis Cache Service for WindparkManager
 *
 * Provides a wrapper around ioredis with:
 * - Automatic JSON serialization/deserialization
 * - Tenant-isolated cache keys
 * - Graceful degradation when Redis is unavailable
 * - Cache-aside pattern support (getOrSet)
 */

import Redis, { RedisOptions } from 'ioredis';
import { CacheSetOptions, CACHE_TTL } from './types';
import { cacheLogger } from '@/lib/logger';

// Connection instance (singleton)
let cacheConnection: Redis | null = null;
let connectionAttempted = false;
let isConnected = false;

// In-memory fallback cache (LRU-like with TTL)
const memoryCache = new Map<string, { value: string; expiresAt: number }>();
const MAX_MEMORY_CACHE_SIZE = 1000;

// In-process hit/miss counters (reset on server restart)
let cacheHits = 0;
let cacheMisses = 0;
let cacheInvalidations = 0;

/**
 * Get Redis connection options from environment
 */
const getRedisOptions = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    const url = new URL(redisUrl);

    const options: RedisOptions = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          // Stop retrying after 3 attempts for cache operations
          cacheLogger.warn('Max retry attempts reached, using memory fallback');
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      lazyConnect: true, // Don't connect until first command
      connectTimeout: 5000,
    };

    if (url.password) {
      options.password = decodeURIComponent(url.password);
    }

    if (url.username && url.username !== 'default') {
      options.username = url.username;
    }

    if (url.protocol === 'rediss:') {
      options.tls = {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      };
    }

    return options;
  } catch {
    cacheLogger.warn('Invalid REDIS_URL, using defaults');
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 5000,
    };
  }
};

/**
 * Get or create Redis connection for caching
 */
const getConnection = async (): Promise<Redis | null> => {
  if (cacheConnection && isConnected) {
    return cacheConnection;
  }

  if (connectionAttempted && !isConnected) {
    // Already tried and failed, don't keep retrying
    return null;
  }

  connectionAttempted = true;

  try {
    const options = getRedisOptions();
    cacheConnection = new Redis(options);

    // Set up event listeners
    cacheConnection.on('connect', () => {
      isConnected = true;
      cacheLogger.info('Redis connected successfully');
    });

    cacheConnection.on('error', (err: Error) => {
      cacheLogger.error({ err }, 'Redis connection error');
      isConnected = false;
    });

    cacheConnection.on('close', () => {
      isConnected = false;
    });

    // Attempt to connect
    await cacheConnection.connect();

    // Test connection with ping
    await cacheConnection.ping();
    isConnected = true;

    return cacheConnection;
  } catch (error) {
    cacheLogger.warn({ err: error }, 'Failed to connect to Redis, using memory fallback');
    isConnected = false;
    return null;
  }
};

/**
 * Build cache key with tenant prefix
 */
const buildKey = (key: string, tenantId?: string): string => {
  if (tenantId) {
    return `wpm:${tenantId}:${key}`;
  }
  return `wpm:global:${key}`;
};

/**
 * Clean up expired entries from memory cache
 */
const cleanupMemoryCache = () => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  }

  // If still too large, remove oldest entries
  if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
    const entries = Array.from(memoryCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, entries.length - MAX_MEMORY_CACHE_SIZE);
    for (const [key] of toRemove) {
      memoryCache.delete(key);
    }
  }
};

/**
 * Cache Service Object
 */
export const cache = {
  /**
   * Get a value from cache
   * @param key Cache key
   * @param tenantId Optional tenant ID for isolation
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string, tenantId?: string): Promise<T | null> {
    const fullKey = buildKey(key, tenantId);

    try {
      const redis = await getConnection();

      if (redis) {
        const value = await redis.get(fullKey);
        if (value) {
          cacheHits++;
          return JSON.parse(value) as T;
        }
        cacheMisses++;
        return null;
      }

      // Fallback to memory cache
      const cached = memoryCache.get(fullKey);
      if (cached && cached.expiresAt > Date.now()) {
        cacheHits++;
        return JSON.parse(cached.value) as T;
      }
      cacheMisses++;
      memoryCache.delete(fullKey);
      return null;
    } catch (error) {
      cacheMisses++;
      cacheLogger.warn({ err: error, key }, 'Cache get error');
      return null;
    }
  },

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache (will be JSON serialized)
   * @param ttlOrOptions TTL in seconds or options object
   * @param tenantId Optional tenant ID for isolation
   */
  async set<T>(
    key: string,
    value: T,
    ttlOrOptions?: number | CacheSetOptions,
    tenantId?: string
  ): Promise<boolean> {
    const ttl = typeof ttlOrOptions === 'number'
      ? ttlOrOptions
      : ttlOrOptions?.ttl ?? CACHE_TTL.MEDIUM;

    const effectiveTenantId = typeof ttlOrOptions === 'object' && ttlOrOptions?.prefix
      ? undefined
      : tenantId;

    const fullKey = typeof ttlOrOptions === 'object' && ttlOrOptions?.prefix
      ? `wpm:${ttlOrOptions.prefix}:${key}`
      : buildKey(key, effectiveTenantId);

    try {
      const serialized = JSON.stringify(value);
      const redis = await getConnection();

      if (redis) {
        await redis.setex(fullKey, ttl, serialized);
        return true;
      }

      // Fallback to memory cache
      cleanupMemoryCache();
      memoryCache.set(fullKey, {
        value: serialized,
        expiresAt: Date.now() + ttl * 1000,
      });
      return true;
    } catch (error) {
      cacheLogger.warn({ err: error, key }, 'Cache set error');
      return false;
    }
  },

  /**
   * Delete a value from cache
   * @param key Cache key
   * @param tenantId Optional tenant ID for isolation
   */
  async del(key: string, tenantId?: string): Promise<boolean> {
    const fullKey = buildKey(key, tenantId);

    try {
      const redis = await getConnection();

      if (redis) {
        await redis.del(fullKey);
      }

      // Also remove from memory cache
      memoryCache.delete(fullKey);
      cacheInvalidations++;
      return true;
    } catch (error) {
      cacheLogger.warn({ err: error, key }, 'Cache delete error');
      return false;
    }
  },

  /**
   * Delete multiple keys matching a pattern
   * @param pattern Pattern to match (e.g., "dashboard:*")
   * @param tenantId Optional tenant ID for isolation
   */
  async delPattern(pattern: string, tenantId?: string): Promise<boolean> {
    const fullPattern = buildKey(pattern, tenantId);

    try {
      const redis = await getConnection();

      if (redis) {
        const keys = await redis.keys(fullPattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }

      // Also remove matching keys from memory cache
      const prefix = fullPattern.replace('*', '');
      for (const key of memoryCache.keys()) {
        if (key.startsWith(prefix)) {
          memoryCache.delete(key);
        }
      }

      return true;
    } catch (error) {
      cacheLogger.warn({ err: error, pattern }, 'Cache delete pattern error');
      return false;
    }
  },

  /**
   * Get or set pattern (Cache-Aside)
   * Gets value from cache, or fetches it using the provided function and caches the result
   * @param key Cache key
   * @param fetchFn Function to fetch the value if not in cache
   * @param ttl TTL in seconds
   * @param tenantId Optional tenant ID for isolation
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM,
    tenantId?: string
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, tenantId);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const value = await fetchFn();

    // Cache the result (don't await to not block)
    this.set(key, value, ttl, tenantId).catch((err) => {
      cacheLogger.warn({ err }, 'Background cache set error');
    });

    return value;
  },

  /**
   * Check if a key exists in cache
   * @param key Cache key
   * @param tenantId Optional tenant ID for isolation
   */
  async exists(key: string, tenantId?: string): Promise<boolean> {
    const fullKey = buildKey(key, tenantId);

    try {
      const redis = await getConnection();

      if (redis) {
        const result = await redis.exists(fullKey);
        return result === 1;
      }

      // Check memory cache
      const cached = memoryCache.get(fullKey);
      return cached !== undefined && cached.expiresAt > Date.now();
    } catch {
      return false;
    }
  },

  /**
   * Get remaining TTL for a key
   * @param key Cache key
   * @param tenantId Optional tenant ID for isolation
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  async ttl(key: string, tenantId?: string): Promise<number> {
    const fullKey = buildKey(key, tenantId);

    try {
      const redis = await getConnection();

      if (redis) {
        return await redis.ttl(fullKey);
      }

      // Check memory cache
      const cached = memoryCache.get(fullKey);
      if (cached && cached.expiresAt > Date.now()) {
        return Math.floor((cached.expiresAt - Date.now()) / 1000);
      }
      return -2;
    } catch {
      return -2;
    }
  },

  /**
   * Check if Redis is connected and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const redis = await getConnection();
      if (!redis) return false;

      const result = await redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  },

  /**
   * Get cache statistics including hit/miss counters
   */
  async getStats(): Promise<{
    isConnected: boolean;
    usingMemoryFallback: boolean;
    memoryCacheSize: number;
    hits: number;
    misses: number;
    invalidations: number;
    hitRate: string;
    redisKeyCount?: number;
    redisMemoryUsage?: string;
  }> {
    const redis = await getConnection();
    const totalOps = cacheHits + cacheMisses;
    const hitRate = totalOps > 0 ? ((cacheHits / totalOps) * 100).toFixed(1) : '0.0';

    const stats: {
      isConnected: boolean;
      usingMemoryFallback: boolean;
      memoryCacheSize: number;
      hits: number;
      misses: number;
      invalidations: number;
      hitRate: string;
      redisKeyCount?: number;
      redisMemoryUsage?: string;
    } = {
      isConnected: redis !== null && isConnected,
      usingMemoryFallback: redis === null || !isConnected,
      memoryCacheSize: memoryCache.size,
      hits: cacheHits,
      misses: cacheMisses,
      invalidations: cacheInvalidations,
      hitRate: `${hitRate}%`,
    };

    // Get Redis-specific stats if connected
    if (redis && isConnected) {
      try {
        const dbSize = await redis.dbsize();
        stats.redisKeyCount = dbSize;

        const info = await redis.info('memory');
        const memMatch = info.match(/used_memory_human:(.+)/);
        if (memMatch) {
          stats.redisMemoryUsage = memMatch[1].trim();
        }
      } catch {
        // Non-critical
      }
    }

    return stats;
  },

  /**
   * Reset hit/miss counters (useful for periodic monitoring)
   */
  resetCounters(): void {
    cacheHits = 0;
    cacheMisses = 0;
    cacheInvalidations = 0;
  },

  /**
   * Clear all cache entries for a tenant
   * @param tenantId Tenant ID
   */
  async clearTenant(tenantId: string): Promise<boolean> {
    return this.delPattern('*', tenantId);
  },

  /**
   * Close the Redis connection gracefully
   */
  async close(): Promise<void> {
    if (cacheConnection) {
      await cacheConnection.quit();
      cacheConnection = null;
      isConnected = false;
      connectionAttempted = false;
    }
    memoryCache.clear();
  },
};

// Export types
export * from './types';

// Re-export cache modules (lazy import to avoid circular dependencies)
// Use: import { dashboardCache } from '@/lib/cache/dashboard';
// Or:  import { tenantCache } from '@/lib/cache/tenant';
// Or:  import { invalidate } from '@/lib/cache/invalidation';
