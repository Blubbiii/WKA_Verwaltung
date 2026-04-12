/**
 * Centralized Redis configuration.
 *
 * All Redis consumers (cache, queue, rate-limit) should import from here
 * instead of duplicating the URL parsing logic. Only the per-consumer
 * options (retries, timeouts, maxRetriesPerRequest) vary.
 */

import type { RedisOptions } from "ioredis";

/** Default Redis URL when REDIS_URL env var is not set. */
export const DEFAULT_REDIS_URL = "redis://localhost:6379";

/** Get the raw Redis URL from env, falling back to the default. */
export function getRedisUrl(): string {
  return process.env.REDIS_URL || DEFAULT_REDIS_URL;
}

/**
 * Parse REDIS_URL into base ioredis options (host, port, auth, TLS).
 *
 * Consumer-specific fields (retryStrategy, maxRetriesPerRequest,
 * connectTimeout, lazyConnect) should be added by the caller after
 * spreading this result.
 */
export function getBaseRedisOptions(): RedisOptions {
  const redisUrl = getRedisUrl();

  try {
    const url = new URL(redisUrl);

    const options: RedisOptions = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
    };

    if (url.password) {
      options.password = decodeURIComponent(url.password);
    }

    if (url.username && url.username !== "default") {
      options.username = url.username;
    }

    if (url.protocol === "rediss:") {
      options.tls = {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      };
    }

    return options;
  } catch {
    // Invalid URL, return localhost defaults
    return {
      host: "localhost",
      port: 6379,
    };
  }
}
