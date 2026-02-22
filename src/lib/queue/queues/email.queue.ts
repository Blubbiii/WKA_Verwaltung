/**
 * Email Queue - BullMQ Queue for Email Sending
 *
 * Handles asynchronous email delivery with retry logic and
 * support for templated emails across all tenants.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";

/**
 * Available email templates
 */
export type EmailTemplate =
  | 'welcome'
  | 'password-reset'
  | 'invoice-notification'
  | 'report-ready'
  | 'vote-invitation'
  | 'vote-reminder'
  | 'vote-result'
  | 'document-shared'
  | 'service-event-notification'
  | 'settlement-notification'
  | 'news-announcement'
  | 'portal-invitation';

/**
 * Email job data structure
 */
export interface EmailJobData {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Template identifier for the email */
  template: EmailTemplate;
  /** Dynamic data to populate the template */
  data: Record<string, unknown>;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Optional CC recipients */
  cc?: string[];
  /** Optional BCC recipients */
  bcc?: string[];
  /** Optional reply-to address */
  replyTo?: string;
  /** Optional attachments */
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
  /** Priority: 1 (highest) to 10 (lowest), default 5 */
  priority?: number;
}

/**
 * Queue name constant
 */
export const EMAIL_QUEUE_NAME = 'email';

/**
 * Default job options for email queue
 */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // Start with 2s, then 4s, 8s
  },
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    count: 500, // Keep last 500 failed jobs for debugging
  },
};

// Singleton queue instance
let emailQueue: Queue<EmailJobData> | null = null;

/**
 * Get or create the email queue instance
 */
export const getEmailQueue = (): Queue<EmailJobData> => {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${EMAIL_QUEUE_NAME}] Initialized`);
  }

  return emailQueue;
};

/**
 * Enqueue an email for sending
 *
 * @param jobData - Email job data
 * @param options - Optional job-specific options to override defaults
 * @returns The created job
 *
 * @example
 * ```typescript
 * await enqueueEmail({
 *   to: 'user@example.com',
 *   subject: 'Your Invoice is Ready',
 *   template: 'invoice-notification',
 *   data: { invoiceNumber: 'INV-001', amount: 1500 },
 *   tenantId: 'tenant-123',
 * });
 * ```
 */
export const enqueueEmail = async (
  jobData: EmailJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getEmailQueue();

  // Generate a unique job ID based on content to prevent duplicates
  const jobId = `email-${jobData.tenantId}-${jobData.to}-${Date.now()}`;

  const job = await queue.add(jobData.template, jobData, {
    ...options,
    jobId,
    // Set priority if specified (lower number = higher priority)
    priority: jobData.priority ?? 5,
  });

  logger.info(
    `[Queue:${EMAIL_QUEUE_NAME}] Job ${job.id} added: ${jobData.template} to ${jobData.to}`
  );

  return job;
};

/**
 * Enqueue multiple emails in bulk
 *
 * @param jobs - Array of email job data
 * @returns Array of created jobs
 */
export const enqueueEmailBulk = async (
  jobs: Array<{ data: EmailJobData; options?: Partial<JobsOptions> }>
) => {
  const queue = getEmailQueue();

  const bulkJobs = jobs.map(({ data, options }) => ({
    name: data.template,
    data,
    opts: {
      ...options,
      jobId: `email-${data.tenantId}-${data.to}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      priority: data.priority ?? 5,
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);

  logger.info(
    `[Queue:${EMAIL_QUEUE_NAME}] ${addedJobs.length} bulk jobs added`
  );

  return addedJobs;
};

/**
 * Close the email queue connection
 */
export const closeEmailQueue = async (): Promise<void> => {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
    logger.info(`[Queue:${EMAIL_QUEUE_NAME}] Closed`);
  }
};
