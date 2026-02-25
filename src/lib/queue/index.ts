import { jobLogger as logger } from "@/lib/logger";
/**
 * Queue Infrastructure - Central Export Module
 *
 * This module provides centralized access to all BullMQ queues
 * used in the WindparkManager application.
 *
 * @example
 * ```typescript
 * import {
 *   enqueueEmail,
 *   enqueuePdfGeneration,
 *   QUEUE_NAMES
 * } from '@/lib/queue';
 *
 * // Send an email
 * await enqueueEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   template: 'welcome',
 *   data: { name: 'John' },
 *   tenantId: 'tenant-123',
 * });
 *
 * // Generate a PDF
 * await enqueuePdfGeneration({
 *   type: 'invoice',
 *   entityId: 'inv-456',
 *   tenantId: 'tenant-123',
 * });
 * ```
 */

// ============================================
// Connection Management
// ============================================

export {
  getRedisConnection,
  getSubscriberConnection,
  closeConnections,
  isRedisHealthy,
  getBullMQConnection,
  getBullMQWorkerConnection,
} from './connection';

// ============================================
// Queue Name Constants
// ============================================

export { EMAIL_QUEUE_NAME } from './queues/email.queue';
export { PDF_QUEUE_NAME } from './queues/pdf.queue';
export { BILLING_QUEUE_NAME } from './queues/billing.queue';
export { WEATHER_QUEUE_NAME } from './queues/weather.queue';
export { REPORT_QUEUE_NAME } from './queues/report.queue';
export { REMINDER_QUEUE_NAME } from './queues/reminder.queue';
export { SCADA_AUTO_IMPORT_QUEUE_NAME } from './queues/scada-auto-import.queue';
export { WEBHOOK_QUEUE_NAME } from './queues/webhook.queue';

/**
 * All queue names as a constant object for easy reference
 */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  PDF: 'pdf',
  BILLING: 'billing',
  WEATHER: 'weather',
  REPORT: 'report',
  REMINDER: 'reminder',
  SCADA_AUTO_IMPORT: 'scada-auto-import',
  WEBHOOK: 'webhook',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ============================================
// Email Queue
// ============================================

export {
  getEmailQueue,
  enqueueEmail,
  enqueueEmailBulk,
  closeEmailQueue,
} from './queues/email.queue';

export type {
  EmailJobData,
  EmailTemplate,
} from './queues/email.queue';

// ============================================
// PDF Queue
// ============================================

export {
  getPdfQueue,
  enqueuePdfGeneration,
  enqueueInvoicePdf,
  enqueueReportPdf,
  enqueueVoteResultPdf,
  enqueuePdfBulk,
  closePdfQueue,
} from './queues/pdf.queue';

export type {
  PdfJobData,
  PdfDocumentType,
} from './queues/pdf.queue';

// ============================================
// Billing Queue
// ============================================

export {
  getBillingQueue,
  enqueueBillingJob,
  scheduleRecurringBilling,
  removeRecurringBilling,
  enqueueBillingDryRun,
  enqueueBillingBulk,
  closeBillingQueue,
} from './queues/billing.queue';

export type {
  BillingJobData,
  BillingJobResult,
} from './queues/billing.queue';

// ============================================
// Weather Queue
// ============================================

export {
  getWeatherQueue,
  enqueueWeatherSync,
  scheduleWeatherSync,
  scheduleDailyWeatherSync,
  removeScheduledWeatherSync,
  enqueueWeatherSyncForTenant,
  enqueueWeatherSyncBulk,
  closeWeatherQueue,
} from './queues/weather.queue';

export type {
  WeatherJobData,
  WeatherJobResult,
} from './queues/weather.queue';

// ============================================
// Report Queue
// ============================================

export {
  getReportQueue,
  enqueueScheduledReportProcessing,
  scheduleDailyReportProcessing,
  removeDailyReportProcessing,
  closeReportQueue,
} from './queues/report.queue';

export type {
  ReportJobData,
  ReportJobResult,
} from './queues/report.queue';

// ============================================
// Reminder Queue
// ============================================

export {
  getReminderQueue,
  enqueueReminderCheck,
  scheduleDailyReminderCheck,
  removeDailyReminderCheck,
  closeReminderQueue,
} from './queues/reminder.queue';

export type {
  ReminderJobData,
  ReminderJobResult,
} from './queues/reminder.queue';

// ============================================
// SCADA Auto-Import Queue
// ============================================

export {
  getScadaAutoImportQueue,
  enqueueScadaAutoImportAll,
  enqueueScadaAutoImportForTenant,
  scheduleScadaAutoImport,
  removeScadaAutoImportSchedule,
  closeScadaAutoImportQueue,
} from './queues/scada-auto-import.queue';

export type {
  ScadaAutoImportJobData,
  ScadaAutoImportJobResult,
} from './queues/scada-auto-import.queue';

// ============================================
// Webhook Queue
// ============================================

export {
  getWebhookQueue,
  enqueueWebhookDelivery,
  closeWebhookQueue,
} from './queues/webhook.queue';

export type {
  WebhookJobData,
  WebhookJobResult,
} from './queues/webhook.queue';

// ============================================
// Utility Functions
// ============================================

/**
 * Close all queue connections gracefully
 * Should be called during application shutdown
 */
export const closeAllQueues = async (): Promise<void> => {
  const { closeEmailQueue } = await import('./queues/email.queue');
  const { closePdfQueue } = await import('./queues/pdf.queue');
  const { closeBillingQueue } = await import('./queues/billing.queue');
  const { closeWeatherQueue } = await import('./queues/weather.queue');
  const { closeReportQueue } = await import('./queues/report.queue');
  const { closeReminderQueue } = await import('./queues/reminder.queue');
  const { closeScadaAutoImportQueue } = await import('./queues/scada-auto-import.queue');
  const { closeWebhookQueue } = await import('./queues/webhook.queue');
  const { closeConnections } = await import('./connection');

  logger.info('[Queue] Closing all queues...');

  // Close queues first
  await Promise.all([
    closeEmailQueue(),
    closePdfQueue(),
    closeBillingQueue(),
    closeWeatherQueue(),
    closeReportQueue(),
    closeReminderQueue(),
    closeScadaAutoImportQueue(),
    closeWebhookQueue(),
  ]);

  // Then close Redis connections
  await closeConnections();

  logger.info('[Queue] All queues and connections closed');
};

/**
 * Health check for all queues
 * Returns status of each queue and Redis connection
 */
export const getQueueHealth = async (): Promise<{
  redis: boolean;
  queues: Record<string, { connected: boolean; jobCounts?: object }>;
}> => {
  const { isRedisHealthy } = await import('./connection');
  const { getEmailQueue } = await import('./queues/email.queue');
  const { getPdfQueue } = await import('./queues/pdf.queue');
  const { getBillingQueue } = await import('./queues/billing.queue');
  const { getWeatherQueue } = await import('./queues/weather.queue');
  const { getReportQueue } = await import('./queues/report.queue');
  const { getReminderQueue } = await import('./queues/reminder.queue');
  const { getScadaAutoImportQueue } = await import('./queues/scada-auto-import.queue');
  const { getWebhookQueue } = await import('./queues/webhook.queue');

  const redisHealthy = await isRedisHealthy();

  const queueStatus: Record<string, { connected: boolean; jobCounts?: object }> = {};

  const checkQueue = async (name: string, getQueue: () => unknown) => {
    try {
      const queue = getQueue() as { getJobCounts: () => Promise<object> };
      const jobCounts = await queue.getJobCounts();
      queueStatus[name] = { connected: true, jobCounts };
    } catch {
      queueStatus[name] = { connected: false };
    }
  };

  await Promise.all([
    checkQueue(QUEUE_NAMES.EMAIL, getEmailQueue),
    checkQueue(QUEUE_NAMES.PDF, getPdfQueue),
    checkQueue(QUEUE_NAMES.BILLING, getBillingQueue),
    checkQueue(QUEUE_NAMES.WEATHER, getWeatherQueue),
    checkQueue(QUEUE_NAMES.REPORT, getReportQueue),
    checkQueue(QUEUE_NAMES.REMINDER, getReminderQueue),
    checkQueue(QUEUE_NAMES.SCADA_AUTO_IMPORT, getScadaAutoImportQueue),
    checkQueue(QUEUE_NAMES.WEBHOOK, getWebhookQueue),
  ]);

  return {
    redis: redisHealthy,
    queues: queueStatus,
  };
};
