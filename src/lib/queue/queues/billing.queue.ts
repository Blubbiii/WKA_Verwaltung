/**
 * Billing Queue - BullMQ Queue for Automated Billing
 *
 * Handles asynchronous processing of automated billing rules,
 * invoice generation, and recurring payment schedules.
 */

import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection } from '../connection';
import { jobLogger as logger } from "@/lib/logger";
import { getJobOptions } from "@/lib/config/queue-config";
import { CRON_TIMEZONE } from "@/lib/config/cron-schedules";

// =============================================================================
// Job contract — SINGLE SOURCE OF TRUTH
// =============================================================================
//
// F2: Bis Welle 4 gab es ZWEI verschiedene Typen namens `BillingJobData` —
// hier ein regelbasierter (`ruleId`/`periodStart`/…, ohne `type`) und in
// billing.worker.ts eine Discriminated Union MIT `type`. Die Producer nutzten
// den hiesigen, der Worker schaltete auf `data.type` → `undefined` → landete im
// default-Zweig und warf `Unknown billing job type: undefined`.
// TypeScript konnte das nicht sehen, weil es zwei gleichnamige Typen in
// verschiedenen Modulen waren und der Worker nie aus diesem Modul importierte.
//
// Auch `BillingJobResult` war unterschiedlich definiert.
//
// Der Vertrag liegt jetzt — wie bei report.queue.ts / report.worker.ts — im
// Queue-Modul; der Worker importiert ihn. Damit erzwingt tsc die Konsistenz
// zwischen Producer und Consumer.

/** Alle vom Billing-Worker implementierten Job-Typen. */
export type BillingJobType =
  | "execute-rule"
  | "generate-invoice"
  | "generate-settlement"
  | "send-reminder"
  | "calculate-fees"
  | "bulk-invoice"
  | "process-recurring-invoices";

/** Basis-Interface für alle Billing-Jobs */
export interface BaseBillingJobData {
  /** Eindeutige Job-ID für Tracking */
  jobId: string;
  /** Typ des Billing-Jobs (Discriminator) */
  type: BillingJobType;
  /** Tenant-ID für Multi-Tenancy */
  tenantId: string;
}

/**
 * Führt EINE Abrechnungsregel aus (lib/billing/executor.ts → executeRule).
 *
 * Genau das versprechen `enqueueBillingJob`, `enqueueBillingDryRun` und
 * `scheduleRecurringBilling` seit jeher — nur gab es dafür keinen Handler.
 */
export interface ExecuteRuleJobData extends BaseBillingJobData {
  type: "execute-rule";
  /** ID der auszuführenden BillingRule */
  ruleId: string;
  /** Nur Vorschau, keine echten Rechnungen */
  dryRun?: boolean;
  /** Ausführung erzwingen, auch wenn nextRunAt noch nicht erreicht ist */
  forceRun?: boolean;
  /** User, der den Lauf manuell angestoßen hat */
  triggeredBy?: string;
}

/** Job-Daten für Rechnungsgenerierung */
export interface GenerateInvoiceJobData extends BaseBillingJobData {
  type: "generate-invoice";
  /** Kunde oder Gesellschafter ID */
  customerId: string;
  /** Rechnungsposten */
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
  /** Fälligkeitsdatum (ISO-String) */
  dueDate?: string;
  /** Interne Referenz */
  reference?: string;
}

/** Job-Daten für Settlement-Generierung */
export interface GenerateSettlementJobData extends BaseBillingJobData {
  type: "generate-settlement";
  /** Park ID */
  parkId: string;
  /** Jahr der Abrechnung */
  year: number;
  /** Gesamteinnahmen */
  totalRevenue?: number;
}

/** Job-Daten für Zahlungserinnerungen */
export interface SendReminderJobData extends BaseBillingJobData {
  type: "send-reminder";
  /** Rechnungs-ID */
  invoiceId: string;
  /** Mahnstufe */
  reminderLevel: 1 | 2 | 3;
}

/** Job-Daten für Gebührenberechnung */
export interface CalculateFeesJobData extends BaseBillingJobData {
  type: "calculate-fees";
  /** Zeitraum Start (ISO-String) */
  periodStart: string;
  /** Zeitraum Ende (ISO-String) */
  periodEnd: string;
  /** Betroffene Entity-IDs */
  entityIds?: string[];
}

/** Job-Daten für Massenrechnungen */
export interface BulkInvoiceJobData extends BaseBillingJobData {
  type: "bulk-invoice";
  /** Park ID */
  parkId: string;
  /** Abrechnungsperiode */
  period: string;
  /** Filter für Gesellschafter */
  shareholderFilter?: {
    status?: string[];
    minimumShare?: number;
  };
}

/** Job-Daten für wiederkehrende Rechnungen */
export interface ProcessRecurringInvoicesJobData extends BaseBillingJobData {
  type: "process-recurring-invoices";
  /** Optional: Nur für bestimmten Tenant ausfuehren (default: alle) */
  targetTenantId?: string;
}

/** Union-Typ für alle Billing-Job-Daten */
export type BillingJobData =
  | ExecuteRuleJobData
  | GenerateInvoiceJobData
  | GenerateSettlementJobData
  | SendReminderJobData
  | CalculateFeesJobData
  | BulkInvoiceJobData
  | ProcessRecurringInvoicesJobData;

/**
 * Ergebnis nach Billing-Job
 */
export interface BillingJobResult {
  success: boolean;
  /** Generierte Rechnungs-IDs */
  invoiceIds?: string[];
  /** Generierte Settlement-IDs */
  settlementIds?: string[];
  /** Anzahl verarbeiteter Elemente */
  processedCount?: number;
  /** Fehler wenn fehlgeschlagen */
  error?: string;
  /** Details zur Verarbeitung */
  details?: Record<string, unknown>;
  /** Zeitpunkt der Verarbeitung */
  processedAt?: Date;
}

/**
 * Queue name constant
 */
export const BILLING_QUEUE_NAME = 'billing';

/**
 * Default job options for billing queue
 * Billing is critical, so we use more conservative settings
 */
const defaultJobOptions = getJobOptions("slow");

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
 *   type: 'execute-rule',
 *   jobId: 'billing-rule-123-2024-01',
 *   ruleId: 'rule-123',
 *   tenantId: 'tenant-456',
 * });
 * ```
 */
export const enqueueBillingJob = async (
  jobData: BillingJobData,
  options?: Partial<JobsOptions>
) => {
  const queue = getBillingQueue();

  const job = await queue.add('process-billing', jobData, {
    ...options,
    // jobId ist Teil des Job-Vertrags und dient der Deduplizierung.
    jobId: jobData.jobId,
  });

  logger.info(
    `[Queue:${BILLING_QUEUE_NAME}] Job ${job.id} added: ${jobData.type} for tenant ${jobData.tenantId}`
  );

  return job;
};

/**
 * Baut die deduplizierende Job-ID für einen Regel-Lauf.
 *
 * Der Periodenanteil erlaubt es, dieselbe Regel für unterschiedliche Perioden
 * laufen zu lassen, verhindert aber den doppelten Lauf derselben Periode.
 */
export const buildRuleJobId = (
  ruleId: string,
  tenantId: string,
  periodStart?: string,
  periodEnd?: string
): string => {
  const periodKey =
    periodStart && periodEnd
      ? `-${periodStart}-${periodEnd}`
      : `-${new Date().toISOString().slice(0, 10)}`;
  return `billing-${ruleId}-${tenantId}${periodKey}`;
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
    type: 'execute-rule',
    jobId: `billing-recurring-${ruleId}-${tenantId}`,
    ruleId,
    tenantId,
  };

  const job = await queue.add('process-billing', jobData, {
    repeat: {
      pattern: cronExpression,
      tz: CRON_TIMEZONE,
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
    type: 'execute-rule',
    jobId: `${buildRuleJobId(ruleId, tenantId, options?.periodStart, options?.periodEnd)}-dryrun`,
    ruleId,
    tenantId,
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

  const bulkJobs = jobs.map(({ data, options }) => ({
    name: 'process-billing',
    data,
    opts: {
      ...options,
      jobId: data.jobId,
    },
  }));

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
    type: 'process-recurring-invoices',
    jobId: 'recurring-invoices-global',
    tenantId: '__all__', // Process for all tenants
  };

  const job = await queue.add('process-recurring-invoices', jobData, {
    repeat: {
      pattern: cronExpression,
      tz: CRON_TIMEZONE,
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
