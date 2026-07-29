/**
 * Webhook Queue - BullMQ Queue for Webhook Delivery
 *
 * Handles asynchronous webhook HTTP POST delivery with
 * retry logic and exponential backoff.
 */

import { Queue, JobsOptions } from "bullmq";
import crypto from "crypto";
import { getBullMQConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import type { WebhookEventPayload } from "@/lib/webhooks/dispatcher";

/**
 * F26: `url` und `secret` standen hier im Job-Payload.
 *
 * Zwei Probleme:
 * 1. Sicherheit — das Signatur-Secret lag im Klartext in Redis, in `job.data`
 *    (also auch in der Admin-Jobs-Ansicht) und in `FailedJob.payload`.
 * 2. Snapshot — eine Secret- oder URL-Rotation wirkte nicht auf bereits
 *    eingereihte Jobs. Die Zustellung signierte mit dem alten Secret, der
 *    Empfaenger verwarf sie.
 *
 * Der Worker laedt beides jetzt zur Zustellzeit aus dem Webhook-Datensatz.
 * Nebeneffekt: ein deaktivierter oder geloeschter Webhook stellt nicht mehr zu.
 */
export interface WebhookJobData {
  webhookId: string;
  payload: WebhookEventPayload;
}

export interface WebhookJobResult {
  success: boolean;
  statusCode?: number;
  duration?: number;
}

export const WEBHOOK_QUEUE_NAME = "webhook";

const defaultJobOptions = getJobOptions("slow");

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

  const jobId = `webhook-${jobData.webhookId}-${crypto.randomUUID()}`;

  const job = await queue.add("deliver", jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${WEBHOOK_QUEUE_NAME}] Job ${job.id} added: ${jobData.payload.event} → webhook ${jobData.webhookId}`
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
