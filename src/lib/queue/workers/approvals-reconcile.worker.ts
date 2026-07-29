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

/**
 * Wie oft ein verwaistes Approval erneut ausgeführt wird, bevor aufgegeben wird.
 *
 * F6: Vorher wurde `executedAt` in JEDEM Fall gesetzt — auch bei
 * `result.success === false` und wenn der Executor geworfen hat. Der Datensatz
 * fiel damit sofort aus dem Suchfilter (`executedAt: null`) und wurde nie
 * wieder aufgegriffen: ein transienter Fehler (DB-Timeout, Deploy mitten im
 * Lauf) wurde zu permanentem Datenverlust bei einer bereits GENEHMIGTEN,
 * geldrelevanten Aktion. Der Kommentar "damit nicht endlos versucht wird"
 * verwechselte Retry-Begrenzung mit Aufgabe.
 *
 * Die Wiederholungen throtteln sich selbst: ein Fehlversuch aktualisiert
 * `updatedAt`, und der Filter greift nur Requests älter als RECONCILE_DELAY_MS.
 */
const MAX_RECONCILE_ATTEMPTS = 5;

/** Liest den Versuchszähler aus `executionResult` (kein eigenes Schema-Feld). */
function readAttempts(executionResult: unknown): number {
  if (executionResult && typeof executionResult === "object") {
    const value = (executionResult as Record<string, unknown>).reconcileAttempts;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

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
  let gaveUpCount = 0;

  for (const request of orphaned) {
    if (!request.decidedById) {
      // Defensiv: APPROVED ohne decidedById ist ein inkonsistenter Zustand.
      logger.warn(
        { approvalId: request.id },
        "[ApprovalsReconcileWorker] APPROVED ohne decidedById — überspringe",
      );
      continue;
    }
    const attemptsSoFar = readAttempts(request.executionResult);

    /**
     * Fehlschlag verbuchen. `executedAt` bleibt NULL, solange noch Versuche
     * offen sind — nur so bleibt der Request im Suchfilter und wird beim
     * nächsten Sweep erneut angefasst (F6).
     */
    const recordFailure = async (errorMsg: string) => {
      failedCount++;
      const attempts = attemptsSoFar + 1;
      const giveUp = attempts >= MAX_RECONCILE_ATTEMPTS;

      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          executionError: errorMsg.slice(0, 500),
          executionResult: {
            reconcileAttempts: attempts,
            reconcileGaveUp: giveUp,
          } as Prisma.InputJsonValue,
          // Erst nach MAX_RECONCILE_ATTEMPTS aus dem Filter nehmen, damit der
          // Sweep nicht endlos an derselben Aktion haengt.
          executedAt: giveUp ? new Date() : null,
        },
      });

      if (giveUp) {
        gaveUpCount++;
        logger.error(
          { approvalId: request.id, attempts, error: errorMsg },
          "[ApprovalsReconcileWorker] Aufgegeben nach maximaler Versuchszahl",
        );
        // Nicht still verschwinden lassen: eine genehmigte, aber dauerhaft
        // nicht ausfuehrbare Aktion braucht einen Menschen.
        try {
          const { notifyAdmins } = await import("@/lib/notifications");
          await notifyAdmins({
            tenantId: request.tenantId,
            type: "SYSTEM",
            title: "Genehmigte Aktion konnte nicht ausgeführt werden",
            message:
              `${request.action} für ${request.entityType} ${request.entityId} ist nach ` +
              `${attempts} Versuchen endgültig fehlgeschlagen: ${errorMsg.slice(0, 200)}`,
            link: "/approvals/history",
          });
        } catch (notifyErr) {
          logger.warn(
            { approvalId: request.id, err: notifyErr },
            "[ApprovalsReconcileWorker] Admin-Benachrichtigung fehlgeschlagen",
          );
        }
      } else {
        logger.warn(
          { approvalId: request.id, attempts, maxAttempts: MAX_RECONCILE_ATTEMPTS, error: errorMsg },
          "[ApprovalsReconcileWorker] Re-Execute fehlgeschlagen — wird erneut versucht",
        );
      }
    };

    try {
      const result = await executeApprovedAction(request, request.decidedById);

      if (result.success) {
        await prisma.approvalRequest.update({
          where: { id: request.id },
          data: {
            executionResult: result.resultData
              ? (result.resultData as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            executionError: null,
            executedAt: new Date(),
          },
        });
        reconciledCount++;
      } else {
        await recordFailure(result.error ?? "Re-Execute ohne Fehlermeldung fehlgeschlagen");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { approvalId: request.id, err: errorMsg },
        "[ApprovalsReconcileWorker] Re-Execute threw",
      );
      await recordFailure(errorMsg);
    }
  }

  logger.info(
    {
      jobId,
      reconciledCount,
      failedCount,
      gaveUpCount,
      totalFound: orphaned.length,
    },
    `[ApprovalsReconcileWorker] Reconciled ${reconciledCount}/${orphaned.length}`,
  );

  return {
    reconciledCount,
    failedCount,
    gaveUpCount,
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
