/**
 * tus-GC Worker — processes the every-6h cleanup job.
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import {
  TUS_GC_QUEUE_NAME,
  type TusGcJobData,
  type TusGcJobResult,
} from "../queues/tus-gc.queue";

const logger = jobLogger.child({ component: "tus-gc-worker" });

let tusGcWorker: Worker<TusGcJobData, TusGcJobResult> | null = null;

async function processTusGcJob(
  job: Job<TusGcJobData, TusGcJobResult>
): Promise<TusGcJobResult> {
  const startedAt = new Date();
  const { runTusGarbageCollection } = await import("@/lib/tus/gc");
  const gc = await runTusGarbageCollection();
  const finishedAt = new Date();

  const result: TusGcJobResult = {
    ...gc,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };

  logger.info({ jobId: job.id, ...result }, "[TusGcWorker] GC complete");
  return result;
}

export function startTusGcWorker(): Worker<TusGcJobData, TusGcJobResult> {
  if (tusGcWorker) {
    logger.info("[TusGcWorker] Already running");
    return tusGcWorker;
  }

  tusGcWorker = new Worker<TusGcJobData, TusGcJobResult>(
    TUS_GC_QUEUE_NAME,
    processTusGcJob,
    {
      connection: getRedisConnection(),
      concurrency: 1,
      useWorkerThreads: false,
    }
  );

  tusGcWorker.on("completed", (job, result) => {
    logger.info(
      {
        jobId: job.id,
        tusExpiredCount: result.tusExpiredCount,
        scadaSessionsRemoved: result.scadaSessionsRemoved,
        errorCount: result.errors.length,
      },
      "[TusGcWorker] Job completed"
    );
  });

  tusGcWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      "[TusGcWorker] Job failed"
    );
  });

  tusGcWorker.on("error", (error) => {
    logger.error({ err: error.message }, "[TusGcWorker] Worker error");
  });

  logger.info("[TusGcWorker] Started");
  return tusGcWorker;
}

export async function stopTusGcWorker(): Promise<void> {
  if (!tusGcWorker) return;
  await tusGcWorker.close();
  tusGcWorker = null;
  logger.info("[TusGcWorker] Stopped");
}

export function isTusGcWorkerRunning(): boolean {
  return tusGcWorker !== null && !tusGcWorker.closing;
}

export function getTusGcWorker(): Worker<TusGcJobData, TusGcJobResult> | null {
  return tusGcWorker;
}

export type { TusGcJobData, TusGcJobResult };
