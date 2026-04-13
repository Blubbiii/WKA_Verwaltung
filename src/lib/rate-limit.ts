import { NextResponse } from "next/server";
import Redis from "ioredis";
import { apiLogger } from "@/lib/logger";
import { getBaseRedisOptions } from "@/lib/config/redis";
import { apiError } from "@/lib/api-errors";

/**
 * Redis-backed sliding window rate limiter for Next.js API routes.
 *
 * Strategy: INCR + EXPIRE pipeline on a key `ratelimit:${identifier}`.
 * The counter is reset by Redis TTL (= windowMs in seconds), giving a
 * fixed-window approximation. This is atomic enough for most API-protection
 * use cases and requires no Lua scripting.
 *
 * When Redis is unavailable the module falls back to an in-memory
 * implementation so that a Redis outage never causes legitimate requests
 * to be denied (fail-open policy).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  success: boolean;
  /** How many requests remain in the current window. */
  remaining: number;
  /** Unix timestamp (ms) when the window resets for the oldest tracked hit. */
  reset: number;
}

// ---------------------------------------------------------------------------
// Preset configurations
// ---------------------------------------------------------------------------

/** 5 requests per 15 minutes -- for authentication endpoints. */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

/** 20 requests per minute -- for file upload endpoints. */
export const UPLOAD_RATE_LIMIT: RateLimitConfig = {
  limit: 20,
  windowMs: 60 * 1000,
};

/** 10 requests per minute -- for PDF generation endpoints. */
export const PDF_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 60 * 1000,
};

/** 100 requests per minute -- general API endpoints. */
export const API_RATE_LIMIT: RateLimitConfig = {
  limit: 100,
  windowMs: 60 * 1000,
};

/** 10 requests per 5 minutes -- for public technician check-in/out endpoints. */
export const TECHNICIAN_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 5 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Redis connection (reuses the same REDIS_URL as the cache layer)
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;
let redisAvailable = false;
/** Set to true once a connection attempt has been completed (success or fail). */
let redisInitialised = false;

/**
 * Lazily create and return the shared Redis client for rate limiting.
 * Returns null when Redis is unavailable so callers can fall back gracefully.
 */
async function getRedisClient(): Promise<Redis | null> {
  // Fast path: already connected.
  if (redisClient && redisAvailable) {
    return redisClient;
  }

  // If we already know Redis is down, do not keep retrying on every request.
  if (redisInitialised && !redisAvailable) {
    return null;
  }

  redisInitialised = true;

  try {
    redisClient = new Redis({
      ...getBaseRedisOptions(),
      maxRetriesPerRequest: parseInt(process.env.REDIS_RATELIMIT_MAX_RETRIES || "1"),
      connectTimeout: parseInt(process.env.REDIS_RATELIMIT_CONNECT_TIMEOUT_MS || "3000"),
      lazyConnect: true,
    });

    redisClient.on("error", (err: Error) => {
      if (redisAvailable) {
        // Only log when we transition from available → unavailable
        apiLogger.warn({ err }, "rate-limit: Redis error, switching to in-memory fallback");
      }
      redisAvailable = false;
    });

    redisClient.on("connect", () => {
      if (!redisAvailable) {
        apiLogger.info("rate-limit: Redis reconnected, switching back to Redis backend");
      }
      redisAvailable = true;
    });

    await redisClient.connect();
    await redisClient.ping();
    redisAvailable = true;

    return redisClient;
  } catch (err) {
    apiLogger.warn({ err }, "rate-limit: Could not connect to Redis, using in-memory fallback");
    redisAvailable = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Redis-backed rate limit check
// ---------------------------------------------------------------------------

/**
 * Attempt a rate limit check against Redis.
 * Returns null when Redis is unavailable so the caller can fall back.
 */
async function rateLimitRedis(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  const { limit, windowMs } = config;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const redisKey = `ratelimit:${identifier}`;

  try {
    // Pipeline: INCR first, then conditionally EXPIRE.
    // INCR is atomic; EXPIRE only needs to fire on the first request in a
    // window (when count transitions from 0 → 1), which is why we always
    // send it — Redis ignores EXPIRE if the key already has a TTL and the
    // NX flag is used below.
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    // Set TTL only when the key is newly created (XX = only if exists without
    // expiry is not what we want; NX = only set if key has no expiry).
    // Simplest correct approach: always call EXPIRE. For an already-existing
    // key Redis will simply refresh the TTL, which is acceptable for a
    // fixed-window counter — it is already the documented trade-off of this
    // pattern. Use EXPIRE only on the first hit by checking count after.
    pipeline.ttl(redisKey);
    const results = await pipeline.exec();

    if (!results) return null;

    const [incrResult, ttlResult] = results;
    if (incrResult[0] || ttlResult[0]) {
      // Command-level error inside the pipeline
      apiLogger.warn(
        { incrErr: incrResult[0], ttlErr: ttlResult[0] },
        "rate-limit: Redis pipeline command error"
      );
      return null;
    }

    const count = incrResult[1] as number;
    const currentTtl = ttlResult[1] as number;

    // If the key has no TTL (new key or TTL was lost) set it now.
    if (currentTtl === -1) {
      // Fire-and-forget; if this fails the key will eventually expire via the
      // next request's EXPIRE call.
      redis.expire(redisKey, ttlSeconds).catch(() => {
        /* ignore */
      });
    }

    // Compute reset time from remaining TTL.
    // If TTL is -1 (just set above) use the full window duration.
    const remainingTtlMs =
      currentTtl > 0 ? currentTtl * 1000 : windowMs;
    const reset = Date.now() + remainingTtlMs;

    if (count > limit) {
      return {
        success: false,
        remaining: 0,
        reset,
      };
    }

    return {
      success: true,
      remaining: limit - count,
      reset,
    };
  } catch (err) {
    apiLogger.warn({ err, key: redisKey }, "rate-limit: Redis command error, falling back to memory");
    redisAvailable = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (original implementation)
// ---------------------------------------------------------------------------

/**
 * Map of identifier -> sorted array of request timestamps (newest last).
 * Only used when Redis is unavailable.
 */
const memoryStore = new Map<string, number[]>();
let maxWindowMs = 0;

const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer !== null) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - (maxWindowMs || 60 * 1000);

    for (const [key, timestamps] of memoryStore.entries()) {
      if (
        timestamps.length === 0 ||
        timestamps[timestamps.length - 1] < cutoff
      ) {
        memoryStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  if (
    cleanupTimer &&
    typeof cleanupTimer === "object" &&
    "unref" in cleanupTimer
  ) {
    cleanupTimer.unref();
  }
}

startCleanup();

function rateLimitMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { limit, windowMs } = config;
  const now = Date.now();
  const windowStart = now - windowMs;

  if (windowMs > maxWindowMs) {
    maxWindowMs = windowMs;
  }

  let timestamps = memoryStore.get(identifier);
  if (!timestamps) {
    timestamps = [];
    memoryStore.set(identifier, timestamps);
  }

  const firstValidIndex = timestamps.findIndex((t) => t > windowStart);
  if (firstValidIndex === -1) {
    timestamps.length = 0;
  } else if (firstValidIndex > 0) {
    timestamps.splice(0, firstValidIndex);
  }

  const reset =
    timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;

  if (timestamps.length >= limit) {
    return { success: false, remaining: 0, reset };
  }

  timestamps.push(now);

  return {
    success: true,
    remaining: limit - timestamps.length,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a request identified by `identifier` is within the rate
 * limit defined by `config`.
 *
 * Tries Redis first. Falls back to the in-memory implementation when Redis
 * is unavailable (fail-open: the request is allowed and a warning is logged).
 *
 * Usage:
 * ```ts
 * const ip = getClientIp(request);
 * const result = await rateLimit(`${ip}:/api/auth/forgot-password`, AUTH_RATE_LIMIT);
 * if (!result.success) {
 *   return getRateLimitResponse(result);
 * }
 * ```
 *
 * NOTE: The function signature is intentionally async. All existing callers
 * that previously used the synchronous version should add `await`.
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Try Redis first.
  const redisResult = await rateLimitRedis(identifier, config);
  if (redisResult !== null) {
    return redisResult;
  }

  // Fall back to in-memory implementation.
  return rateLimitMemory(identifier, config);
}

// ---------------------------------------------------------------------------
// Helper: extract client IP from request headers
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from common proxy headers.
 *
 * Only trusts X-Forwarded-For / X-Real-IP when TRUSTED_PROXY_IPS is set
 * (comma-separated list of trusted reverse-proxy IPs, e.g. "192.168.1.1").
 * Without that env var the headers are ignored to prevent IP spoofing that
 * would allow bypassing rate limits.
 *
 * Falls back to `"unknown"` when no trusted header is present.
 */
export function getClientIp(request: Request): string {
  const trustedProxies = process.env.TRUSTED_PROXY_IPS
    ? process.env.TRUSTED_PROXY_IPS.split(",").map((s) => s.trim())
    : [];

  // Only trust forwarded headers when running behind a known reverse proxy
  if (trustedProxies.length > 0) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Helper: build a 429 response with standard rate-limit headers
// ---------------------------------------------------------------------------

/**
 * Returns a `NextResponse` with HTTP 429 (Too Many Requests) and the
 * standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`
 * and `X-RateLimit-Reset` headers.
 */
export function getRateLimitResponse(
  result?: RateLimitResult,
  config?: RateLimitConfig
): NextResponse {
  const now = Date.now();
  const reset = result?.reset ?? now + 60_000;
  const retryAfterSeconds = Math.ceil((reset - now) / 1000);

  const headers: Record<string, string> = {
    "Retry-After": String(Math.max(retryAfterSeconds, 1)),
    "X-RateLimit-Remaining": String(result?.remaining ?? 0),
    "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
  };

  if (config) {
    headers["X-RateLimit-Limit"] = String(config.limit);
  }

  return apiError("RATE_LIMITED", 429, {
    message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
    headers,
  });
}
