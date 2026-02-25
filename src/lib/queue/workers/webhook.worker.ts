/**
 * Webhook Worker - BullMQ Worker for Webhook HTTP POST Delivery
 *
 * Delivers webhook payloads via HTTP POST with HMAC-SHA256 signing,
 * timeout handling, and delivery logging to the database.
 */

import { Worker, Job } from "bullmq";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import type {
  WebhookJobData,
  WebhookJobResult,
} from "../queues/webhook.queue";
import { WEBHOOK_QUEUE_NAME } from "../queues/webhook.queue";
import type { Prisma } from "@prisma/client";

async function processWebhookJob(
  job: Job<WebhookJobData, WebhookJobResult>
): Promise<WebhookJobResult> {
  const { webhookId, url, secret, payload } = job.data;

  logger.info(
    { jobId: job.id, event: payload.event, url },
    "[Webhook Worker] Processing delivery"
  );

  // Build HMAC-SHA256 signature
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");

  // HTTP POST with 5-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": payload.event,
        "X-Webhook-Delivery-Id": job.id || "unknown",
        "User-Agent": "WindparkManager-Webhook/1.0",
      },
      body: payloadString,
      signal: controller.signal,
    });

    const duration = Date.now() - startTime;
    const responseBody = await response.text().catch(() => "");

    // Log delivery
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event: payload.event,
        payload: payload as unknown as Prisma.InputJsonValue,
        statusCode: response.status,
        responseBody: responseBody.substring(0, 1000),
        duration,
        attempts: job.attemptsMade + 1,
        success: response.ok,
        error: response.ok ? null : `HTTP ${response.status}`,
      },
    });

    if (!response.ok) {
      logger.warn(
        {
          jobId: job.id,
          statusCode: response.status,
          url,
          duration,
        },
        "[Webhook Worker] Non-2xx response"
      );
      throw new Error(
        `HTTP ${response.status}: ${responseBody.substring(0, 200)}`
      );
    }

    logger.info(
      { jobId: job.id, statusCode: response.status, duration },
      "[Webhook Worker] Delivered successfully"
    );

    return { success: true, statusCode: response.status, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log failed delivery (only if not already logged above for non-2xx)
    if (
      !(error instanceof Error && error.message.startsWith("HTTP "))
    ) {
      await prisma.webhookDelivery
        .create({
          data: {
            webhookId,
            event: payload.event,
            payload: payload as unknown as Prisma.InputJsonValue,
            statusCode: null,
            responseBody: null,
            duration,
            attempts: job.attemptsMade + 1,
            success: false,
            error: errorMessage.substring(0, 500),
          },
        })
        .catch((dbErr) => {
          logger.error(
            { err: dbErr },
            "[Webhook Worker] Failed to log delivery"
          );
        });
    }

    logger.error(
      {
        jobId: job.id,
        error: errorMessage,
        attempt: job.attemptsMade + 1,
        url,
      },
      "[Webhook Worker] Delivery failed"
    );

    throw error; // Re-throw for BullMQ retry
  } finally {
    clearTimeout(timeout);
  }
}

// Worker Instance
let webhookWorker: Worker<WebhookJobData, WebhookJobResult> | null = null;

export function startWebhookWorker(): Worker<
  WebhookJobData,
  WebhookJobResult
> {
  if (webhookWorker) {
    logger.info("Webhook worker already running");
    return webhookWorker;
  }

  const connection = getRedisConnection();

  webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
    WEBHOOK_QUEUE_NAME,
    processWebhookJob,
    {
      connection,
      concurrency: 10,
      useWorkerThreads: false,
    }
  );

  webhookWorker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, event: job.data.payload.event },
      "[Webhook Worker] Job completed"
    );
  });

  webhookWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message, attempts: job?.attemptsMade },
      "[Webhook Worker] Job failed permanently"
    );
  });

  webhookWorker.on("error", (error) => {
    logger.error({ err: error }, "[Webhook Worker] Worker error");
  });

  logger.info({ concurrency: 10 }, "Webhook worker started");

  return webhookWorker;
}

export async function stopWebhookWorker(): Promise<void> {
  if (!webhookWorker) return;

  logger.info("Stopping webhook worker...");
  await webhookWorker.close();
  webhookWorker = null;
  logger.info("Webhook worker stopped");
}
