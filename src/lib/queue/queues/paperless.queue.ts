/**
 * Paperless Queue - BullMQ Queue for Paperless-ngx Document Sync
 *
 * Handles asynchronous document uploads to Paperless-ngx
 * with retry logic and exponential backoff.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";

export interface PaperlessJobData {
  documentId: string;
  tenantId: string;
  action: "upload";
}

export interface PaperlessJobResult {
  success: boolean;
  paperlessDocumentId?: number;
  taskId?: string;
  error?: string;
}

export const PAPERLESS_QUEUE_NAME = "paperless";

const defaultJobOptions = getJobOptions("slow");

let paperlessQueue: Queue<PaperlessJobData> | null = null;

export const getPaperlessQueue = (): Queue<PaperlessJobData> => {
  if (!paperlessQueue) {
    paperlessQueue = new Queue<PaperlessJobData>(PAPERLESS_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${PAPERLESS_QUEUE_NAME}] Initialized`);
  }

  return paperlessQueue;
};

export const enqueuePaperlessJob = async (
  jobData: PaperlessJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getPaperlessQueue();

  const jobId = `paperless-${jobData.action}-${jobData.documentId}`;

  const job = await queue.add(jobData.action, jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${PAPERLESS_QUEUE_NAME}] Job ${job.id} added: ${jobData.action} doc=${jobData.documentId}`
  );

  return job;
};

export const closePaperlessQueue = async (): Promise<void> => {
  if (paperlessQueue) {
    await paperlessQueue.close();
    paperlessQueue = null;
    logger.info(`[Queue:${PAPERLESS_QUEUE_NAME}] Closed`);
  }
};
