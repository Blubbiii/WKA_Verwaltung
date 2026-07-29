/**
 * Report Queue - BullMQ Queue for Scheduled Report Generation
 *
 * Handles daily check for due scheduled reports and processes them
 * asynchronously with retry logic.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_SCHEDULES, CRON_TIMEZONE } from "@/lib/config/cron-schedules";
import { removeRepeatableJobs } from "../repeatable";

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
const defaultJobOptions = getJobOptions("background");

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
      pattern: CRON_SCHEDULES.REPORT, // Daily at 06:00 (default)
      tz: CRON_TIMEZONE,
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
  // F20: Hier stand ein handgebauter Key. Seit `tz` gesetzt ist, lautet das
  // Format `name:jobId::<tz>:pattern` — jeder fest verdrahtete Key mit `:::`
  // trifft also nicht mehr. Der Helper scannt statt zu rechnen.
  const removed = await removeRepeatableJobs(queue, {
    name: "process-scheduled-reports",
    jobId: 'report-daily-check',
  });
  return removed > 0;
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
