/**
 * Approvals Reconcile Worker - H-3: Re-Executor für verwaiste APPROVED-Requests.
 *
 * Sucht ApprovalRequests mit Status APPROVED aber executedAt = null, die
 * älter als 5 Minuten sind, und ruft `executeApprovedAction` erneut auf.
 *
 * Idempotent: Executor prüft Ziel-Entity-Status und überspringt wenn die
 * Aktion bereits durchgeführt wurde (z.B. journalEntry.status !== DRAFT).
 */

import { Worker, Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type {
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult,
} from "../queues/approvals-reconcile.queue";
import { APPROVALS_RECONCILE_QUEUE_NAME } from "../queues/approvals-reconcile.queue";

const logger = jobLogger.child({ component: "approvals-reconcile-worker" });

/** Threshold: Approvals jünger als 5 min werden ausgelassen (Executor läuft evtl. noch). */
const RECONCILE_DELAY_MS = 5 * 60 * 1000;

let approvalsReconcileWorker: Worker<
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult
> | null = null;

async function processApprovalsReconcileJob(
  job: Job<ApprovalsReconcileJobData, ApprovalsReconcileJobResult>,
): Promise<ApprovalsReconcileJobResult> {
  const jobId = job.id || `approvals-reconcile-${Date.now()}`;
  const cutoff = new Date(Date.now() - RECONCILE_DELAY_MS);

  logger.info(
    { jobId, cutoff: cutoff.toISOString(), tenantScope: job.data.tenantId ?? "all" },
    "[ApprovalsReconcileWorker] Starting reconcile sweep",
  );

  // Dynamische Imports um zirkuläre Abhängigkeiten zu vermeiden.
  const { prisma } = await import("@/lib/prisma");
  const { executeApprovedAction } = await import("@/lib/approvals/executors");

  const where: Prisma.ApprovalRequestWhereInput = {
    status: "APPROVED",
    executedAt: null,
    updatedAt: { lt: cutoff },
  };
  if (job.data.tenantId) {
    where.tenantId = job.data.tenantId;
  }

  const orphaned = await prisma.approvalRequest.findMany({
    where,
    take: 50,
  });

  let reconciledCount = 0;
  let failedCount = 0;

  for (const request of orphaned) {
    if (!request.decidedById) {
      // Defensiv: APPROVED ohne decidedById ist ein inkonsistenter Zustand.
      logger.warn(
        { approvalId: request.id },
        "[ApprovalsReconcileWorker] APPROVED ohne decidedById — überspringe",
      );
      continue;
    }
    try {
      const result = await executeApprovedAction(request, request.decidedById);
      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          executionResult: result.resultData
            ? (result.resultData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          executionError: result.error ?? null,
          executedAt: new Date(),
        },
      });
      if (result.success) {
        reconciledCount++;
      } else {
        failedCount++;
        logger.warn(
          { approvalId: request.id, error: result.error },
          "[ApprovalsReconcileWorker] Re-Execute fehlgeschlagen",
        );
      }
    } catch (err) {
      failedCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { approvalId: request.id, err: errorMsg },
        "[ApprovalsReconcileWorker] Re-Execute threw",
      );
      // Errorstring in execResult schreiben damit nicht endlos versucht wird.
      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          executionError: errorMsg.slice(0, 500),
          executedAt: new Date(),
        },
      });
    }
  }

  logger.info(
    {
      jobId,
      reconciledCount,
      failedCount,
      totalFound: orphaned.length,
    },
    `[ApprovalsReconcileWorker] Reconciled ${reconciledCount}/${orphaned.length}`,
  );

  return {
    reconciledCount,
    failedCount,
    cutoff: cutoff.toISOString(),
  };
}

export function startApprovalsReconcileWorker(): Worker<
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult
> {
  if (approvalsReconcileWorker) {
    logger.info("[ApprovalsReconcileWorker] Already running");
    return approvalsReconcileWorker;
  }

  approvalsReconcileWorker = new Worker<
    ApprovalsReconcileJobData,
    ApprovalsReconcileJobResult
  >(APPROVALS_RECONCILE_QUEUE_NAME, processApprovalsReconcileJob, {
    connection: getRedisConnection(),
    concurrency: 1,
    useWorkerThreads: false,
  });

  approvalsReconcileWorker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, reconciledCount: result.reconciledCount },
      "[ApprovalsReconcileWorker] Job completed",
    );
  });

  approvalsReconcileWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      "[ApprovalsReconcileWorker] Job failed",
    );
  });

  approvalsReconcileWorker.on("error", (error) => {
    logger.error({ err: error.message }, "[ApprovalsReconcileWorker] Worker error");
  });

  logger.info("[ApprovalsReconcileWorker] Started");

  return approvalsReconcileWorker;
}

export async function stopApprovalsReconcileWorker(): Promise<void> {
  if (!approvalsReconcileWorker) {
    return;
  }
  await approvalsReconcileWorker.close();
  approvalsReconcileWorker = null;
  logger.info("[ApprovalsReconcileWorker] Stopped");
}

export function isApprovalsReconcileWorkerRunning(): boolean {
  return (
    approvalsReconcileWorker !== null && !approvalsReconcileWorker.closing
  );
}

export function getApprovalsReconcileWorker(): Worker<
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult
> | null {
  return approvalsReconcileWorker;
}

export type { ApprovalsReconcileJobData, ApprovalsReconcileJobResult };
