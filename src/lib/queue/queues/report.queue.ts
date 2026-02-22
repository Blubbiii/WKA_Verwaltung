/**
 * Report Queue - BullMQ Queue for Scheduled Report Generation
 *
 * Handles daily check for due scheduled reports and processes them
 * asynchronously with retry logic.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";

/**
 * Supported report job types
 */
export type ReportJobType = "process-scheduled-reports";

/**
 * Report job data structure
 */
export interface ReportJobData {
  /** Job type identifier */
  type: ReportJobType | string;
  /** Optional: Process only a specific tenant */
  tenantId?: string;
  /** Optional: Process only a specific scheduled report */
  scheduledReportId?: string;
  /** Timestamp when the job was enqueued */
  enqueuedAt: string;
}

/**
 * Report job result structure
 */
export interface ReportJobResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ reportId: string; reportName: string; error: string }>;
}

/**
 * Queue name constant
 */
export const REPORT_QUEUE_NAME = "report";

/**
 * Default job options for report queue
 */
const defaultJobOptions: JobsOptions = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 30000, // Start with 30s - report generation can be slow
  },
  removeOnComplete: {
    count: 50, // Keep last 50 completed jobs
  },
  removeOnFail: {
    count: 200, // Keep last 200 failed jobs for debugging
  },
};

// Singleton queue instance
let reportQueue: Queue<ReportJobData, ReportJobResult> | null = null;

/**
 * Get or create the report queue instance
 */
export const getReportQueue = (): Queue<ReportJobData, ReportJobResult> => {
  if (!reportQueue) {
    reportQueue = new Queue<ReportJobData, ReportJobResult>(REPORT_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${REPORT_QUEUE_NAME}] Initialized`);
  }

  return reportQueue;
};

/**
 * Enqueue a job to process all due scheduled reports.
 * Typically called by the daily cron schedule.
 */
export const enqueueScheduledReportProcessing = async (
  options?: Partial<JobsOptions>
) => {
  const queue = getReportQueue();

  const jobData: ReportJobData = {
    type: "process-scheduled-reports",
    enqueuedAt: new Date().toISOString(),
  };

  const job = await queue.add("process-scheduled-reports", jobData, {
    ...options,
    jobId: `report-scheduled-${new Date().toISOString().slice(0, 10)}`,
  });

  logger.info(
    `[Queue:${REPORT_QUEUE_NAME}] Job ${job.id} added: process-scheduled-reports`
  );

  return job;
};

/**
 * Schedule the daily report processing check.
 * Runs every day at 06:00 AM (server time).
 */
export const scheduleDailyReportProcessing = async () => {
  const queue = getReportQueue();

  const jobData: ReportJobData = {
    type: "process-scheduled-reports",
    enqueuedAt: new Date().toISOString(),
  };

  const job = await queue.add("process-scheduled-reports", jobData, {
    repeat: {
      pattern: "0 6 * * *", // Daily at 06:00
    },
    jobId: "report-daily-check",
  });

  logger.info(
    `[Queue:${REPORT_QUEUE_NAME}] Daily scheduled report check registered (06:00 daily)`
  );

  return job;
};

/**
 * Remove the daily scheduled report processing job.
 */
export const removeDailyReportProcessing = async (): Promise<boolean> => {
  const queue = getReportQueue();

  try {
    const removed = await queue.removeRepeatableByKey(
      `process-scheduled-reports:report-daily-check:::0 6 * * *`
    );

    if (removed) {
      logger.info(
        `[Queue:${REPORT_QUEUE_NAME}] Daily report processing removed`
      );
    }

    return removed;
  } catch {
    // Key format may differ - try to remove all repeatables
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === "process-scheduled-reports") {
        await queue.removeRepeatableByKey(job.key);
        logger.info(
          `[Queue:${REPORT_QUEUE_NAME}] Removed repeatable job: ${job.key}`
        );
        return true;
      }
    }
    return false;
  }
};

/**
 * Close the report queue connection
 */
export const closeReportQueue = async (): Promise<void> => {
  if (reportQueue) {
    await reportQueue.close();
    reportQueue = null;
    logger.info(`[Queue:${REPORT_QUEUE_NAME}] Closed`);
  }
};
