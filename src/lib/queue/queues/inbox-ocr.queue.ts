/**
 * Inbox OCR Queue - BullMQ Queue for incoming invoice OCR processing
 *
 * Handles asynchronous OCR processing of uploaded invoice PDFs.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";

export interface InboxOcrJobData {
  invoiceId: string;
  tenantId: string;
  fileUrl: string;
}

export interface InboxOcrJobResult {
  success: boolean;
  fieldsExtracted?: number;
  error?: string;
}

export const INBOX_OCR_QUEUE_NAME = "inbox-ocr";

const defaultJobOptions: JobsOptions = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

let inboxOcrQueue: Queue<InboxOcrJobData> | null = null;

export const getInboxOcrQueue = (): Queue<InboxOcrJobData> => {
  if (!inboxOcrQueue) {
    inboxOcrQueue = new Queue<InboxOcrJobData>(INBOX_OCR_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });
    logger.info(`[Queue:${INBOX_OCR_QUEUE_NAME}] Initialized`);
  }
  return inboxOcrQueue;
};

export const enqueueInboxOcrJob = async (data: InboxOcrJobData): Promise<void> => {
  const queue = getInboxOcrQueue();
  const jobId = `inbox-ocr-${data.invoiceId}`;
  const job = await queue.add("ocr", data, { jobId });
  logger.info(
    `[Queue:${INBOX_OCR_QUEUE_NAME}] Job ${job.id} added: invoice=${data.invoiceId}`
  );
};

export const closeInboxOcrQueue = async (): Promise<void> => {
  if (inboxOcrQueue) {
    await inboxOcrQueue.close();
    inboxOcrQueue = null;
    logger.info(`[Queue:${INBOX_OCR_QUEUE_NAME}] Closed`);
  }
};
