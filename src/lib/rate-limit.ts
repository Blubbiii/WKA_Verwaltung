import { NextResponse } from "next/server";

/**
 * In-memory sliding window rate limiter for Next.js API routes.
 *
 * Each identifier (typically IP + route path) maintains a list of request
 * timestamps. When `rateLimit` is called the list is pruned to the current
 * window and checked against the configured limit.
 *
 * A background cleanup runs every 60 seconds to remove entries whose most
 * recent request is older than any active window, preventing unbounded
 * memory growth.
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

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Map of identifier -> sorted array of request timestamps (newest last).
 * Using a simple array is efficient enough for the expected per-key volume
 * (at most `limit` entries per window).
 */
const store = new Map<string, number[]>();

/**
 * The largest windowMs value seen so far. Used during cleanup to determine
 * which entries are safe to evict.
 */
let maxWindowMs = 0;

// ---------------------------------------------------------------------------
// Automatic cleanup of expired entries (every 60 seconds)
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer !== null) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    // Use the largest window we have ever seen so we never prune entries
    // that might still be relevant for a longer window.
    const cutoff = now - (maxWindowMs || 60 * 1000);

    for (const [key, timestamps] of store.entries()) {
      // Because timestamps are appended in order the last element is the
      // most recent. If even the most recent one is older than the cutoff
      // the whole entry can be removed.
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the Node.js process to exit even if the timer is still active.
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// Start cleanup on module load.
startCleanup();

// ---------------------------------------------------------------------------
// Core rate limiting function
// ---------------------------------------------------------------------------

/**
 * Check whether a request identified by `identifier` is within the rate
 * limit defined by `config`.
 *
 * Usage:
 * ```ts
 * const ip = request.headers.get("x-forwarded-for") || "unknown";
 * const result = rateLimit(`${ip}:/api/auth/forgot-password`, AUTH_RATE_LIMIT);
 * if (!result.success) {
 *   return getRateLimitResponse(result);
 * }
 * ```
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { limit, windowMs } = config;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Track the largest window for cleanup purposes.
  if (windowMs > maxWindowMs) {
    maxWindowMs = windowMs;
  }

  // Retrieve (or initialise) the timestamps for this identifier.
  let timestamps = store.get(identifier);
  if (!timestamps) {
    timestamps = [];
    store.set(identifier, timestamps);
  }

  // Prune timestamps that have fallen outside the current window.
  // Because timestamps are in ascending order we can find the first index
  // inside the window and slice from there.
  const firstValidIndex = timestamps.findIndex((t) => t > windowStart);
  if (firstValidIndex === -1) {
    // All timestamps are outside the window -- clear the list.
    timestamps.length = 0;
  } else if (firstValidIndex > 0) {
    timestamps.splice(0, firstValidIndex);
  }

  // Determine the reset time. If there are existing hits the window resets
  // relative to the oldest remaining hit. Otherwise it resets relative to now.
  const reset =
    timestamps.length > 0
      ? timestamps[0] + windowMs
      : now + windowMs;

  // Check against the limit.
  if (timestamps.length >= limit) {
    return {
      success: false,
      remaining: 0,
      reset,
    };
  }

  // Record the current request.
  timestamps.push(now);

  return {
    success: true,
    remaining: limit - timestamps.length,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Helper: extract client IP from request headers
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from common proxy headers.
 * Falls back to `"unknown"` when no header is present.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain a comma-separated list; take the first one.
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

// ---------------------------------------------------------------------------
// Helper: build a 429 response with standard rate-limit headers
// ---------------------------------------------------------------------------

/**
 * Returns a `NextResponse` with HTTP 429 (Too Many Requests) and the
 * standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`
 * and `X-RateLimit-Reset` headers.
 *
 * If a `RateLimitResult` is passed the headers are populated from it.
 * Otherwise sensible defaults are used.
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

  return NextResponse.json(
    {
      error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
    },
    {
      status: 429,
      headers,
    }
  );
}
