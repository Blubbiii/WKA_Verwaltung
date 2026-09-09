/**
 * Redis Connection Management for BullMQ
 *
 * Provides centralized Redis connection handling with connection pooling
 * for all BullMQ queues in the WindparkManager application.
 */

import Redis, { RedisOptions } from 'ioredis';
import { jobLogger as logger } from "@/lib/logger";
import { getBaseRedisOptions } from '@/lib/config/redis';
import { mitFrist } from '@/lib/util/frist';

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
 * Obergrenze fuer die Redis-Lebendpruefung.
 *
 * Ein gesundes Redis antwortet auf PING in Millisekunden — auch unter Last.
 * Wer nach dieser Zeit nicht geantwortet hat, ist fuer jeden praktischen Zweck
 * nicht verfuegbar.
 */
const PING_TIMEOUT_MS = 1_000;

/**
 * Check if Redis is connected and responsive.
 *
 * ## Warum hier eine Frist steht
 *
 * Die Fassung ohne Frist war:
 *
 *     const result = await redis.ping();
 *     return result === 'PONG';
 *
 * Das sieht sicher aus — es steht ja ein `try/catch` darum. Nur wirft hier
 * nichts.
 *
 * BullMQ verlangt `maxRetriesPerRequest: null` (siehe `getRedisOptions`
 * oben), und der `retryStrategy` gibt bewusst NIE auf. Beides zusammen heisst
 * in ioredis: ein Befehl, der bei getrennter Verbindung abgesetzt wird, landet
 * in der Offline-Warteschlange und wartet dort — unbegrenzt. Er scheitert
 * nicht, er antwortet einfach nie. Das `catch` faengt nichts, weil es nichts
 * zu fangen gibt.
 *
 * Ausgerechnet die Funktion, deren einzige Aufgabe die Frage „lebt Redis?"
 * ist, konnte damit nur antworten, wenn Redis lebt. War es tot, blieb die
 * Antwort aus.
 *
 * ## Was das anrichtete
 *
 * Gemessen bei abgeschaltetem Redis: `/api/admin/jobs`,
 * `/api/admin/jobs/stats` und `/api/admin/system/status` gaben nach 45
 * Sekunden noch immer keine Antwort — kein Fehler, keine Meldung, die Seite
 * dreht sich weiter. Die beiden letzteren pruefen sogar korrekt vorab auf
 * `isRedisHealthy()` und haben eine fertige 503-Antwort parat; sie kamen nur
 * nie bis dorthin.
 *
 * Jeder haengende Aufruf haelt ausserdem eine Verbindung offen. Ein
 * Redis-Ausfall wird so von einer Teilstoerung (Hintergrundjobs stehen) zu
 * einer Belastung des Webservers.
 *
 * `/api/health` hatte das Problem bereits erkannt und mit einem eigenen
 * `withTimeout` an SEINER Aufrufstelle umgangen. Die Falle blieb damit fuer
 * alle anderen Aufrufer bestehen — deshalb steht die Frist jetzt hier, in der
 * Funktion selbst.
 */
export const isRedisHealthy = async (): Promise<boolean> => {
  try {
    const redis = getRedisConnection();

    /*
      Erst den Verbindungszustand ansehen, dann erst einen Befehl absetzen.

      Die Frist allein reicht nicht. Sie beendet unser Warten — den Befehl
      beendet sie nicht. Ein `PING`, der bei getrennter Verbindung abgesetzt
      wird, liegt danach weiter in der Offline-Warteschlange von ioredis. Bei
      einer Pruefung im Sekundentakt sammeln sich dort waehrend eines Ausfalls
      beliebig viele an; kommt Redis zurueck, laufen sie alle auf einmal los.
      `status` ist eine reine Zustandsabfrage und stellt nichts an.

      Die drei Faelle sind NICHT dasselbe, und genau daran waere eine
      einfache Abfrage `status !== 'ready' -> false` gescheitert:

      - `ready`      → verbunden, es darf gefragt werden.
      - `connecting` / `connect` → der Aufbau laeuft noch. Das ist der
        Normalfall unmittelbar nach dem Serverstart, denn die Verbindung wird
        erst beim ersten Zugriff angelegt. Hier "nicht verfuegbar" zu melden,
        wuerde dem ersten Aufrufer nach jedem Neustart eine 503 zeigen,
        obwohl Redis laeuft. Also kurz auf `ready` warten.
      - alles andere (`reconnecting`, `close`, `end`) → Redis ist weg. Sofort
        `false`, ohne einen Befehl abzusetzen.
    */
    if (redis.status !== "ready") {
      if (redis.status !== "connecting" && redis.status !== "connect") {
        return false;
      }
      const bereit = await mitFrist(
        new Promise<true>((aufloesen) => redis.once("ready", () => aufloesen(true))),
        PING_TIMEOUT_MS,
      );
      if (bereit !== true) return false;
    }

    // Die Frist bleibt: zwischen Zustandsabfrage und Antwort kann die
    // Verbindung wegbrechen.
    const pong = await mitFrist(redis.ping(), PING_TIMEOUT_MS);
    return pong === "PONG";
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
