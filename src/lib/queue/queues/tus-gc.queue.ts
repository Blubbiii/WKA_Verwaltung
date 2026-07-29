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
import { CRON_SCHEDULES, CRON_TIMEZONE } from "@/lib/config/cron-schedules";
import { removeRepeatableJobs } from "../repeatable";

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
      repeat: { pattern: CRON_PATTERN, tz: CRON_TIMEZONE },
      jobId: REPEATABLE_JOB_ID,
    }
  );
  logger.info(
    { queue: TUS_GC_QUEUE_NAME, pattern: CRON_PATTERN },
    `[Queue:${TUS_GC_QUEUE_NAME}] Cron scheduled (every 6h)`
  );
  return job;
};

/**
 * Remove the scheduled cron.
 *
 * F20: Diese Funktion fehlte komplett — der Cron liess sich planen, aber nicht
 * mehr abschalten. Aufgefallen ueber den Vollstaendigkeits-Test in
 * queue-hygiene.test.ts ("jede Queue mit einem Cron kann ihn auch wieder
 * entfernen"), nicht ueber den Auditbericht.
 */
export const removeTusGcSchedule = async (): Promise<boolean> => {
  const queue = getTusGcQueue();
  const removed = await removeRepeatableJobs(queue, {
    name: "tus-gc",
    jobId: REPEATABLE_JOB_ID,
  });
  return removed > 0;
};

export const closeTusGcQueue = async (): Promise<void> => {
  if (tusGcQueue) {
    await tusGcQueue.close();
    tusGcQueue = null;
    logger.info(`[Queue:${TUS_GC_QUEUE_NAME}] Closed`);
  }
};
