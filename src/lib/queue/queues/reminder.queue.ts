/**
 * Reminder Queue - BullMQ Queue for Automated Reminders
 *
 * Handles daily reminder checks for all tenants.
 * Checks for overdue invoices, expiring contracts, open settlements,
 * and expiring documents.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";

/**
 * Reminder job data structure
 */
export interface ReminderJobData {
  /** Tenant ID to check reminders for (or "all" for all tenants) */
  tenantId: string;
  /** Optional: Only check specific categories */
  categories?: string[];
  /** Optional: Force check even if recently checked */
  force?: boolean;
}

/**
 * Reminder job result structure
 */
export interface ReminderJobResult {
  /** Number of tenants processed */
  tenantsProcessed: number;
  /** Total reminder items found */
  totalItems: number;
  /** Total emails sent */
  totalEmailsSent: number;
  /** Total items skipped (cooldown) */
  totalSkipped: number;
  /** Any errors encountered */
  errors: string[];
}

/**
 * Queue name constant
 */
export const REMINDER_QUEUE_NAME = "reminder";

/**
 * Default job options for reminder queue
 */
const defaultJobOptions: JobsOptions = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 30000, // Start with 30s, then 60s
  },
  removeOnComplete: {
    count: 50, // Keep last 50 completed jobs
  },
  removeOnFail: {
    count: 200, // Keep last 200 failed jobs for debugging
  },
};

// Singleton queue instance
let reminderQueue: Queue<ReminderJobData, ReminderJobResult> | null = null;

/**
 * Get or create the reminder queue instance
 */
export const getReminderQueue = (): Queue<
  ReminderJobData,
  ReminderJobResult
> => {
  if (!reminderQueue) {
    reminderQueue = new Queue<ReminderJobData, ReminderJobResult>(
      REMINDER_QUEUE_NAME,
      {
        ...getBullMQConnection(),
        defaultJobOptions,
      }
    );

    logger.info(`[Queue:${REMINDER_QUEUE_NAME}] Initialized`);
  }

  return reminderQueue;
};

/**
 * Enqueue a reminder check job for a specific tenant
 *
 * @param tenantId - Tenant to check, or "all" for all tenants
 * @param options - Optional job-specific options
 * @returns The created job
 */
export const enqueueReminderCheck = async (
  tenantId: string,
  options?: Partial<JobsOptions>
) => {
  const queue = getReminderQueue();

  const jobData: ReminderJobData = {
    tenantId,
  };

  const jobId = `reminder-${tenantId}-${new Date().toISOString().slice(0, 10)}`;

  const job = await queue.add("check-reminders", jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${REMINDER_QUEUE_NAME}] Job ${job.id} added: check reminders for tenant ${tenantId}`
  );

  return job;
};

/**
 * Schedule daily reminder checks for all tenants.
 * Runs every day at 08:00 (server time).
 *
 * @returns The created repeatable job
 */
export const scheduleDailyReminderCheck = async () => {
  const queue = getReminderQueue();

  const jobData: ReminderJobData = {
    tenantId: "all",
  };

  const job = await queue.add("check-reminders", jobData, {
    repeat: {
      pattern: "0 8 * * *", // Every day at 08:00
    },
    jobId: "reminder-daily-all",
  });

  logger.info(
    `[Queue:${REMINDER_QUEUE_NAME}] Daily reminder check scheduled at 08:00`
  );

  return job;
};

/**
 * Remove the scheduled daily reminder check
 */
export const removeDailyReminderCheck = async (): Promise<boolean> => {
  const queue = getReminderQueue();

  try {
    const removed = await queue.removeRepeatableByKey(
      "check-reminders:reminder-daily-all:::0 8 * * *"
    );

    if (removed) {
      logger.info(
        `[Queue:${REMINDER_QUEUE_NAME}] Daily reminder check removed`
      );
    }

    return removed;
  } catch {
    // Try alternative key format
    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.name === "check-reminders") {
          await queue.removeRepeatableByKey(rj.key);
          logger.info(
            `[Queue:${REMINDER_QUEUE_NAME}] Daily reminder check removed (by scan)`
          );
          return true;
        }
      }
    } catch {
      // Ignore
    }
    return false;
  }
};

/**
 * Close the reminder queue connection
 */
export const closeReminderQueue = async (): Promise<void> => {
  if (reminderQueue) {
    await reminderQueue.close();
    reminderQueue = null;
    logger.info(`[Queue:${REMINDER_QUEUE_NAME}] Closed`);
  }
};
