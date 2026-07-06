/**
 * tus-GC Queue — runs `runTusGarbageCollection()` every 6h.
 *
 * Keeps expired tus datastore entries and stale SCADA staging directories
 * cleaned up. Same job is exposed as a manual trigger at
 * POST /api/admin/tus-gc for on-demand debug runs.
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_SCHEDULES } from "@/lib/config/cron-schedules";

export type TusGcJobData = Record<string, never>;

export interface TusGcJobResult {
  tusExpiredCount: number;
  scadaSessionsRemoved: number;
  scadaTenantsScanned: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

export const TUS_GC_QUEUE_NAME = "tus-gc";

const REPEATABLE_JOB_ID = "tus-gc-every-6h";

const CRON_PATTERN = CRON_SCHEDULES.TUS_GC;

const defaultJobOptions = getJobOptions("background");

let tusGcQueue: Queue<TusGcJobData, TusGcJobResult> | null = null;

export const getTusGcQueue = (): Queue<TusGcJobData, TusGcJobResult> => {
  if (!tusGcQueue) {
    tusGcQueue = new Queue<TusGcJobData, TusGcJobResult>(TUS_GC_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });
    logger.info(`[Queue:${TUS_GC_QUEUE_NAME}] Initialized`);
  }
  return tusGcQueue;
};

/**
 * Schedule the repeatable cron (every 6h). Idempotent via jobId.
 */
export const scheduleTusGc = async () => {
  const queue = getTusGcQueue();
  const job = await queue.add(
    "tus-gc",
    {},
    {
      repeat: { pattern: CRON_PATTERN },
      jobId: REPEATABLE_JOB_ID,
    }
  );
  logger.info(
    { queue: TUS_GC_QUEUE_NAME, pattern: CRON_PATTERN },
    `[Queue:${TUS_GC_QUEUE_NAME}] Cron scheduled (every 6h)`
  );
  return job;
};

export const closeTusGcQueue = async (): Promise<void> => {
  if (tusGcQueue) {
    await tusGcQueue.close();
    tusGcQueue = null;
    logger.info(`[Queue:${TUS_GC_QUEUE_NAME}] Closed`);
  }
};
