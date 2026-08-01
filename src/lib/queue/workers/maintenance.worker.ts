/**
 * Maintenance Worker — verarbeitet die drei wiederkehrenden Prüfläufe.
 *
 * Verteilt nach Job-Namen, wie `billing` und `pdf` es auch tun. Ein
 * unbekannter Name wirft ausdrücklich, statt still nichts zu tun: sonst sähe
 * ein Tippfehler im Zeitplan aus wie ein erfolgreich gelaufener Job.
 *
 * Alle drei Läufe sind wiederholbar ohne Schaden:
 *   - Fristenprüfung legt Benachrichtigungen nur an, wenn es sie noch nicht gibt
 *   - Bundesbank überspringt bereits vorhandene Sätze (`skipped`)
 *   - Bankprüfung liest und schreibt nur den Fehlergrund fort
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import {
  MAINTENANCE_QUEUE_NAME,
  MAINTENANCE_JOBS,
  type MaintenanceJobData,
  type MaintenanceJobResult,
} from "../queues/maintenance.queue";

const logger = jobLogger.child({ component: "maintenance-worker" });

let maintenanceWorker: Worker<MaintenanceJobData, MaintenanceJobResult> | null =
  null;

async function processMaintenanceJob(
  job: Job<MaintenanceJobData, MaintenanceJobResult>,
): Promise<MaintenanceJobResult> {
  // Dynamischer Import wie in den übrigen Workern — hält Prisma und die
  // Fachmodule aus dem Modul-Ladepfad des Workers heraus.
  const tasks = await import("@/lib/maintenance/tasks");

  logger.info({ jobId: job.id, job: job.name }, "[MaintenanceWorker] Start");

  switch (job.name) {
    case MAINTENANCE_JOBS.DEADLINE_CHECK:
      return tasks.runDeadlineCheck();

    case MAINTENANCE_JOBS.BUNDESBANK_RATES:
      return tasks.runBundesbankRateFetch();

    case MAINTENANCE_JOBS.BANK_CONNECTION_CHECK:
      return tasks.runBankConnectionCheck();

    default:
      // Lautes Scheitern statt stillem Erfolg: ein Job-Name, den niemand
      // verarbeitet, ist ein Fehler im Zeitplan und muss auffallen.
      throw new Error(
        `[MaintenanceWorker] Unbekannter Job-Name "${job.name}" — kein Verarbeiter registriert`,
      );
  }
}

export function startMaintenanceWorker(): Worker<
  MaintenanceJobData,
  MaintenanceJobResult
> {
  if (maintenanceWorker) {
    logger.info("[MaintenanceWorker] Already running");
    return maintenanceWorker;
  }

  maintenanceWorker = new Worker<MaintenanceJobData, MaintenanceJobResult>(
    MAINTENANCE_QUEUE_NAME,
    processMaintenanceJob,
    {
      connection: getRedisConnection(),
      // Cron-Läufe, kein Bedarf an Parallelität. Zugleich verhindert 1, dass
      // sich zwei Fristenprüfungen überholen, falls ein Lauf lange braucht.
      concurrency: 1,
      useWorkerThreads: false,
    },
  );

  maintenanceWorker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, job: job.name, result },
      "[MaintenanceWorker] Job completed",
    );
  });

  maintenanceWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, job: job?.name, err: error.message },
      "[MaintenanceWorker] Job failed",
    );
  });

  maintenanceWorker.on("error", (error) => {
    logger.error({ err: error.message }, "[MaintenanceWorker] Worker error");
  });

  logger.info("[MaintenanceWorker] Started");

  return maintenanceWorker;
}

export async function stopMaintenanceWorker(): Promise<void> {
  if (!maintenanceWorker) {
    return;
  }
  await maintenanceWorker.close();
  maintenanceWorker = null;
  logger.info("[MaintenanceWorker] Stopped");
}

export function isMaintenanceWorkerRunning(): boolean {
  return maintenanceWorker !== null && !maintenanceWorker.closing;
}

export function getMaintenanceWorker(): Worker<
  MaintenanceJobData,
  MaintenanceJobResult
> | null {
  return maintenanceWorker;
}

export type { MaintenanceJobData, MaintenanceJobResult };
