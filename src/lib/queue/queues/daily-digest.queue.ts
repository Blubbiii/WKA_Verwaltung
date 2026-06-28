/**
 * Idee E — Daily-Digest Cron Queue.
 *
 * Täglich 08:00 Uhr: pro User mit `dailyDigestEnabled=true` eine E-Mail mit
 * den 5 wichtigsten Vorgängen seit dem letzten Send. Reuse-Pattern von
 * retention-cron.queue.ts.
 *
 * WICHTIG: Default Dry-Run. Echte Mails NUR bei DIGEST_DRY_RUN=false.
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_SCHEDULES } from "@/lib/config/cron-schedules";

export interface DailyDigestJobData {
  /** Optional: nur diesen User testen (Ad-Hoc / Tests). */
  userId?: string;
  /** Override für Dry-Run-Flag (nur Tests). */
  forceDryRun?: boolean;
}

export interface DailyDigestJobResult {
  dryRun: boolean;
  processedUsers: number;
  sentMails: number;
  skippedAlreadySentToday: number;
  startedAt: string;
  finishedAt: string;
}

export const DAILY_DIGEST_QUEUE_NAME = "daily-digest";

const REPEATABLE_JOB_ID = "daily-digest-daily";

const CRON_PATTERN = CRON_SCHEDULES.DAILY_DIGEST;

const defaultJobOptions = getJobOptions("background");

let dailyDigestQueue: Queue<DailyDigestJobData, DailyDigestJobResult> | null =
  null;

export const getDailyDigestQueue = (): Queue<
  DailyDigestJobData,
  DailyDigestJobResult
> => {
  if (!dailyDigestQueue) {
    dailyDigestQueue = new Queue<DailyDigestJobData, DailyDigestJobResult>(
      DAILY_DIGEST_QUEUE_NAME,
      {
        ...getBullMQConnection(),
        defaultJobOptions,
      },
    );
    logger.info(`[Queue:${DAILY_DIGEST_QUEUE_NAME}] Initialized`);
  }
  return dailyDigestQueue;
};

export const scheduleDailyDigest = async () => {
  const queue = getDailyDigestQueue();

  const job = await queue.add(
    "daily-digest-sweep",
    {},
    {
      repeat: { pattern: CRON_PATTERN },
      jobId: REPEATABLE_JOB_ID,
    },
  );

  logger.info(
    { queue: DAILY_DIGEST_QUEUE_NAME, pattern: CRON_PATTERN },
    `[Queue:${DAILY_DIGEST_QUEUE_NAME}] Cron scheduled (daily 08:00)`,
  );
  return job;
};

export const enqueueDailyDigestNow = async (
  data: DailyDigestJobData = {},
) => {
  const queue = getDailyDigestQueue();
  return queue.add("daily-digest-sweep", data, {
    jobId: `daily-digest-manual-${Date.now()}`,
  });
};

export const removeDailyDigestSchedule = async (): Promise<boolean> => {
  const queue = getDailyDigestQueue();
  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      if (rj.name === "daily-digest-sweep") {
        await queue.removeRepeatableByKey(rj.key);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};

export const closeDailyDigestQueue = async (): Promise<void> => {
  if (dailyDigestQueue) {
    await dailyDigestQueue.close();
    dailyDigestQueue = null;
  }
};
