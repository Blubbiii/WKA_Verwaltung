/**
 * PDF Queue - BullMQ Queue for PDF Generation
 *
 * Handles asynchronous PDF generation for invoices, reports,
 * and vote results with support for multi-tenant environments.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";

/**
 * Supported PDF document types
 */
export type PdfDocumentType = 'invoice' | 'report' | 'vote-result';

/**
 * PDF job data structure
 */
export interface PdfJobData {
  /** Type of PDF document to generate */
  type: PdfDocumentType;
  /** ID of the entity (invoice, report, or vote) to generate PDF for */
  entityId: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Optional: User ID who requested the generation */
  requestedBy?: string;
  /** Optional: Callback URL to notify when PDF is ready */
  callbackUrl?: string;
  /** Optional: Additional options for PDF generation */
  options?: {
    /** Include watermark (e.g., "DRAFT", "CONFIDENTIAL") */
    watermark?: string;
    /** Language for localization */
    locale?: string;
    /** Paper size */
    paperSize?: 'A4' | 'Letter';
    /** Include digital signature */
    signed?: boolean;
  };
}

/**
 * Queue name constant
 */
export const PDF_QUEUE_NAME = 'pdf';

/**
 * Default job options for PDF queue
 * PDF generation can be resource-intensive, so we use longer timeouts
 */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // Start with 5s, then 10s, 20s (PDF generation is slow)
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
};

// Singleton queue instance
let pdfQueue: Queue<PdfJobData> | null = null;

/**
 * Get or create the PDF queue instance
 */
export const getPdfQueue = (): Queue<PdfJobData> => {
  if (!pdfQueue) {
    pdfQueue = new Queue<PdfJobData>(PDF_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${PDF_QUEUE_NAME}] Initialized`);
  }

  return pdfQueue;
};

/**
 * Enqueue a PDF generation job
 *
 * @param jobData - PDF job data
 * @param options - Optional job-specific options to override defaults
 * @returns The created job
 *
 * @example
 * ```typescript
 * await enqueuePdfGeneration({
 *   type: 'invoice',
 *   entityId: 'inv-123',
 *   tenantId: 'tenant-456',
 *   options: { locale: 'de', paperSize: 'A4' },
 * });
 * ```
 */
export const enqueuePdfGeneration = async (
  jobData: PdfJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getPdfQueue();

  // Generate unique job ID to prevent duplicate generations
  const jobId = `pdf-${jobData.type}-${jobData.entityId}-${jobData.tenantId}`;

  const job = await queue.add(jobData.type, jobData, {
    ...options,
    jobId,
    // Prevent duplicate jobs for the same entity
    // If a job with this ID exists and is not completed, skip
  });

  logger.info(
    `[Queue:${PDF_QUEUE_NAME}] Job ${job.id} added: ${jobData.type} for entity ${jobData.entityId}`
  );

  return job;
};

/**
 * Enqueue invoice PDF generation
 * Convenience function for invoice-specific PDF generation
 */
export const enqueueInvoicePdf = async (
  invoiceId: string,
  tenantId: string,
  options?: {
    requestedBy?: string;
    watermark?: string;
    locale?: string;
  }
) => {
  return enqueuePdfGeneration({
    type: 'invoice',
    entityId: invoiceId,
    tenantId,
    requestedBy: options?.requestedBy,
    options: {
      watermark: options?.watermark,
      locale: options?.locale ?? 'de',
      paperSize: 'A4',
    },
  });
};

/**
 * Enqueue report PDF generation
 * Convenience function for report-specific PDF generation
 */
export const enqueueReportPdf = async (
  reportId: string,
  tenantId: string,
  options?: {
    requestedBy?: string;
    locale?: string;
  }
) => {
  return enqueuePdfGeneration({
    type: 'report',
    entityId: reportId,
    tenantId,
    requestedBy: options?.requestedBy,
    options: {
      locale: options?.locale ?? 'de',
      paperSize: 'A4',
    },
  });
};

/**
 * Enqueue vote result PDF generation
 * Convenience function for vote result-specific PDF generation
 */
export const enqueueVoteResultPdf = async (
  voteId: string,
  tenantId: string,
  options?: {
    requestedBy?: string;
    signed?: boolean;
  }
) => {
  return enqueuePdfGeneration({
    type: 'vote-result',
    entityId: voteId,
    tenantId,
    requestedBy: options?.requestedBy,
    options: {
      locale: 'de',
      paperSize: 'A4',
      signed: options?.signed ?? true, // Vote results should be signed by default
    },
  });
};

/**
 * Enqueue multiple PDF generation jobs in bulk
 */
export const enqueuePdfBulk = async (
  jobs: Array<{ data: PdfJobData; options?: Partial<JobsOptions> }>
) => {
  const queue = getPdfQueue();

  const bulkJobs = jobs.map(({ data, options }) => ({
    name: data.type,
    data,
    opts: {
      ...options,
      jobId: `pdf-${data.type}-${data.entityId}-${data.tenantId}`,
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);

  logger.info(
    `[Queue:${PDF_QUEUE_NAME}] ${addedJobs.length} bulk jobs added`
  );

  return addedJobs;
};

/**
 * Close the PDF queue connection
 */
export const closePdfQueue = async (): Promise<void> => {
  if (pdfQueue) {
    await pdfQueue.close();
    pdfQueue = null;
    logger.info(`[Queue:${PDF_QUEUE_NAME}] Closed`);
  }
};
