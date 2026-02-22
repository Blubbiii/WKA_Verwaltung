/**
 * Report Worker - Verarbeitet Jobs aus der "report" Queue
 *
 * Dieser Worker ist verantwortlich fuer:
 * - Taegliche Pruefung auf faellige geplante Berichte (06:00 Uhr)
 * - Ausfuehrung der Berichtsgenerierung via scheduled-report-service
 * - Archivierung und E-Mail-Benachrichtigung
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type { ReportJobData, ReportJobResult } from "../queues/report.queue";
import { REPORT_QUEUE_NAME } from "../queues/report.queue";

const logger = jobLogger.child({ component: "report-worker" });

// =============================================================================
// Types
// =============================================================================

export type { ReportJobData, ReportJobResult };

// =============================================================================
// Worker Instance
// =============================================================================

let reportWorker: Worker<ReportJobData, ReportJobResult> | null = null;

/**
 * Process a report job.
 * Delegates to the scheduled report service for actual report generation.
 */
async function processReportJob(
  job: Job<ReportJobData, ReportJobResult>
): Promise<ReportJobResult> {
  logger.info(
    { jobId: job.id, type: job.data.type },
    `[ReportWorker] Processing job: ${job.data.type}`
  );

  if (job.data.type === "process-scheduled-reports") {
    // Dynamically import to avoid circular dependencies
    const { processScheduledReports } = await import(
      "@/lib/reports/scheduled-report-service"
    );

    const result = await processScheduledReports();

    logger.info(
      {
        jobId: job.id,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      },
      `[ReportWorker] Job completed: ${result.succeeded}/${result.processed} reports processed`
    );

    return result;
  }

  // Unknown job type
  logger.warn(
    { jobId: job.id, type: job.data.type },
    `[ReportWorker] Unknown job type: ${job.data.type}`
  );

  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [
      {
        reportId: "unknown",
        reportName: "unknown",
        error: `Unknown job type: ${job.data.type}`,
      },
    ],
  };
}

// =============================================================================
// Worker Lifecycle
// =============================================================================

/**
 * Start the report worker
 */
export function startReportWorker(): Worker<ReportJobData, ReportJobResult> {
  if (reportWorker) {
    logger.info("[ReportWorker] Already running, skipping start");
    return reportWorker;
  }

  reportWorker = new Worker<ReportJobData, ReportJobResult>(
    REPORT_QUEUE_NAME,
    processReportJob,
    {
      connection: getRedisConnection(),
      concurrency: 1, // Process one report job at a time (resource-intensive)
      limiter: {
        max: 5,
        duration: 60000, // Max 5 jobs per minute
      },
    }
  );

  // Event handlers
  reportWorker.on("completed", (job: Job<ReportJobData, ReportJobResult>, result: ReportJobResult) => {
    logger.info(
      {
        jobId: job.id,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      },
      `[ReportWorker] Job ${job.id} completed`
    );
  });

  reportWorker.on("failed", (job: Job<ReportJobData, ReportJobResult> | undefined, error: Error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      `[ReportWorker] Job ${job?.id} failed: ${error.message}`
    );
  });

  reportWorker.on("error", (error: Error) => {
    logger.error(
      { err: error.message },
      `[ReportWorker] Worker error: ${error.message}`
    );
  });

  logger.info("[ReportWorker] Started");

  return reportWorker;
}

/**
 * Stop the report worker gracefully
 */
export async function stopReportWorker(): Promise<void> {
  if (reportWorker) {
    await reportWorker.close();
    reportWorker = null;
    logger.info("[ReportWorker] Stopped");
  }
}

/**
 * Check if the report worker is running
 */
export function isReportWorkerRunning(): boolean {
  return reportWorker !== null && !reportWorker.closing;
}

/**
 * Get the current report worker instance
 */
export function getReportWorker(): Worker<ReportJobData, ReportJobResult> | null {
  return reportWorker;
}
