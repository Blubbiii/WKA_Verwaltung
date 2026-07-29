/**
 * Approvals Reconcile Queue - BullMQ Queue für Executor-Reconciliation.
 *
 * H-3: Falls eine ApprovalRequest auf APPROVED gesetzt wurde, der Executor
 * aber nicht durchlief (App-Crash zwischen decideApproval und Executor-Run,
 * Network-Timeout etc.), bleibt sie mit `executedAt = null` zurück.
 *
 * Dieser Cron läuft stündlich, sucht solche "verwaiste" Approvals
 * (APPROVED, executedAt null, updatedAt < now-5min) und ruft
 * `executeApprovedAction` erneut auf (idempotent — Executor prüft
 * Ziel-Entity-Status und überspringt wenn bereits ausgeführt).
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_TIMEZONE } from "@/lib/config/cron-schedules";
import { removeRepeatableJobs } from "../repeatable";

export interface ApprovalsReconcileJobData {
  /** Optional Tenant-Scope (rein für Tests/On-Demand). Standard: alle. */
  tenantId?: string;
}

export interface ApprovalsReconcileJobResult {
  /** Anzahl reconciled Approvals (= erfolgreich ausgeführt). */
  reconciledCount: number;
  /** Anzahl Failures beim Re-Execute (inkl. der Versuche, die erneut laufen). */
  failedCount: number;
  /**
   * Anzahl Approvals, die nach MAX_RECONCILE_ATTEMPTS endgueltig aufgegeben
   * wurden. F6: dieser Fall existierte vorher nicht — jeder Fehlschlag galt
   * sofort als abgeschlossen.
   */
  gaveUpCount: number;
  cutoff: string;
}

export const APPROVALS_RECONCILE_QUEUE_NAME = "approvals-reconcile";

/** Repeatable-Job-ID (stabile ID → keine Duplikate bei Mehrfach-Schedule) */
const REPEATABLE_JOB_ID = "approvals-reconcile-cron";

/** Cron-Pattern: stündlich um Minute 0 */
const CRON_PATTERN = "0 */1 * * *";

const defaultJobOptions = getJobOptions("background");

let approvalsReconcileQueue: Queue<
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult
> | null = null;

export const getApprovalsReconcileQueue = (): Queue<
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult
> => {
  if (!approvalsReconcileQueue) {
    approvalsReconcileQueue = new Queue<
      ApprovalsReconcileJobData,
      ApprovalsReconcileJobResult
    >(APPROVALS_RECONCILE_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });
    logger.info(`[Queue:${APPROVALS_RECONCILE_QUEUE_NAME}] Initialized`);
  }
  return approvalsReconcileQueue;
};

/**
 * Schedule the repeatable cron job (stündlich).
 *
 * IDEMPOTENT: BullMQ dedupliziert via jobId.
 */
export const scheduleApprovalsReconcileCheck = async () => {
  const queue = getApprovalsReconcileQueue();

  const job = await queue.add(
    "reconcile-orphaned-approvals",
    {},
    {
      repeat: { pattern: CRON_PATTERN, tz: CRON_TIMEZONE },
      jobId: REPEATABLE_JOB_ID,
    },
  );

  logger.info(
    {
      queue: APPROVALS_RECONCILE_QUEUE_NAME,
      pattern: CRON_PATTERN,
    },
    `[Queue:${APPROVALS_RECONCILE_QUEUE_NAME}] Cron scheduled (hourly)`,
  );

  return job;
};

/**
 * Enqueue an immediate one-off reconcile check (für Tests/Admin).
 */
export const enqueueApprovalsReconcileNow = async () => {
  const queue = getApprovalsReconcileQueue();
  return queue.add(
    "reconcile-orphaned-approvals",
    {},
    {
      jobId: `approvals-reconcile-manual-${Date.now()}`,
    },
  );
};

export const removeApprovalsReconcileSchedule = async (): Promise<boolean> => {
  const queue = getApprovalsReconcileQueue();
  // F20: Hier stand ein handgebauter Key. Seit `tz` gesetzt ist, lautet das
  // Format `name:jobId::<tz>:pattern` — jeder fest verdrahtete Key mit `:::`
  // trifft also nicht mehr. Der Helper scannt statt zu rechnen.
  const removed = await removeRepeatableJobs(queue, {
    name: "reconcile-orphaned-approvals",
    jobId: REPEATABLE_JOB_ID,
  });
  return removed > 0;
};

export const closeApprovalsReconcileQueue = async (): Promise<void> => {
  if (approvalsReconcileQueue) {
    await approvalsReconcileQueue.close();
    approvalsReconcileQueue = null;
    logger.info(`[Queue:${APPROVALS_RECONCILE_QUEUE_NAME}] Closed`);
  }
};
