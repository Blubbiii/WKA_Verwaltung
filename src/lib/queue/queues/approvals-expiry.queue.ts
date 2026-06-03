/**
 * Approvals Expiry Queue - BullMQ Queue für automatisches PENDING→EXPIRED Cron.
 *
 * Läuft alle 6 Stunden (Cron-Pattern siehe CRON_PATTERN unten) und setzt
 * ApprovalRequests, deren expiresAt < now() bereits überschritten ist, von
 * PENDING auf EXPIRED.
 *
 * Der Job ist idempotent — Mehrfach-Trigger erzeugt keinen Schaden, weil
 * updateMany() bereits-EXPIRED Einträge überspringt (status: PENDING-Filter).
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";

/**
 * Approvals-Expiry job data.
 * Empty payload — der Job läuft system-weit über alle Mandanten.
 */
export interface ApprovalsExpiryJobData {
  /** Optional Tenant-Scope (rein für Tests/On-Demand). Standard: alle. */
  tenantId?: string;
}

export interface ApprovalsExpiryJobResult {
  /** Anzahl der auf EXPIRED gesetzten Approvals. */
  expiredCount: number;
  /** Timestamp des Cutoffs (alle expiresAt < cutoff wurden expired). */
  cutoff: string;
}

export const APPROVALS_EXPIRY_QUEUE_NAME = "approvals-expiry";

/** Repeatable-Job-ID (stabile ID → keine Duplikate bei Mehrfach-Schedule) */
const REPEATABLE_JOB_ID = "approvals-expiry-cron";

/** Cron-Pattern: alle 6 Stunden um Minute 0 */
const CRON_PATTERN = "0 */6 * * *";

const defaultJobOptions = getJobOptions("background");

let approvalsExpiryQueue: Queue<
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult
> | null = null;

/**
 * Get or create the approvals-expiry queue instance.
 */
export const getApprovalsExpiryQueue = (): Queue<
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult
> => {
  if (!approvalsExpiryQueue) {
    approvalsExpiryQueue = new Queue<
      ApprovalsExpiryJobData,
      ApprovalsExpiryJobResult
    >(APPROVALS_EXPIRY_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });
    logger.info(`[Queue:${APPROVALS_EXPIRY_QUEUE_NAME}] Initialized`);
  }
  return approvalsExpiryQueue;
};

/**
 * Schedule the repeatable cron job (alle 6 Stunden).
 *
 * IDEMPOTENT: Bei Mehrfach-Aufruf wird der Job nur einmal registriert
 * (BullMQ dedupliziert via jobId). Beim App-Start kann diese Funktion
 * problemlos mehrfach aufgerufen werden — keine doppelten Executions.
 *
 * @returns Der registrierte repeatable job
 */
export const scheduleApprovalsExpiryCheck = async () => {
  const queue = getApprovalsExpiryQueue();

  const job = await queue.add(
    "check-expired-approvals",
    {},
    {
      repeat: { pattern: CRON_PATTERN },
      jobId: REPEATABLE_JOB_ID,
    },
  );

  logger.info(
    {
      queue: APPROVALS_EXPIRY_QUEUE_NAME,
      pattern: CRON_PATTERN,
    },
    `[Queue:${APPROVALS_EXPIRY_QUEUE_NAME}] Cron scheduled (every 6h)`,
  );

  return job;
};

/**
 * Enqueue an immediate one-off expiry check (für Tests/Admin).
 */
export const enqueueApprovalsExpiryNow = async () => {
  const queue = getApprovalsExpiryQueue();
  return queue.add(
    "check-expired-approvals",
    {},
    {
      jobId: `approvals-expiry-manual-${Date.now()}`,
    },
  );
};

/**
 * Remove the scheduled cron (z.B. für Shutdown oder Reconfig).
 */
export const removeApprovalsExpirySchedule = async (): Promise<boolean> => {
  const queue = getApprovalsExpiryQueue();
  try {
    const removed = await queue.removeRepeatableByKey(
      `check-expired-approvals:${REPEATABLE_JOB_ID}:::${CRON_PATTERN}`,
    );
    if (removed) {
      logger.info(
        `[Queue:${APPROVALS_EXPIRY_QUEUE_NAME}] Cron schedule removed`,
      );
    }
    return removed;
  } catch {
    // Fallback: scan repeatables and remove by name match
    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.name === "check-expired-approvals") {
          await queue.removeRepeatableByKey(rj.key);
          logger.info(
            `[Queue:${APPROVALS_EXPIRY_QUEUE_NAME}] Cron removed (by scan)`,
          );
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }
};

export const closeApprovalsExpiryQueue = async (): Promise<void> => {
  if (approvalsExpiryQueue) {
    await approvalsExpiryQueue.close();
    approvalsExpiryQueue = null;
    logger.info(`[Queue:${APPROVALS_EXPIRY_QUEUE_NAME}] Closed`);
  }
};
