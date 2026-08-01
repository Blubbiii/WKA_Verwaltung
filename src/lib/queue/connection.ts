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

/** Upper bound for the reconnect backoff (ms). Reconnect attempts never stop. */
const RECONNECT_MAX_DELAY_MS = 10_000;

/**
 * Redis connection options for BullMQ.
 * Base URL/auth/TLS is shared; BullMQ requires specific retry semantics.
 */
const getRedisOptions = (): RedisOptions => ({
  ...getBaseRedisOptions(),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Faster connection
  // NEVER give up reconnecting. This connection is a module singleton shared
  // by all queues and all 15 workers — returning `null` here permanently kills
  // background processing for the whole process while the process itself keeps
  // running (and the Docker healthcheck, which opens its own connection, keeps
  // reporting "healthy"). A Redis restart that takes longer than the backoff
  // budget must NOT be fatal; ioredis reconnects once Redis is back.
  retryStrategy: (times: number) => {
    // Exponential-ish ramp, capped at RECONNECT_MAX_DELAY_MS.
    const delay = Math.min(times * 200, RECONNECT_MAX_DELAY_MS);
    // Log the first attempts verbosely, then throttle to avoid log floods
    // during a long outage (one line per ~minute at the capped delay).
    if (times <= 5 || times % 10 === 0) {
      logger.warn(`[Redis] Connection retry #${times} in ${delay}ms`);
    }
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
 * BullMQ job data and dashboard widgets in ONE Redis instance. Cache und Queue
 * stellen dabei gegensaetzliche Anforderungen, und die Verdraengungsstrategie
 * gilt serverweit — sie laesst sich nicht pro Zweck einstellen.
 *
 * Fuer einen reinen Cache ist `allkeys-lru` richtig: laeuft der Speicher voll,
 * fliegt der aelteste Eintrag raus und wird beim naechsten Zugriff neu
 * berechnet. Fuer BullMQ ist genau das fatal — dort ist der verdraengte
 * Schluessel ein Auftrag. Eine Rechnung, ein Mahnlauf, ein OCR-Durchgang
 * verschwindet dann lautlos: kein Fehler, kein Log, der Job war nie da.
 *
 * Deshalb `noeviction`, obwohl es der Cache-Logik widerspricht. Ist der
 * Speicher voll, scheitern Schreibvorgaenge sichtbar statt Auftraege still zu
 * verschwinden. Ein fehlgeschlagener Cache-Schreibvorgang kostet eine
 * Neuberechnung; ein verlorener Job kostet einen Geschaeftsvorfall.
 *
 * Empfohlene Produktionskonfiguration:
 *   maxmemory 256mb (oder mehr, je nach Mandantenzahl)
 *   maxmemory-policy noeviction
 *
 * Beides gehoert zusammen: `noeviction` OHNE `maxmemory` heisst unbegrenzt
 * wachsen, bis der Host stirbt.
 *
 * Warnung, kein Abbruch — der Betreiber soll es sehen und richten koennen,
 * ohne dass die Anwendung stehen bleibt.
 */
export const checkRedisMemoryConfig = async (): Promise<void> => {
  try {
    const redis = getRedisConnection();
    // CONFIG GET returns [key, value, key, value, ...] — parse into a map.
    const raw = (await redis.config("GET", "maxmemory")) as string[];
    const maxmemory = raw[1] ?? "0";
    const rawPolicy = (await redis.config("GET", "maxmemory-policy")) as string[];
    const policy = rawPolicy[1] ?? "noeviction";

    let complained = false;

    if (maxmemory === "0") {
      logger.warn(
        { maxmemory, policy },
        "[Redis] maxmemory ist UNBEGRENZT — der Server waechst unter Last bis zum OOM. Setze `maxmemory 256mb` (oder mehr) in redis.conf bzw. per CONFIG SET",
      );
      complained = true;
    }

    if (policy.startsWith("allkeys-")) {
      // Trifft JEDEN Schluessel, also auch BullMQ-Job-Hashes und Queue-Listen.
      logger.warn(
        { maxmemory, policy },
        `[Redis] maxmemory-policy '${policy}' verdraengt bei vollem Speicher auch BullMQ-Schluessel — Auftraege verschwinden dann OHNE Fehlermeldung. Erforderlich: 'noeviction'`,
      );
      complained = true;
    } else if (policy.startsWith("volatile-")) {
      // Trifft nur Schluessel mit Ablaufzeit. BullMQ setzt die auf seinen
      // Sperren — eine verdraengte Sperre laesst denselben Job doppelt laufen.
      logger.warn(
        { maxmemory, policy },
        `[Redis] maxmemory-policy '${policy}' verdraengt Schluessel mit Ablaufzeit, darunter die Job-Sperren von BullMQ — derselbe Auftrag kann dann doppelt laufen. Empfohlen: 'noeviction'`,
      );
      complained = true;
    }

    if (!complained) {
      logger.info({ maxmemory, policy }, "[Redis] Memory config OK");
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
