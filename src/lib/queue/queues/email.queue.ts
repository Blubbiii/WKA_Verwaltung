/**
 * Email Queue - BullMQ Queue for Email Sending
 *
 * Handles asynchronous email delivery with retry logic and
 * support for templated emails across all tenants.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import type { SupportedTemplateName } from "@/lib/email/renderer";

/**
 * Available email templates.
 *
 * F3: Das war frueher eine handgepflegte Union, die von der tatsaechlich
 * renderbaren Liste abwich — sie kannte 'invoice-notification' und
 * 'service-event-notification' (existieren nicht) und kannte 'new-invoice'
 * und 'tenant-admin-invitation' nicht (existieren sehr wohl). Jetzt direkt
 * an den Renderer gekoppelt, damit ein nicht renderbares Template gar nicht
 * mehr compiliert.
 */
export type EmailTemplate = SupportedTemplateName;

/**
 * Email job data structure — SINGLE SOURCE OF TRUTH.
 *
 * F3: Es gab zwei verschiedene Typen namens `EmailJobData` — hier
 * `{template, data}`, im Worker `{type, templateData}`. Der Worker las
 * `data.type` (undefined) und fiel in den Fallback-Zweig, der
 * `data.templateData.html` liest → TypeError auf undefined. Der Job schlug
 * also nicht mit Template-Fehler fehl, sondern hart: 3x Retry, dann DLQ.
 * Verstaerkend schrieb reminder-service `emailSent = true`, sobald das
 * Enqueue zurueckkam — die Mahnung galt als versendet, kam nie an, und der
 * Cooldown verhinderte danach jede Wiederholung.
 */
export interface EmailJobData {
  /** Optionale Job-ID für Tracking (Fallback: BullMQ job.id) */
  jobId?: string;
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /**
   * Template identifier for the email.
   *
   * Weglassen für eine einfache HTML-Mail ohne Template — dann kommen
   * `data.html` und `data.text` zum Einsatz. Das ist der richtige Weg für
   * Ad-hoc- und Admin-Benachrichtigungen, die zu keinem Fachtemplate passen.
   * Vorher war dieser Pfad nur der ungewollte Fallback bei unbekanntem
   * Template-Namen und lief auf einen TypeError.
   */
  template?: EmailTemplate;
  /** Dynamic data to populate the template (bzw. `html`/`text` ohne Template) */
  data: Record<string, unknown>;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Optional CC recipients */
  cc?: string[];
  /** Optional BCC recipients */
  bcc?: string[];
  /** Optional reply-to address */
  replyTo?: string;
  /**
   * Optional attachments.
   *
   * `content` MUSS ein Base64-String sein, kein Buffer: BullMQ serialisiert
   * die Job-Daten nach JSON, und ein Buffer kommt auf der Worker-Seite als
   * `{ type: "Buffer", data: [...] }` wieder heraus — nicht als Buffer.
   * Wer eine Datei anhaengen will, nutzt `path` oder base64-kodiert selbst.
   */
  attachments?: Array<{
    filename: string;
    /** Base64-kodierter Inhalt */
    content?: string;
    /** Alternativ: Pfad, den der Provider selbst liest */
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
const defaultJobOptions = getJobOptions("critical");

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
 *   subject: 'Ihre Rechnung ist bereit',
 *   template: 'new-invoice',
 *   data: { invoiceNumber: 'INV-001', amount: '1.500,00 €' },
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

  // Job-Name = Template, ohne Template ein sprechender Platzhalter.
  // Der Name taucht in der Admin-Jobs-Ansicht und in BullMQ-Metriken auf.
  const job = await queue.add(jobData.template ?? "plain", jobData, {
    ...options,
    jobId,
    // Set priority if specified (lower number = higher priority)
    priority: jobData.priority ?? 5,
  });

  logger.info(
    `[Queue:${EMAIL_QUEUE_NAME}] Job ${job.id} added: ${jobData.template ?? "plain"} to ${jobData.to}`
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
    name: data.template ?? "plain",
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
