/**
 * Billing Queue - BullMQ Queue for Automated Billing
 *
 * Handles asynchronous processing of automated billing rules,
 * invoice generation, and recurring payment schedules.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";

/**
 * Billing job data structure
 */
export interface BillingJobData {
  /** ID of the billing rule to execute */
  ruleId: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Optional: Specific billing period start date (ISO string) */
  periodStart?: string;
  /** Optional: Specific billing period end date (ISO string) */
  periodEnd?: string;
  /** Optional: Force execution even if already processed */
  force?: boolean;
  /** Optional: Dry run mode - calculate but don't create invoices */
  dryRun?: boolean;
  /** Optional: User who triggered the billing (for manual triggers) */
  triggeredBy?: string;
}

/**
 * Billing job result structure (returned by worker)
 */
export interface BillingJobResult {
  /** Number of invoices created */
  invoicesCreated: number;
  /** Total amount billed */
  totalAmount: number;
  /** List of created invoice IDs */
  invoiceIds: string[];
  /** Any errors encountered (partial success possible) */
  errors?: Array<{
    entityId: string;
    message: string;
  }>;
}

/**
 * Queue name constant
 */
export const BILLING_QUEUE_NAME = 'billing';

/**
 * Default job options for billing queue
 * Billing is critical, so we use more conservative settings
 */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 10000, // Start with 10s, then 20s, 40s
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
};

// Singleton queue instance
let billingQueue: Queue<BillingJobData, BillingJobResult> | null = null;

/**
 * Get or create the billing queue instance
 */
export const getBillingQueue = (): Queue<BillingJobData, BillingJobResult> => {
  if (!billingQueue) {
    billingQueue = new Queue<BillingJobData, BillingJobResult>(BILLING_QUEUE_NAME, {
      ...getBullMQConnection(),
      defaultJobOptions,
    });

    logger.info(`[Queue:${BILLING_QUEUE_NAME}] Initialized`);
  }

  return billingQueue;
};

/**
 * Enqueue a billing job for processing
 *
 * @param jobData - Billing job data
 * @param options - Optional job-specific options to override defaults
 * @returns The created job
 *
 * @example
 * ```typescript
 * await enqueueBillingJob({
 *   ruleId: 'rule-123',
 *   tenantId: 'tenant-456',
 *   periodStart: '2024-01-01',
 *   periodEnd: '2024-01-31',
 * });
 * ```
 */
export const enqueueBillingJob = async (
  jobData: BillingJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getBillingQueue();

  // Generate unique job ID to prevent duplicate processing
  // Include period info to allow same rule to run for different periods
  const periodKey = jobData.periodStart && jobData.periodEnd
    ? `-${jobData.periodStart}-${jobData.periodEnd}`
    : `-${new Date().toISOString().slice(0, 10)}`;

  const jobId = `billing-${jobData.ruleId}-${jobData.tenantId}${periodKey}`;

  const job = await queue.add('process-billing', jobData, {
    ...options,
    jobId,
  });

  logger.info(
    `[Queue:${BILLING_QUEUE_NAME}] Job ${job.id} added: rule ${jobData.ruleId} for tenant ${jobData.tenantId}`
  );

  return job;
};

/**
 * Schedule a recurring billing job using BullMQ's repeat feature
 *
 * @param ruleId - Billing rule ID
 * @param tenantId - Tenant ID
 * @param cronExpression - Cron expression for scheduling (e.g., "0 0 1 * *" for 1st of month)
 * @returns The created repeatable job
 *
 * @example
 * ```typescript
 * // Schedule billing to run on the 1st of every month at midnight
 * await scheduleRecurringBilling('rule-123', 'tenant-456', '0 0 1 * *');
 * ```
 */
export const scheduleRecurringBilling = async (
  ruleId: string,
  tenantId: string,
  cronExpression: string
) => {
  const queue = getBillingQueue();

  const jobData: BillingJobData = {
    ruleId,
    tenantId,
  };

  const job = await queue.add('process-billing', jobData, {
    repeat: {
      pattern: cronExpression,
    },
    jobId: `billing-recurring-${ruleId}-${tenantId}`,
  });

  logger.info(
    `[Queue:${BILLING_QUEUE_NAME}] Recurring job scheduled: rule ${ruleId} with cron "${cronExpression}"`
  );

  return job;
};

/**
 * Remove a scheduled recurring billing job
 */
export const removeRecurringBilling = async (
  ruleId: string,
  tenantId: string
): Promise<boolean> => {
  const queue = getBillingQueue();

  const removed = await queue.removeRepeatableByKey(
    `process-billing:${`billing-recurring-${ruleId}-${tenantId}`}:::${ruleId}`
  );

  if (removed) {
    logger.info(
      `[Queue:${BILLING_QUEUE_NAME}] Recurring job removed: rule ${ruleId}`
    );
  }

  return removed;
};

/**
 * Enqueue a dry-run billing job (calculate only, don't create invoices)
 * Useful for previewing billing before actual execution
 */
export const enqueueBillingDryRun = async (
  ruleId: string,
  tenantId: string,
  options?: {
    periodStart?: string;
    periodEnd?: string;
    triggeredBy?: string;
  }
) => {
  return enqueueBillingJob({
    ruleId,
    tenantId,
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    triggeredBy: options?.triggeredBy,
    dryRun: true,
  });
};

/**
 * Enqueue multiple billing jobs in bulk
 */
export const enqueueBillingBulk = async (
  jobs: Array<{ data: BillingJobData; options?: Partial<JobsOptions> }>
) => {
  const queue = getBillingQueue();

  const bulkJobs = jobs.map(({ data, options }) => {
    const periodKey = data.periodStart && data.periodEnd
      ? `-${data.periodStart}-${data.periodEnd}`
      : `-${new Date().toISOString().slice(0, 10)}`;

    return {
      name: 'process-billing',
      data,
      opts: {
        ...options,
        jobId: `billing-${data.ruleId}-${data.tenantId}${periodKey}`,
      },
    };
  });

  const addedJobs = await queue.addBulk(bulkJobs);

  logger.info(
    `[Queue:${BILLING_QUEUE_NAME}] ${addedJobs.length} bulk jobs added`
  );

  return addedJobs;
};

/**
 * Schedule recurring invoice processing
 *
 * This schedules a repeatable job that processes all due recurring invoices.
 * The actual processing is done by the recurring-invoice-service.
 *
 * @param cronExpression - Cron expression (default: every hour at minute 5)
 */
export const scheduleRecurringInvoiceProcessing = async (
  cronExpression: string = '0 5 * * * *' // Every hour at :05
) => {
  const queue = getBillingQueue();

  const jobData: BillingJobData = {
    ruleId: 'recurring-invoices',
    tenantId: '__all__', // Process for all tenants
  };

  const job = await queue.add('process-recurring-invoices', jobData, {
    repeat: {
      pattern: cronExpression,
    },
    jobId: 'recurring-invoices-global',
  });

  logger.info(
    `[Queue:${BILLING_QUEUE_NAME}] Recurring invoice processing scheduled with cron "${cronExpression}"`
  );

  return job;
};

/**
 * Close the billing queue connection
 */
export const closeBillingQueue = async (): Promise<void> => {
  if (billingQueue) {
    await billingQueue.close();
    billingQueue = null;
    logger.info(`[Queue:${BILLING_QUEUE_NAME}] Closed`);
  }
};
