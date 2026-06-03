/**
 * Approvals Expiry Worker - Verarbeitet Cron-Jobs zum Setzen ablaufender
 * Approvals auf EXPIRED.
 *
 * Idempotent: Bei Mehrfach-Trigger werden bereits-EXPIRED Einträge übersprungen
 * (Filter status: PENDING). Kein Schaden bei doppelter Ausführung.
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type {
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult,
} from "../queues/approvals-expiry.queue";
import { APPROVALS_EXPIRY_QUEUE_NAME } from "../queues/approvals-expiry.queue";

const logger = jobLogger.child({ component: "approvals-expiry-worker" });

let approvalsExpiryWorker: Worker<
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult
> | null = null;

/**
 * Process an approvals-expiry job.
 * Setzt alle PENDING-Approvals mit expiresAt < now() auf EXPIRED.
 */
async function processApprovalsExpiryJob(
  job: Job<ApprovalsExpiryJobData, ApprovalsExpiryJobResult>,
): Promise<ApprovalsExpiryJobResult> {
  const jobId = job.id || `approvals-expiry-${Date.now()}`;
  const cutoff = new Date();

  logger.info(
    { jobId, cutoff: cutoff.toISOString(), tenantScope: job.data.tenantId ?? "all" },
    "[ApprovalsExpiryWorker] Starting expiry sweep",
  );

  // Dynamischer Import um zirkuläre Abhängigkeiten zu vermeiden
  const { prisma } = await import("@/lib/prisma");

  const where: { status: "PENDING"; expiresAt: { lt: Date }; tenantId?: string } = {
    status: "PENDING",
    expiresAt: { lt: cutoff },
  };
  if (job.data.tenantId) {
    where.tenantId = job.data.tenantId;
  }

  const result = await prisma.approvalRequest.updateMany({
    where,
    data: { status: "EXPIRED" },
  });

  logger.info(
    {
      jobId,
      expiredCount: result.count,
      cutoff: cutoff.toISOString(),
    },
    `[ApprovalsExpiryWorker] Expired ${result.count} approval(s)`,
  );

  return {
    expiredCount: result.count,
    cutoff: cutoff.toISOString(),
  };
}

/**
 * Start the approvals-expiry worker.
 */
export function startApprovalsExpiryWorker(): Worker<
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult
> {
  if (approvalsExpiryWorker) {
    logger.info("[ApprovalsExpiryWorker] Already running");
    return approvalsExpiryWorker;
  }

  approvalsExpiryWorker = new Worker<
    ApprovalsExpiryJobData,
    ApprovalsExpiryJobResult
  >(APPROVALS_EXPIRY_QUEUE_NAME, processApprovalsExpiryJob, {
    connection: getRedisConnection(),
    concurrency: 1, // Cron-Job, kein Bedarf an Parallelität
    useWorkerThreads: false,
  });

  approvalsExpiryWorker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, expiredCount: result.expiredCount },
      "[ApprovalsExpiryWorker] Job completed",
    );
  });

  approvalsExpiryWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      "[ApprovalsExpiryWorker] Job failed",
    );
  });

  approvalsExpiryWorker.on("error", (error) => {
    logger.error({ err: error.message }, "[ApprovalsExpiryWorker] Worker error");
  });

  logger.info("[ApprovalsExpiryWorker] Started");

  return approvalsExpiryWorker;
}

/**
 * Stop the approvals-expiry worker gracefully.
 */
export async function stopApprovalsExpiryWorker(): Promise<void> {
  if (!approvalsExpiryWorker) {
    return;
  }
  await approvalsExpiryWorker.close();
  approvalsExpiryWorker = null;
  logger.info("[ApprovalsExpiryWorker] Stopped");
}

/**
 * Check if the worker is running.
 */
export function isApprovalsExpiryWorkerRunning(): boolean {
  return (
    approvalsExpiryWorker !== null && !approvalsExpiryWorker.closing
  );
}

/**
 * Get the worker instance (for health checks).
 */
export function getApprovalsExpiryWorker(): Worker<
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult
> | null {
  return approvalsExpiryWorker;
}

export type { ApprovalsExpiryJobData, ApprovalsExpiryJobResult };
