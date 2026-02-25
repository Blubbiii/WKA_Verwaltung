/**
 * Webhook Queue - BullMQ Queue for Webhook Delivery
 *
 * Handles asynchronous webhook HTTP POST delivery with
 * retry logic and exponential backoff.
 */

import { Queue, JobsOptions } from "bullmq";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import type { WebhookEventPayload } from "@/lib/webhooks/dispatcher";

export interface WebhookJobData {
  webhookId: string;
  url: string;
  secret: string;
  payload: WebhookEventPayload;
}

export interface WebhookJobResult {
  success: boolean;
  statusCode?: number;
  duration?: number;
}

export const WEBHOOK_QUEUE_NAME = "webhook";

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 10000, // 10s → 20s → 40s
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
};

let webhookQueue: Queue<WebhookJobData> | null = null;

export const getWebhookQueue = (): Queue<WebhookJobData> => {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${WEBHOOK_QUEUE_NAME}] Initialized`);
  }

  return webhookQueue;
};

export const enqueueWebhookDelivery = async (
  jobData: WebhookJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getWebhookQueue();

  const jobId = `webhook-${jobData.webhookId}-${Date.now()}`;

  const job = await queue.add("deliver", jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${WEBHOOK_QUEUE_NAME}] Job ${job.id} added: ${jobData.payload.event} → ${jobData.url}`
  );

  return job;
};

export const closeWebhookQueue = async (): Promise<void> => {
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
    logger.info(`[Queue:${WEBHOOK_QUEUE_NAME}] Closed`);
  }
};
