/**
 * Dead-Letter-Queue persistence for BullMQ jobs.
 *
 * BullMQ's `removeOnFail: N` setting only keeps the last N failed jobs in
 * Redis — older failures vanish silently. For critical jobs (billing,
 * email, scada-import) that's not acceptable: an operator needs to know
 * which specific job failed, why, and have the payload available for
 * manual retry or investigation.
 *
 * This module persists failed jobs into the `FailedJob` table with the
 * full payload, error message, stack trace, and attempt count. The
 * `failed` event handler of each worker should call `persistFailedJob()`.
 */

import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { jobLogger } from "@/lib/logger";

const logger = jobLogger.child({ component: "dead-letter" });

export interface PersistFailedJobInput {
  queueName: string;
  job: Job | undefined;
  error: Error;
}

/**
 * Persist a failed BullMQ job into the FailedJob table.
 *
 * Called from the `failed` event handler of each worker. Never throws —
 * if the DB write fails, we log but don't crash the worker (the job is
 * already failed; compounding the failure helps no one).
 */
export async function persistFailedJob({
  queueName,
  job,
  error,
}: PersistFailedJobInput): Promise<void> {
  if (!job) {
    logger.warn({ queueName, error: error.message }, "Cannot persist failed job: job is undefined");
    return;
  }

  try {
    // Extract tenantId from common job-data shapes. All WPM workers
    // follow the convention of putting tenantId at the root of job.data.
    const data = (job.data ?? {}) as Record<string, unknown>;
    const tenantId = typeof data.tenantId === "string" ? data.tenantId : null;

    await prisma.failedJob.create({
      data: {
        tenantId,
        queueName,
        jobName: job.name,
        jobId: job.id?.toString() ?? null,
        payload: data as object,
        attemptsMade: job.attemptsMade ?? 0,
        error: error.message ?? "Unknown error",
        stackTrace: error.stack ?? null,
      },
    });

    logger.info(
      { queueName, jobId: job.id, tenantId, attemptsMade: job.attemptsMade },
      "Failed job persisted to dead-letter store",
    );
  } catch (persistErr) {
    logger.error(
      {
        err: persistErr instanceof Error ? persistErr.message : String(persistErr),
        queueName,
        jobId: job.id,
        originalError: error.message,
      },
      "Failed to persist failed job — DLQ write itself failed",
    );
  }
}
