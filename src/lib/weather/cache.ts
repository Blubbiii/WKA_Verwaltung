/**
 * Weather Data Cache
 *
 * Redis-based caching for weather data
 * Uses ioredis connection from Queue system
 */

import { getRedisConnection } from "../queue/connection";
import { logger } from "@/lib/logger";
import {
  CachedWeatherData,
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WeatherApiError,
  WeatherErrorCode,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

const CACHE_PREFIX = "weather:";
const DEFAULT_TTL_SECONDS = parseInt(process.env.WEATHER_CACHE_TTL || "1800"); // 30 minutes

// =============================================================================
// Cache Key Helpers
// =============================================================================

/**
 * Generate cache key for park weather data
 */
function getCacheKey(parkId: string, type: "current" | "forecast" | "full" = "full"): string {
  return `${CACHE_PREFIX}${parkId}:${type}`;
}

/**
 * Generate cache key for park statistics
 */
function getStatsKey(parkId: string, period: string): string {
  return `${CACHE_PREFIX}${parkId}:stats:${period}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get cached weather data for a park
 */
export async function getCachedWeather(
  parkId: string
): Promise<CachedWeatherData | null> {
  try {
    const redis = getRedisConnection();
    const key = getCacheKey(parkId);
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    const cached = JSON.parse(data) as CachedWeatherData;

    // Check if cache is expired
    if (new Date(cached.expiresAt) < new Date()) {
      logger.info(`[WeatherCache] Cache expired for park ${parkId}`);
      await redis.del(key);
      return null;
    }

    logger.info(`[WeatherCache] Cache hit for park ${parkId}`);
    return cached;
  } catch (error) {
    logger.error({ err: error }, `[WeatherCache] Error reading cache for park ${parkId}`);
    return null;
  }
}

/**
 * Set cached weather data for a park
 */
export async function setCachedWeather(
  parkId: string,
  data: {
    current: CurrentWeather;
    forecast?: DailyForecast[];
    hourlyForecast?: HourlyForecast[];
  },
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = getCacheKey(parkId);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const cacheData: CachedWeatherData = {
      parkId,
      current: data.current,
      forecast: data.forecast,
      hourlyForecast: data.hourlyForecast,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await redis.setex(key, ttlSeconds, JSON.stringify(cacheData));
    logger.info(
      `[WeatherCache] Cached weather for park ${parkId}, TTL: ${ttlSeconds}s`
    );
  } catch (error) {
    logger.error({ err: error }, `[WeatherCache] Error caching weather for park ${parkId}`);
    throw new WeatherApiError(
      "Cache-Fehler beim Speichern der Wetterdaten",
      undefined,
      { code: WeatherErrorCode.CACHE_ERROR, originalError: error }
    );
  }
}

/**
 * Invalidate cache for a park
 */
export async function invalidateParkCache(parkId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const pattern = `${CACHE_PREFIX}${parkId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(
        `[WeatherCache] Invalidated ${keys.length} cache entries for park ${parkId}`
      );
    }
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error invalidating cache for park ${parkId}`
    );
  }
}

/**
 * Invalidate all weather caches for a tenant
 */
export async function invalidateTenantCache(tenantId: string, parkIds: string[]): Promise<void> {
  try {
    const redis = getRedisConnection();

    for (const parkId of parkIds) {
      const pattern = `${CACHE_PREFIX}${parkId}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }

    logger.info(
      `[WeatherCache] Invalidated cache for ${parkIds.length} parks of tenant ${tenantId}`
    );
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error invalidating tenant cache ${tenantId}`
    );
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  parks: string[];
  memoryUsage: string;
}> {
  try {
    const redis = getRedisConnection();
    const pattern = `${CACHE_PREFIX}*`;
    const keys = await redis.keys(pattern);

    // Extract unique park IDs
    const parks = new Set<string>();
    for (const key of keys) {
      const match = key.match(/weather:([^:]+):/);
      if (match) {
        parks.add(match[1]);
      }
    }

    // Get memory info (if available)
    let memoryUsage = "N/A";
    try {
      const info = await redis.info("memory");
      const match = info.match(/used_memory_human:([^\r\n]+)/);
      if (match) {
        memoryUsage = match[1];
      }
    } catch {
      // Memory info not available
    }

    return {
      totalEntries: keys.length,
      parks: Array.from(parks),
      memoryUsage,
    };
  } catch (error) {
    logger.error({ err: error }, "[WeatherCache] Error getting cache stats");
    return {
      totalEntries: 0,
      parks: [],
      memoryUsage: "Error",
    };
  }
}

/**
 * Check if cache is available
 */
export async function isCacheAvailable(): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

// =============================================================================
// Current Weather Only Cache (for quick access)
// =============================================================================

/**
 * Get only current weather from cache (faster, smaller payload)
 */
export async function getCachedCurrentWeather(
  parkId: string
): Promise<CurrentWeather | null> {
  try {
    const redis = getRedisConnection();
    const key = getCacheKey(parkId, "current");
    const data = await redis.get(key);

    if (!data) {
      // Fall back to full cache
      const fullCache = await getCachedWeather(parkId);
      return fullCache?.current || null;
    }

    return JSON.parse(data) as CurrentWeather;
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error reading current weather cache for park ${parkId}`
    );
    return null;
  }
}

/**
 * Set only current weather in cache
 */
export async function setCachedCurrentWeather(
  parkId: string,
  current: CurrentWeather,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = getCacheKey(parkId, "current");
    await redis.setex(key, ttlSeconds, JSON.stringify(current));
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error caching current weather for park ${parkId}`
    );
  }
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Get cached weather for multiple parks
 */
export async function getCachedWeatherBulk(
  parkIds: string[]
): Promise<Map<string, CachedWeatherData>> {
  const result = new Map<string, CachedWeatherData>();

  try {
    const redis = getRedisConnection();
    const keys = parkIds.map((id) => getCacheKey(id));
    const values = await redis.mget(...keys);

    for (let i = 0; i < parkIds.length; i++) {
      const value = values[i];
      if (value) {
        try {
          const cached = JSON.parse(value) as CachedWeatherData;
          if (new Date(cached.expiresAt) >= new Date()) {
            result.set(parkIds[i], cached);
          }
        } catch {
          // Invalid cache entry, skip
        }
      }
    }

    logger.info(
      `[WeatherCache] Bulk read: ${result.size}/${parkIds.length} cache hits`
    );
  } catch (error) {
    logger.error({ err: error }, "[WeatherCache] Error in bulk read");
  }

  return result;
}

/**
 * Clear all weather caches (admin operation)
 */
export async function clearAllWeatherCaches(): Promise<number> {
  try {
    const redis = getRedisConnection();
    const pattern = `${CACHE_PREFIX}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info(`[WeatherCache] Cleared ${keys.length} cache entries`);
    return keys.length;
  } catch (error) {
    logger.error({ err: error }, "[WeatherCache] Error clearing all caches");
    return 0;
  }
}

// =============================================================================
// Cache Refresh Tracking
// =============================================================================

/**
 * Track when weather was last synced (independent of cache expiry)
 */
export async function setLastSyncTime(parkId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = `${CACHE_PREFIX}${parkId}:lastSync`;
    await redis.set(key, new Date().toISOString());
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error setting last sync time for park ${parkId}`
    );
  }
}

/**
 * Get when weather was last synced
 */
export async function getLastSyncTime(parkId: string): Promise<Date | null> {
  try {
    const redis = getRedisConnection();
    const key = `${CACHE_PREFIX}${parkId}:lastSync`;
    const value = await redis.get(key);

    if (!value) {
      return null;
    }

    return new Date(value);
  } catch (error) {
    logger.error(
      { err: error },
      `[WeatherCache] Error getting last sync time for park ${parkId}`
    );
    return null;
  }
}
