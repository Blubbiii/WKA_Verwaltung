/**
 * SCADA Auto-Import Queue - BullMQ Queue for Automated SCADA Data Import
 *
 * Handles scheduled and on-demand SCADA data import for all tenants
 * with auto-import-enabled ScadaTurbineMappings.
 *
 * Default schedule: Daily at 02:00 (configurable per tenant).
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from '@/lib/logger';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/**
 * Supported job types for the SCADA auto-import queue
 */
export type ScadaAutoImportJobType =
  | 'auto-import-all'      // Process all tenants with enabled auto-import
  | 'auto-import-tenant'   // Process a specific tenant
  | 'auto-import-location'; // Process a specific location of a tenant

/**
 * SCADA auto-import job data
 */
export interface ScadaAutoImportJobData {
  /** Job type identifier */
  type: ScadaAutoImportJobType;
  /** Tenant ID (required for tenant/location jobs, optional for all) */
  tenantId?: string;
  /** Location code (only for auto-import-location type) */
  locationCode?: string;
  /** Whether this was triggered manually via API (vs. scheduled) */
  manual?: boolean;
  /** Timestamp when the job was enqueued */
  enqueuedAt: string;
}

/**
 * SCADA auto-import job result
 */
export interface ScadaAutoImportJobResult {
  tenantsProcessed: number;
  locationsChecked: number;
  filesImported: number;
  errors: number;
  duration: number; // milliseconds
}

// ---------------------------------------------------------------
// Queue Configuration
// ---------------------------------------------------------------

export const SCADA_AUTO_IMPORT_QUEUE_NAME = 'scada-auto-import';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60000, // Start with 60s (SCADA import can be slow)
  },
  removeOnComplete: {
    count: 50, // Keep last 50 completed jobs
  },
  removeOnFail: {
    count: 200, // Keep last 200 failed jobs for debugging
  },
};

// Singleton queue instance
let scadaAutoImportQueue: Queue<ScadaAutoImportJobData, ScadaAutoImportJobResult> | null = null;

// ---------------------------------------------------------------
// Queue Instance
// ---------------------------------------------------------------

/**
 * Get or create the SCADA auto-import queue instance
 */
export const getScadaAutoImportQueue = (): Queue<ScadaAutoImportJobData, ScadaAutoImportJobResult> => {
  if (!scadaAutoImportQueue) {
    scadaAutoImportQueue = new Queue<ScadaAutoImportJobData, ScadaAutoImportJobResult>(
      SCADA_AUTO_IMPORT_QUEUE_NAME,
      {
        ...getBullMQConnection(),
        defaultJobOptions,
      },
    );

    logger.info(`[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] Initialized`);
  }

  return scadaAutoImportQueue;
};

// ---------------------------------------------------------------
// Enqueue Functions
// ---------------------------------------------------------------

/**
 * Enqueue an auto-import job for all tenants.
 * This is the main entry point for the scheduled cron job.
 */
export const enqueueScadaAutoImportAll = async (
  options?: Partial<JobsOptions>,
) => {
  const queue = getScadaAutoImportQueue();

  const jobData: ScadaAutoImportJobData = {
    type: 'auto-import-all',
    enqueuedAt: new Date().toISOString(),
  };

  const job = await queue.add('scada-auto-import-all', jobData, {
    ...options,
    jobId: `scada-auto-import-all-${new Date().toISOString().slice(0, 13)}`,
  });

  logger.info(
    `[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] All-tenants job ${job.id} added`,
  );

  return job;
};

/**
 * Enqueue an auto-import job for a specific tenant.
 * Used by the "run now" API endpoint.
 */
export const enqueueScadaAutoImportForTenant = async (
  tenantId: string,
  manual: boolean = false,
  options?: Partial<JobsOptions>,
) => {
  const queue = getScadaAutoImportQueue();

  const jobData: ScadaAutoImportJobData = {
    type: 'auto-import-tenant',
    tenantId,
    manual,
    enqueuedAt: new Date().toISOString(),
  };

  const job = await queue.add('scada-auto-import-tenant', jobData, {
    ...options,
    jobId: `scada-auto-import-${tenantId}-${Date.now()}`,
  });

  logger.info(
    `[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] Tenant job ${job.id} added for ${tenantId}`,
  );

  return job;
};

// ---------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------

/**
 * Schedule the daily SCADA auto-import cron job.
 *
 * @param hour - Hour of day to run (0-23, default: 2 = 02:00)
 * @param minute - Minute of hour (default: 0)
 */
export const scheduleScadaAutoImport = async (
  hour: number = 2,
  minute: number = 0,
) => {
  const queue = getScadaAutoImportQueue();

  const jobData: ScadaAutoImportJobData = {
    type: 'auto-import-all',
    enqueuedAt: new Date().toISOString(),
  };

  // Cron: minute hour day month weekday
  const cronExpression = `${minute} ${hour} * * *`;

  const job = await queue.add('scada-auto-import-scheduled', jobData, {
    repeat: {
      pattern: cronExpression,
    },
    jobId: 'scada-auto-import-daily',
  });

  logger.info(
    `[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] Daily job scheduled at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  );

  return job;
};

/**
 * Remove the scheduled daily SCADA auto-import cron job.
 */
export const removeScadaAutoImportSchedule = async (): Promise<boolean> => {
  const queue = getScadaAutoImportQueue();

  try {
    const removed = await queue.removeRepeatableByKey(
      'scada-auto-import-scheduled:scada-auto-import-daily:::*',
    );
    if (removed) {
      logger.info(
        `[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] Daily scheduled job removed`,
      );
    }
    return removed;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------
// Close
// ---------------------------------------------------------------

/**
 * Close the SCADA auto-import queue connection
 */
export const closeScadaAutoImportQueue = async (): Promise<void> => {
  if (scadaAutoImportQueue) {
    await scadaAutoImportQueue.close();
    scadaAutoImportQueue = null;
    logger.info(`[Queue:${SCADA_AUTO_IMPORT_QUEUE_NAME}] Closed`);
  }
};
