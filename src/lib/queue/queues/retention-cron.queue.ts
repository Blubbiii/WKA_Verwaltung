/**
 * Retention Cron Queue (DSGVO Art. 5(1)(e) + §147 AO)
 *
 * Täglich nachts (03:00): prüft pro Tenant Retention-Settings und markiert/
 * löscht abgelaufene Records.
 *
 * WICHTIG: Default Dry-Run. Echte Mutationen NUR bei RETENTION_DRY_RUN=false.
 * AuditLog-Hard-Delete benötigt zusätzlich DB-User `wpm_retention` der die
 * Append-Only-Trigger umgehen kann (siehe docs/audit-log-append-only.md).
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";

export interface RetentionCronJobData {
  /** Optional Tenant-Scope für Tests / Ad-Hoc-Run. Standard: alle. */
  tenantId?: string;
  /** Override für Dry-Run-Flag (nur Tests). */
  forceDryRun?: boolean;
}

export interface RetentionCronJobResult {
  dryRun: boolean;
  processedTenants: number;
  invoicesAffected: number;
  auditLogsAffected: number;
  startedAt: string;
  finishedAt: string;
}

export const RETENTION_CRON_QUEUE_NAME = "retention-cron";

const REPEATABLE_JOB_ID = "retention-cron-daily";

/** Cron-Pattern: täglich 03:00 nachts */
const CRON_PATTERN = "0 3 * * *";

const defaultJobOptions = getJobOptions("background");

let retentionCronQueue: Queue<
  RetentionCronJobData,
  RetentionCronJobResult
> | null = null;

export const getRetentionCronQueue = (): Queue<
  RetentionCronJobData,
  RetentionCronJobResult
> => {
  if (!retentionCronQueue) {
    retentionCronQueue = new Queue<
      RetentionCronJobData,
      RetentionCronJobResult
    >(RETENTION_CRON_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });
    logger.info(`[Queue:${RETENTION_CRON_QUEUE_NAME}] Initialized`);
  }
  return retentionCronQueue;
};

/**
 * Schedule the repeatable cron job (täglich 03:00).
 * IDEMPOTENT: BullMQ dedupliziert via jobId.
 */
export const scheduleRetentionCron = async () => {
  const queue = getRetentionCronQueue();

  const job = await queue.add(
    "retention-sweep",
    {},
    {
      repeat: { pattern: CRON_PATTERN },
      jobId: REPEATABLE_JOB_ID,
    },
  );

  logger.info(
    {
      queue: RETENTION_CRON_QUEUE_NAME,
      pattern: CRON_PATTERN,
    },
    `[Queue:${RETENTION_CRON_QUEUE_NAME}] Cron scheduled (daily 03:00)`,
  );

  return job;
};

/** On-Demand Trigger (Admin / Tests). */
export const enqueueRetentionSweepNow = async (
  data: RetentionCronJobData = {},
) => {
  const queue = getRetentionCronQueue();
  return queue.add("retention-sweep", data, {
    jobId: `retention-cron-manual-${Date.now()}`,
  });
};

export const removeRetentionCronSchedule = async (): Promise<boolean> => {
  const queue = getRetentionCronQueue();
  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      if (rj.name === "retention-sweep") {
        await queue.removeRepeatableByKey(rj.key);
        logger.info(
          `[Queue:${RETENTION_CRON_QUEUE_NAME}] Cron schedule removed`,
        );
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};

export const closeRetentionCronQueue = async (): Promise<void> => {
  if (retentionCronQueue) {
    await retentionCronQueue.close();
    retentionCronQueue = null;
    logger.info(`[Queue:${RETENTION_CRON_QUEUE_NAME}] Closed`);
  }
};
