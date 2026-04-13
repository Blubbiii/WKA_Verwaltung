/**
 * Redis Connection Management for BullMQ
 *
 * Provides centralized Redis connection handling with connection pooling
 * for all BullMQ queues in the WindparkManager application.
 */

import Redis, { RedisOptions } from 'ioredis';
import { jobLogger as logger } from "@/lib/logger";
import { getBaseRedisOptions } from '@/lib/config/redis';

// Connection pool to reuse connections
let connection: Redis | null = null;
let subscriberConnection: Redis | null = null;

/**
 * Redis connection options for BullMQ.
 * Base URL/auth/TLS is shared; BullMQ requires specific retry semantics.
 */
const getRedisOptions = (): RedisOptions => ({
  ...getBaseRedisOptions(),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Faster connection
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('[Redis] Max retry attempts reached, giving up');
      return null;
    }
    const delay = Math.min(times * 100, 30000);
    logger.warn(`[Redis] Connection retry #${times} in ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  },
});

/**
 * Get the main Redis connection (for Queue operations)
 * Creates a new connection if one doesn't exist
 */
export const getRedisConnection = (): Redis => {
  if (!connection) {
    const options = getRedisOptions();
    connection = new Redis(options);

    connection.on('connect', () => {
      logger.info('[Redis] Connected successfully');
    });

    connection.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[Redis] Connection error');
    });

    connection.on('close', () => {
      logger.warn('[Redis] Connection closed');
    });
  }

  return connection;
};

/**
 * Get a subscriber connection (for Worker operations)
 * BullMQ requires a separate connection for subscribers
 */
export const getSubscriberConnection = (): Redis => {
  if (!subscriberConnection) {
    const options = getRedisOptions();
    subscriberConnection = new Redis(options);

    subscriberConnection.on('connect', () => {
      logger.info('[Redis:Subscriber] Connected successfully');
    });

    subscriberConnection.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[Redis:Subscriber] Connection error');
    });
  }

  return subscriberConnection;
};

/**
 * Close all Redis connections gracefully
 * Should be called during application shutdown
 */
export const closeConnections = async (): Promise<void> => {
  const closePromises: Promise<void>[] = [];

  if (connection) {
    closePromises.push(
      connection.quit().then(() => {
        connection = null;
        logger.info('[Redis] Main connection closed');
      })
    );
  }

  if (subscriberConnection) {
    closePromises.push(
      subscriberConnection.quit().then(() => {
        subscriberConnection = null;
        logger.info('[Redis:Subscriber] Connection closed');
      })
    );
  }

  await Promise.all(closePromises);
};

/**
 * Check if Redis is connected and responsive
 */
export const isRedisHealthy = async (): Promise<boolean> => {
  try {
    const redis = getRedisConnection();
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
};

/**
 * Inspect Redis server config and warn if the OOM-safety settings are weak.
 *
 * WPM stores rate-limit counters, tenant-settings cache, permission cache,
 * BullMQ job data and dashboard widgets in Redis. Without a `maxmemory` limit
 * and a sensible eviction policy the server will OOM under load and crash the
 * entire worker pool.
 *
 * Recommended production config:
 *   maxmemory 256mb (or more, depending on tenant count)
 *   maxmemory-policy allkeys-lru
 *
 * Logs a warning (not error) at startup so the operator can fix it, but the
 * app keeps running — this is a recommendation, not a hard gate.
 */
export const checkRedisMemoryConfig = async (): Promise<void> => {
  try {
    const redis = getRedisConnection();
    // CONFIG GET returns [key, value, key, value, ...] — parse into a map.
    const raw = (await redis.config("GET", "maxmemory")) as string[];
    const maxmemory = raw[1] ?? "0";
    const rawPolicy = (await redis.config("GET", "maxmemory-policy")) as string[];
    const policy = rawPolicy[1] ?? "noeviction";

    const safePolicies = new Set([
      "allkeys-lru",
      "allkeys-lfu",
      "allkeys-random",
      "volatile-lru",
      "volatile-lfu",
    ]);

    if (maxmemory === "0") {
      logger.warn(
        { maxmemory, policy },
        "[Redis] maxmemory is UNLIMITED — server will OOM under load. Set `maxmemory 256mb` (or more) in redis.conf or via CONFIG SET",
      );
    } else if (!safePolicies.has(policy)) {
      logger.warn(
        { maxmemory, policy },
        `[Redis] maxmemory-policy '${policy}' will reject writes when full. Recommended: 'allkeys-lru'`,
      );
    } else {
      logger.info(
        { maxmemory, policy },
        "[Redis] Memory config OK",
      );
    }
  } catch (err) {
    // Some managed Redis services disable CONFIG GET (e.g. Redis Cloud).
    // In that case we can't verify — log debug and move on.
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[Redis] Could not check memory config (CONFIG GET may be disabled on managed Redis)",
    );
  }
};

/**
 * BullMQ connection configuration object
 * Use this when creating new Queue or Worker instances
 */
export const getBullMQConnection = () => ({
  connection: getRedisConnection(),
});

/**
 * BullMQ worker connection configuration
 * Uses separate subscriber connection as required by BullMQ
 */
export const getBullMQWorkerConnection = () => ({
  connection: getRedisConnection(),
});
