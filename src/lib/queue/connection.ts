/**
 * Redis Connection Management for BullMQ
 *
 * Provides centralized Redis connection handling with connection pooling
 * for all BullMQ queues in the WindparkManager application.
 */

import Redis, { RedisOptions } from 'ioredis';
import { jobLogger as logger } from "@/lib/logger";

// Connection pool to reuse connections
let connection: Redis | null = null;
let subscriberConnection: Redis | null = null;

/**
 * Redis connection options derived from environment variables
 */
const getRedisOptions = (): RedisOptions => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Parse Redis URL
  const url = new URL(redisUrl);

  const options: RedisOptions = {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Faster connection
    retryStrategy: (times: number) => {
      if (times > 10) {
        // Stop retrying after 10 attempts
        logger.error('[Redis] Max retry attempts reached, giving up');
        return null;
      }
      // Exponential backoff: 100ms, 200ms, 400ms, ... max 30s
      const delay = Math.min(times * 100, 30000);
      logger.warn(`[Redis] Connection retry #${times} in ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some(e => err.message.includes(e));
    },
  };

  // Add password if present in URL
  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }

  // Add username if present (Redis 6+ ACL)
  if (url.username && url.username !== 'default') {
    options.username = url.username;
  }

  // TLS support for production (rediss:// protocol)
  if (url.protocol === 'rediss:') {
    options.tls = {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    };
  }

  return options;
};

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
