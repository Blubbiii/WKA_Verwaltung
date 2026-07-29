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
export { APPROVALS_EXPIRY_QUEUE_NAME } from './queues/approvals-expiry.queue';
export { APPROVALS_RECONCILE_QUEUE_NAME } from './queues/approvals-reconcile.queue';

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
  APPROVALS_EXPIRY: 'approvals-expiry',
  APPROVALS_RECONCILE: 'approvals-reconcile',
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
// Approvals Expiry Queue
// ============================================

export {
  getApprovalsExpiryQueue,
  scheduleApprovalsExpiryCheck,
  enqueueApprovalsExpiryNow,
  removeApprovalsExpirySchedule,
  closeApprovalsExpiryQueue,
} from './queues/approvals-expiry.queue';

export type {
  ApprovalsExpiryJobData,
  ApprovalsExpiryJobResult,
} from './queues/approvals-expiry.queue';

// ============================================
// Approvals Reconcile Queue
// ============================================

export {
  getApprovalsReconcileQueue,
  scheduleApprovalsReconcileCheck,
  enqueueApprovalsReconcileNow,
  removeApprovalsReconcileSchedule,
  closeApprovalsReconcileQueue,
} from './queues/approvals-reconcile.queue';

export type {
  ApprovalsReconcileJobData,
  ApprovalsReconcileJobResult,
} from './queues/approvals-reconcile.queue';

// ============================================
// Retention Cron Queue (DSGVO + GoBD)
// ============================================

export {
  getRetentionCronQueue,
  scheduleRetentionCron,
  enqueueRetentionSweepNow,
  removeRetentionCronSchedule,
  closeRetentionCronQueue,
} from './queues/retention-cron.queue';

export type {
  RetentionCronJobData,
  RetentionCronJobResult,
} from './queues/retention-cron.queue';

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
  const { closeApprovalsExpiryQueue } = await import('./queues/approvals-expiry.queue');
  const { closeApprovalsReconcileQueue } = await import('./queues/approvals-reconcile.queue');
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
    closeApprovalsExpiryQueue(),
    closeApprovalsReconcileQueue(),
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
  /**
   * F23: Gesamturteil. Vorher gab es keins — der Aufrufer musste selbst
   * interpretieren, und der Fall "Queue waechst, kein Consumer" fiel durch.
   */
  healthy: boolean;
  /** Queues mit wartenden Jobs, aber ohne verbundenen Worker. */
  stalledQueues: string[];
  queues: Record<
    string,
    {
      connected: boolean;
      jobCounts?: object;
      /** Verbundene Worker. 0 heisst: niemand holt die Jobs ab. */
      consumers?: number;
    }
  >;
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

  const queueStatus: Record<
    string,
    { connected: boolean; jobCounts?: object; consumers?: number }
  > = {};
  const stalledQueues: string[] = [];

  const checkQueue = async (name: string, getQueue: () => unknown) => {
    try {
      const queue = getQueue() as {
        getJobCounts: () => Promise<Record<string, number>>;
        getWorkersCount: () => Promise<number>;
      };
      const jobCounts = await queue.getJobCounts();

      // F23: Bisher galt eine Queue als gesund, sobald getJobCounts()
      // antwortete — das sagt nur, dass Redis erreichbar ist, nicht dass
      // irgendjemand die Jobs abholt. getWorkersCount() fragt die tatsaechlich
      // verbundenen Consumer ab (BullMQ ueber Redis CLIENT LIST).
      const consumers = await queue.getWorkersCount();

      queueStatus[name] = { connected: true, jobCounts, consumers };

      const waiting = (jobCounts.waiting ?? 0) + (jobCounts.delayed ?? 0);
      if (consumers === 0 && waiting > 0) {
        stalledQueues.push(name);
      }
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

  // Prometheus-Gauges beim Health-Check mitziehen: so sind sie in /api/metrics
  // ohne eigenen Scrape-Pfad aktuell. Fehler hier duerfen den Health-Check
  // nicht kippen — Metriken sind Beobachtung, nicht Funktion.
  try {
    const { queueJobsActive, queueJobsWaiting, queueJobsFailed, queueConsumers } =
      await import("@/lib/metrics/prometheus");

    for (const [name, status] of Object.entries(queueStatus)) {
      if (!status.connected) continue;
      const counts = (status.jobCounts ?? {}) as Record<string, number>;
      queueJobsActive.set({ queue: name }, counts.active ?? 0);
      queueJobsWaiting.set({ queue: name }, counts.waiting ?? 0);
      queueJobsFailed.set({ queue: name }, counts.failed ?? 0);
      queueConsumers.set({ queue: name }, status.consumers ?? 0);
    }
  } catch {
    // Metriken sind optional.
  }

  return {
    redis: redisHealthy,
    // Eine Queue mit wartenden Jobs und ohne Consumer ist der Zustand, den F1
    // erzeugt — der muss als "nicht gesund" herauskommen.
    healthy: redisHealthy && stalledQueues.length === 0,
    stalledQueues,
    queues: queueStatus,
  };
};
