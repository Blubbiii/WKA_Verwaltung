/**
 * Paperless Worker - BullMQ Worker for Paperless-ngx Document Sync
 *
 * Downloads documents from S3 and uploads them to Paperless-ngx.
 * Updates the Document record with sync status.
 */

import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getFileBuffer } from "@/lib/storage";
import { getPaperlessClient } from "@/lib/paperless";
import type {
  PaperlessJobData,
  PaperlessJobResult,
} from "../queues/paperless.queue";
import { PAPERLESS_QUEUE_NAME } from "../queues/paperless.queue";

async function processPaperlessJob(
  job: Job<PaperlessJobData, PaperlessJobResult>
): Promise<PaperlessJobResult> {
  const { documentId, tenantId } = job.data;

  logger.info(
    { jobId: job.id, documentId, tenantId },
    "[Paperless Worker] Processing upload"
  );

  // Mark as PENDING
  await prisma.document.update({
    where: { id: documentId },
    data: { paperlessSyncStatus: "PENDING", paperlessSyncError: null },
  });

  // Get Paperless client
  const client = await getPaperlessClient(tenantId);
  if (!client) {
    await prisma.document.update({
      where: { id: documentId },
      data: { paperlessSyncStatus: "SKIPPED", paperlessSyncError: "Paperless not configured" },
    });
    return { success: true, error: "Paperless not configured — skipped" };
  }

  // Load document from DB
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      fileName: true,
      fileUrl: true,
      category: true,
      mimeType: true,
    },
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  if (!document.fileUrl) {
    await prisma.document.update({
      where: { id: documentId },
      data: { paperlessSyncStatus: "SKIPPED", paperlessSyncError: "No file attached" },
    });
    return { success: true, error: "No file — skipped" };
  }

  // Download file from S3
  const fileBuffer = await getFileBuffer(document.fileUrl);

  // Upload to Paperless
  const taskId = await client.uploadDocument(fileBuffer, {
    title: document.title,
    filename: document.fileName,
  });

  // Update document with sync status
  await prisma.document.update({
    where: { id: documentId },
    data: {
      paperlessSyncStatus: "SYNCED",
      paperlessSyncedAt: new Date(),
      paperlessSyncError: null,
    },
  });

  logger.info(
    { jobId: job.id, documentId, taskId },
    "[Paperless Worker] Upload successful"
  );

  return { success: true, taskId };
}

// =============================================================================
// Worker Instance
// =============================================================================

let paperlessWorker: Worker<PaperlessJobData, PaperlessJobResult> | null = null;

export function startPaperlessWorker(): Worker<PaperlessJobData, PaperlessJobResult> {
  if (paperlessWorker) {
    logger.info("Paperless worker already running");
    return paperlessWorker;
  }

  const connection = getRedisConnection();

  paperlessWorker = new Worker<PaperlessJobData, PaperlessJobResult>(
    PAPERLESS_QUEUE_NAME,
    processPaperlessJob,
    {
      connection,
      concurrency: 3,
      useWorkerThreads: false,
    }
  );

  paperlessWorker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, documentId: job.data.documentId },
      "[Paperless Worker] Job completed"
    );
  });

  paperlessWorker.on("failed", async (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message, attempts: job?.attemptsMade },
      "[Paperless Worker] Job failed"
    );

    // Update document with error on final failure
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      await prisma.document.update({
        where: { id: job.data.documentId },
        data: {
          paperlessSyncStatus: "FAILED",
          paperlessSyncError: error.message.substring(0, 500),
        },
      }).catch((dbErr) => {
        logger.error({ err: dbErr }, "[Paperless Worker] Failed to update document status");
      });
    }
  });

  paperlessWorker.on("error", (error) => {
    logger.error({ err: error }, "[Paperless Worker] Worker error");
  });

  logger.info({ concurrency: 3 }, "Paperless worker started");

  return paperlessWorker;
}

export async function stopPaperlessWorker(): Promise<void> {
  if (!paperlessWorker) return;

  logger.info("Stopping paperless worker...");
  await paperlessWorker.close();
  paperlessWorker = null;
  logger.info("Paperless worker stopped");
}

export function isPaperlessWorkerRunning(): boolean {
  return paperlessWorker !== null;
}

export function getPaperlessWorker(): Worker<PaperlessJobData, PaperlessJobResult> | null {
  return paperlessWorker;
}
