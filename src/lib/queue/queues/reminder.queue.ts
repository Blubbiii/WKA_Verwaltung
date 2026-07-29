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
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_SCHEDULES, CRON_TIMEZONE } from "@/lib/config/cron-schedules";
import { removeRepeatableJobs } from "../repeatable";

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
const defaultJobOptions = getJobOptions("background");

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
      pattern: CRON_SCHEDULES.REMINDER, // Every day at 08:00 (default)
      tz: CRON_TIMEZONE,
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
  // F20: Hier stand ein handgebauter Key. Seit `tz` gesetzt ist, lautet das
  // Format `name:jobId::<tz>:pattern` — jeder fest verdrahtete Key mit `:::`
  // trifft also nicht mehr. Der Helper scannt statt zu rechnen.
  const removed = await removeRepeatableJobs(queue, {
    name: "check-reminders",
    jobId: 'reminder-daily-all',
  });
  return removed > 0;
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
