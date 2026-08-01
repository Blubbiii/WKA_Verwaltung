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
import { HTTP_TIMEOUTS } from "@/lib/config/api-limits";
import type {
  WebhookJobData,
  WebhookJobResult,
} from "../queues/webhook.queue";
import { WEBHOOK_QUEUE_NAME } from "../queues/webhook.queue";
import type { Prisma } from "@prisma/client";
import { isFinalAttempt } from "../dead-letter";

/**
 * Lohnt sich bei diesem HTTP-Status ein weiterer Versuch?
 *
 * F16: Vorher wurde jeder Non-2xx-Status wiederholt. Ein 401 (falsches
 * Secret), 404/410 (Endpunkt existiert nicht mehr) oder 400 (Payload passt
 * nicht) wird beim zweiten und dritten Mal genauso scheitern.
 *
 * Wiederholt werden nur:
 * - 408 Request Timeout und 429 Too Many Requests
 * - alle 5xx (Serverfehler beim Empfaenger)
 * Netzwerkfehler ohne Status (fetch wirft) bleiben ebenfalls wiederholbar —
 * sie laufen nicht durch diese Funktion.
 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

async function processWebhookJob(
  job: Job<WebhookJobData, WebhookJobResult>
): Promise<WebhookJobResult> {
  const { webhookId, payload } = job.data;

  // F26: url und secret kommen aus dem Datensatz, nicht aus dem Job-Payload.
  // Damit liegt das Secret nicht in Redis, und eine Rotation wirkt auch auf
  // bereits eingereihte Jobs.
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
    select: { url: true, secret: true, isActive: true },
  });

  if (!webhook) {
    logger.warn(
      { jobId: job.id, webhookId, event: payload.event },
      "[Webhook Worker] Webhook existiert nicht mehr — Zustellung verworfen"
    );
    // Kein Retry: der Empfaenger ist weg, das aendert sich nicht.
    job.discard();
    throw new Error(`Webhook ${webhookId} existiert nicht mehr`);
  }

  if (!webhook.isActive) {
    logger.info(
      { jobId: job.id, webhookId, event: payload.event },
      "[Webhook Worker] Webhook ist deaktiviert — Zustellung uebersprungen"
    );
    // Deaktiviert ist kein Fehler, sondern eine bewusste Einstellung.
    return { success: true };
  }

  const { url, secret } = webhook;

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
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUTS.webhookFetchMs);

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
      // F16: Vorher wurde JEDER Non-2xx-Status gleich behandelt und dreimal
      // wiederholt — auch ein 401 (falsches Secret), 404/410 (Endpunkt weg)
      // oder 400 (Payload passt nicht). Dort aendert ein Retry nichts, er
      // kostet nur Zeit und verzoegert die uebrigen Zustellungen.
      const retryable = isRetryableHttpStatus(response.status);

      logger.warn(
        {
          jobId: job.id,
          statusCode: response.status,
          url,
          duration,
          retryable,
        },
        "[Webhook Worker] Non-2xx response"
      );

      if (!retryable) {
        // Als endgueltig markieren: der Job gilt als failed (und landet damit
        // in der Dead-Letter-Queue), wird aber nicht erneut versucht.
        job.discard();
      }

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
    // BullMQ feuert `failed` bei JEDEM Versuch, nicht nur beim letzten.
    // Ohne diese Unterscheidung stand "endgueltig gescheitert" schon beim
    // ersten von drei Versuchen im Log — auch wenn der zweite gelang.
    const isFinal = job ? isFinalAttempt(job) : true;
    const meta = {
      jobId: job?.id,
      error: error.message,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts ?? 1,
    };
    if (isFinal) {
      logger.error(meta, "[Webhook Worker] Job endgueltig gescheitert");
    } else {
      logger.warn(meta, "[Webhook Worker] Versuch fehlgeschlagen, wird wiederholt");
    }
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

export function isWebhookWorkerRunning(): boolean {
  return webhookWorker !== null && !webhookWorker.closing;
}

export function getWebhookWorker(): Worker<WebhookJobData, WebhookJobResult> | null {
  return webhookWorker;
}

export type { WebhookJobData, WebhookJobResult };
