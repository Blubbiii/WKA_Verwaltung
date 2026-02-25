/**
 * Worker Registry - Zentrale Verwaltung aller BullMQ Worker
 *
 * Stellt Funktionen bereit zum:
 * - Starten aller Worker
 * - Stoppen aller Worker (graceful shutdown)
 * - Selektives Starten einzelner Worker
 * - Health-Check Status
 */

import { Worker } from "bullmq";
import { jobLogger } from "@/lib/logger";

const logger = jobLogger.child({ component: "worker-registry" });

// Worker imports
import {
  startEmailWorker,
  stopEmailWorker,
  isEmailWorkerRunning,
  getEmailWorker,
  type EmailJobData,
  type EmailJobResult,
} from "./email.worker";

import {
  startPdfWorker,
  stopPdfWorker,
  isPdfWorkerRunning,
  getPdfWorker,
  type PdfJobData,
  type PdfJobResult,
} from "./pdf.worker";

import {
  startBillingWorker,
  stopBillingWorker,
  isBillingWorkerRunning,
  getBillingWorker,
  type BillingJobData,
  type BillingJobResult,
} from "./billing.worker";

import {
  startWeatherWorker,
  stopWeatherWorker,
  isWeatherWorkerRunning,
  getWeatherWorker,
} from "./weather.worker";
import type { WeatherJobData, WeatherJobResult } from "../queues/weather.queue";

import {
  startReportWorker,
  stopReportWorker,
  isReportWorkerRunning,
  getReportWorker,
} from "./report.worker";
import type { ReportJobData, ReportJobResult } from "./report.worker";

import {
  startReminderWorker,
  stopReminderWorker,
  isReminderWorkerRunning,
  getReminderWorker,
} from "./reminder.worker";
import type { ReminderJobData, ReminderJobResult } from "../queues/reminder.queue";

import {
  startScadaAutoImportWorker,
  stopScadaAutoImportWorker,
  isScadaAutoImportWorkerRunning,
  getScadaAutoImportWorker,
} from "./scada-auto-import.worker";
import type { ScadaAutoImportJobData, ScadaAutoImportJobResult } from "../queues/scada-auto-import.queue";

import {
  startPaperlessWorker,
  stopPaperlessWorker,
  isPaperlessWorkerRunning,
  getPaperlessWorker,
} from "./paperless.worker";
import type { PaperlessJobData, PaperlessJobResult } from "../queues/paperless.queue";

// =============================================================================
// Types
// =============================================================================

/**
 * Worker-Namen als Konstanten
 */
export const WORKER_NAMES = {
  EMAIL: "email",
  PDF: "pdf",
  BILLING: "billing",
  WEATHER: "weather",
  REPORT: "report",
  REMINDER: "reminder",
  SCADA_AUTO_IMPORT: "scada-auto-import",
  PAPERLESS: "paperless",
} as const;

export type WorkerName = (typeof WORKER_NAMES)[keyof typeof WORKER_NAMES];

/**
 * Worker-Status für Health-Checks
 */
export interface WorkerStatus {
  name: WorkerName;
  running: boolean;
  concurrency?: number;
}

/**
 * Aggregierter Health-Status
 */
export interface WorkersHealthStatus {
  allRunning: boolean;
  workers: WorkerStatus[];
  startedAt?: Date;
}

// =============================================================================
// Worker Registry
// =============================================================================

/**
 * Registry-Eintrag für einen Worker
 */
interface WorkerRegistryEntry {
  name: WorkerName;
  displayName: string;
  start: () => Worker<unknown, unknown>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  getWorker: () => Worker<unknown, unknown> | null;
}

/**
 * Registry mit allen Workern
 */
const workerRegistry: WorkerRegistryEntry[] = [
  {
    name: WORKER_NAMES.EMAIL,
    displayName: "E-Mail Worker",
    start: startEmailWorker as () => Worker<unknown, unknown>,
    stop: stopEmailWorker,
    isRunning: isEmailWorkerRunning,
    getWorker: getEmailWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.PDF,
    displayName: "PDF Worker",
    start: startPdfWorker as () => Worker<unknown, unknown>,
    stop: stopPdfWorker,
    isRunning: isPdfWorkerRunning,
    getWorker: getPdfWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.BILLING,
    displayName: "Billing Worker",
    start: startBillingWorker as () => Worker<unknown, unknown>,
    stop: stopBillingWorker,
    isRunning: isBillingWorkerRunning,
    getWorker: getBillingWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.WEATHER,
    displayName: "Weather Worker",
    start: startWeatherWorker as () => Worker<unknown, unknown>,
    stop: stopWeatherWorker,
    isRunning: isWeatherWorkerRunning,
    getWorker: getWeatherWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.REPORT,
    displayName: "Report Worker",
    start: startReportWorker as () => Worker<unknown, unknown>,
    stop: stopReportWorker,
    isRunning: isReportWorkerRunning,
    getWorker: getReportWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.REMINDER,
    displayName: "Reminder Worker",
    start: startReminderWorker as () => Worker<unknown, unknown>,
    stop: stopReminderWorker,
    isRunning: isReminderWorkerRunning,
    getWorker: getReminderWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.SCADA_AUTO_IMPORT,
    displayName: "SCADA Auto-Import Worker",
    start: startScadaAutoImportWorker as () => Worker<unknown, unknown>,
    stop: stopScadaAutoImportWorker,
    isRunning: isScadaAutoImportWorkerRunning,
    getWorker: getScadaAutoImportWorker as () => Worker<unknown, unknown> | null,
  },
  {
    name: WORKER_NAMES.PAPERLESS,
    displayName: "Paperless Worker",
    start: startPaperlessWorker as () => Worker<unknown, unknown>,
    stop: stopPaperlessWorker,
    isRunning: isPaperlessWorkerRunning,
    getWorker: getPaperlessWorker as () => Worker<unknown, unknown> | null,
  },
];

// Zeitstempel wann Worker gestartet wurden
let workersStartedAt: Date | null = null;

// =============================================================================
// Start/Stop Functions
// =============================================================================

/**
 * Startet alle registrierten Worker
 *
 * @returns Array mit gestarteten Worker-Namen
 */
export function startAllWorkers(): WorkerName[] {
  logger.info("Starting all workers...");

  const startedWorkers: WorkerName[] = [];

  for (const entry of workerRegistry) {
    try {
      if (!entry.isRunning()) {
        entry.start();
        startedWorkers.push(entry.name);
        logger.info({ worker: entry.displayName }, `Started: ${entry.displayName}`);
      } else {
        logger.info({ worker: entry.displayName }, `Already running: ${entry.displayName}`);
      }
    } catch (error) {
      logger.error(
        { worker: entry.displayName, err: error },
        `Failed to start ${entry.displayName}`
      );
    }
  }

  workersStartedAt = new Date();

  logger.info(
    { started: startedWorkers.length, total: workerRegistry.length },
    `Started ${startedWorkers.length}/${workerRegistry.length} workers`
  );

  return startedWorkers;
}

/**
 * Stoppt alle registrierten Worker gracefully
 *
 * @param timeout - Maximale Wartezeit in ms (default: 30000)
 * @returns Array mit gestoppten Worker-Namen
 */
export async function stopAllWorkers(timeout: number = 30000): Promise<WorkerName[]> {
  logger.info({ timeout }, `Stopping all workers (timeout: ${timeout}ms)...`);

  const stoppedWorkers: WorkerName[] = [];
  const stopPromises: Promise<void>[] = [];

  for (const entry of workerRegistry) {
    if (entry.isRunning()) {
      const stopPromise = Promise.race([
        entry.stop().then(() => {
          stoppedWorkers.push(entry.name);
          logger.info({ worker: entry.displayName }, `Stopped: ${entry.displayName}`);
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout stopping ${entry.displayName}`)), timeout)
        ),
      ]).catch((error) => {
        logger.error(
          { worker: entry.displayName, err: error },
          `Error stopping ${entry.displayName}`
        );
      });

      stopPromises.push(stopPromise);
    }
  }

  await Promise.all(stopPromises);

  workersStartedAt = null;

  logger.info({ count: stoppedWorkers.length }, `Stopped ${stoppedWorkers.length} workers`);

  return stoppedWorkers;
}

/**
 * Startet einen spezifischen Worker
 *
 * @param name - Name des Workers
 * @returns true wenn erfolgreich gestartet
 */
export function startWorker(name: WorkerName): boolean {
  const entry = workerRegistry.find((w) => w.name === name);

  if (!entry) {
    logger.error({ worker: name }, `Unknown worker: ${name}`);
    return false;
  }

  if (entry.isRunning()) {
    logger.info({ worker: name }, `Worker already running: ${name}`);
    return true;
  }

  try {
    entry.start();
    logger.info({ worker: name }, `Started worker: ${name}`);
    return true;
  } catch (error) {
    logger.error(
      { worker: name, err: error },
      `Failed to start worker ${name}`
    );
    return false;
  }
}

/**
 * Stoppt einen spezifischen Worker
 *
 * @param name - Name des Workers
 * @returns true wenn erfolgreich gestoppt
 */
export async function stopWorker(name: WorkerName): Promise<boolean> {
  const entry = workerRegistry.find((w) => w.name === name);

  if (!entry) {
    logger.error({ worker: name }, `Unknown worker: ${name}`);
    return false;
  }

  if (!entry.isRunning()) {
    logger.info({ worker: name }, `Worker not running: ${name}`);
    return true;
  }

  try {
    await entry.stop();
    logger.info({ worker: name }, `Stopped worker: ${name}`);
    return true;
  } catch (error) {
    logger.error(
      { worker: name, err: error },
      `Failed to stop worker ${name}`
    );
    return false;
  }
}

// =============================================================================
// Health Check Functions
// =============================================================================

/**
 * Gibt den Status aller Worker zurück
 */
export function getWorkersStatus(): WorkersHealthStatus {
  const workers: WorkerStatus[] = workerRegistry.map((entry) => {
    const worker = entry.getWorker();
    return {
      name: entry.name,
      running: entry.isRunning(),
      concurrency: worker?.opts?.concurrency,
    };
  });

  const allRunning = workers.every((w) => w.running);

  return {
    allRunning,
    workers,
    startedAt: workersStartedAt || undefined,
  };
}

/**
 * Prueft ob ein spezifischer Worker läuft
 */
export function isWorkerRunning(name: WorkerName): boolean {
  const entry = workerRegistry.find((w) => w.name === name);
  return entry ? entry.isRunning() : false;
}

/**
 * Gibt einen Worker anhand seines Namens zurück
 */
export function getWorkerByName(name: WorkerName): Worker<unknown, unknown> | null {
  const entry = workerRegistry.find((w) => w.name === name);
  return entry ? entry.getWorker() : null;
}

/**
 * Gibt alle registrierten Worker-Namen zurück
 */
export function getRegisteredWorkerNames(): WorkerName[] {
  return workerRegistry.map((w) => w.name);
}

// =============================================================================
// Re-exports für individuellen Worker-Zugriff
// =============================================================================

// Email Worker
export {
  startEmailWorker,
  stopEmailWorker,
  isEmailWorkerRunning,
  getEmailWorker,
};
export type { EmailJobData, EmailJobResult };

// PDF Worker
export {
  startPdfWorker,
  stopPdfWorker,
  isPdfWorkerRunning,
  getPdfWorker,
};
export type { PdfJobData, PdfJobResult };
export type {
  PdfType,
  InvoicePdfJobData,
  VoteResultPdfJobData,
  SettlementReportPdfJobData,
} from "./pdf.worker";

// Billing Worker
export {
  startBillingWorker,
  stopBillingWorker,
  isBillingWorkerRunning,
  getBillingWorker,
};
export type { BillingJobData, BillingJobResult };
export type {
  BillingJobType,
  GenerateInvoiceJobData,
  GenerateSettlementJobData,
  SendReminderJobData,
  CalculateFeesJobData,
  BulkInvoiceJobData,
} from "./billing.worker";

// Weather Worker
export {
  startWeatherWorker,
  stopWeatherWorker,
  isWeatherWorkerRunning,
  getWeatherWorker,
};
export type { WeatherJobData, WeatherJobResult } from "../queues/weather.queue";

// Report Worker
export {
  startReportWorker,
  stopReportWorker,
  isReportWorkerRunning,
  getReportWorker,
};
export type { ReportJobData, ReportJobResult };

// Reminder Worker
export {
  startReminderWorker,
  stopReminderWorker,
  isReminderWorkerRunning,
  getReminderWorker,
};
export type { ReminderJobData, ReminderJobResult };

// SCADA Auto-Import Worker
export {
  startScadaAutoImportWorker,
  stopScadaAutoImportWorker,
  isScadaAutoImportWorkerRunning,
  getScadaAutoImportWorker,
};
export type { ScadaAutoImportJobData, ScadaAutoImportJobResult };

// Paperless Worker
export {
  startPaperlessWorker,
  stopPaperlessWorker,
  isPaperlessWorkerRunning,
  getPaperlessWorker,
};
export type { PaperlessJobData, PaperlessJobResult };
