/**
 * Maintenance Queue — wiederkehrende Prüfläufe ohne Nutzlast.
 *
 * Bündelt drei Läufe, die es bisher nur als HTTP-Endpunkte unter `/api/cron/*`
 * gab und die deshalb nie liefen (es gab keinen Aufrufer):
 *
 *   - `check-deadlines`        täglich 07:00 — Fristen prüfen, benachrichtigen
 *   - `bundesbank-rates`       montags 04:00 — Basiszinssatz § 247 BGB
 *   - `bank-connection-check`  täglich 06:00 — stumme Bankverbindungen melden
 *
 * ## Warum EINE Queue mit drei Job-Namen
 *
 * Die übrigen Anliegen haben je eine eigene Queue. Hier wären das drei Queues,
 * drei Worker und drei Registry-Einträge für drei Prüfungen ohne Nutzlast,
 * ohne Parallelität und ohne eigene Fehlerbehandlung — rund 900 Zeilen
 * Zeremonie ohne Unterscheidungskraft.
 *
 * Verteilung nach Job-Namen ist im Codebase bereits etabliert: `billing` und
 * `pdf` machen es genauso. Der Job-Name steht im Log, im Ergebnis und im
 * Dead-Letter-Eintrag — verloren geht dadurch nichts.
 *
 * Getrennte Queues wären richtig, sobald einer der Läufe eigene Parallelität,
 * eigene Wiederholungsregeln oder eine eigene Rate-Begrenzung braucht.
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_SCHEDULES, CRON_TIMEZONE } from "@/lib/config/cron-schedules";
import { removeRepeatableJobs } from "../repeatable";
import type {
  DeadlineCheckResult,
  BankConnectionCheckResult,
} from "@/lib/maintenance/tasks";
import type { BundesbankFetchResult } from "@/lib/accounting/bundesbank-fetch";

export const MAINTENANCE_QUEUE_NAME = "maintenance";

/**
 * Job-Namen. Zugleich die stabilen Repeat-IDs — BullMQ dedupliziert darüber,
 * ein wiederholter Start registriert also nichts doppelt.
 */
export const MAINTENANCE_JOBS = {
  DEADLINE_CHECK: "check-deadlines",
  BUNDESBANK_RATES: "bundesbank-rates",
  BANK_CONNECTION_CHECK: "bank-connection-check",
} as const;

export type MaintenanceJobName =
  (typeof MAINTENANCE_JOBS)[keyof typeof MAINTENANCE_JOBS];

/** Kein Job dieser Queue braucht Eingaben — alle laufen system-weit. */
export type MaintenanceJobData = Record<string, never>;

export type MaintenanceJobResult =
  | DeadlineCheckResult
  | BankConnectionCheckResult
  | BundesbankFetchResult;

const defaultJobOptions = getJobOptions("background");

let maintenanceQueue: Queue<MaintenanceJobData, MaintenanceJobResult> | null = null;

export const getMaintenanceQueue = (): Queue<
  MaintenanceJobData,
  MaintenanceJobResult
> => {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue<MaintenanceJobData, MaintenanceJobResult>(
      MAINTENANCE_QUEUE_NAME,
      { ...getBullMQConnection(), defaultJobOptions },
    );
    logger.info(`[Queue:${MAINTENANCE_QUEUE_NAME}] Initialized`);
  }
  return maintenanceQueue;
};

/**
 * Zeitplan je Job. Alle drei sind über CRON_* überschreibbar.
 */
const SCHEDULES: { name: MaintenanceJobName; pattern: string; label: string }[] = [
  {
    name: MAINTENANCE_JOBS.DEADLINE_CHECK,
    pattern: CRON_SCHEDULES.DEADLINE_CHECK,
    label: "Fristenprüfung",
  },
  {
    name: MAINTENANCE_JOBS.BUNDESBANK_RATES,
    pattern: CRON_SCHEDULES.BUNDESBANK_RATES,
    label: "Bundesbank-Basiszinssatz",
  },
  {
    name: MAINTENANCE_JOBS.BANK_CONNECTION_CHECK,
    pattern: CRON_SCHEDULES.BANK_CONNECTION_CHECK,
    label: "Bankverbindungen",
  },
];

/**
 * Registriert alle drei Repeat-Jobs.
 *
 * IDEMPOTENT: BullMQ dedupliziert über die jobId, ein wiederholter Aufruf
 * erzeugt also keine Doppelläufe. Wichtig, weil der Worker-Prozess neu starten
 * kann, ohne dass die Repeats aus Redis verschwinden.
 *
 * Ein Fehler bei einem der drei bricht die übrigen NICHT ab — sonst risse ein
 * fehlgeschlagener Bundesbank-Eintrag die Fristenprüfung mit sich.
 */
export const scheduleMaintenanceJobs = async (): Promise<MaintenanceJobName[]> => {
  const queue = getMaintenanceQueue();
  const scheduled: MaintenanceJobName[] = [];

  for (const entry of SCHEDULES) {
    try {
      await queue.add(
        entry.name,
        {} as MaintenanceJobData,
        {
          repeat: { pattern: entry.pattern, tz: CRON_TIMEZONE },
          jobId: entry.name,
        },
      );
      scheduled.push(entry.name);
      logger.info(
        { queue: MAINTENANCE_QUEUE_NAME, job: entry.name, pattern: entry.pattern },
        `[Queue:${MAINTENANCE_QUEUE_NAME}] ${entry.label} geplant (${entry.pattern})`,
      );
    } catch (err) {
      logger.error(
        { queue: MAINTENANCE_QUEUE_NAME, job: entry.name, err },
        `[Queue:${MAINTENANCE_QUEUE_NAME}] ${entry.label} konnte nicht geplant werden`,
      );
    }
  }

  return scheduled;
};

/**
 * Einen der Läufe sofort anstoßen (Oberfläche, Nachziehen, Prüfen).
 */
export const enqueueMaintenanceNow = async (name: MaintenanceJobName) => {
  const queue = getMaintenanceQueue();
  return queue.add(name, {} as MaintenanceJobData, {
    jobId: `${name}-manual-${Date.now()}`,
  });
};

export const removeMaintenanceSchedules = async (): Promise<number> => {
  const queue = getMaintenanceQueue();
  let removed = 0;
  for (const entry of SCHEDULES) {
    // F20: kein handgebauter Repeat-Key — seit `tz` gesetzt ist, lautet das
    // Format `name:jobId::<tz>:pattern`. Der Helper scannt statt zu rechnen.
    removed += await removeRepeatableJobs(queue, {
      name: entry.name,
      jobId: entry.name,
    });
  }
  return removed;
};

export const closeMaintenanceQueue = async (): Promise<void> => {
  if (maintenanceQueue) {
    await maintenanceQueue.close();
    maintenanceQueue = null;
    logger.info(`[Queue:${MAINTENANCE_QUEUE_NAME}] Closed`);
  }
};
