/**
 * Reminder Worker - Verarbeitet Jobs aus der "reminder" Queue
 *
 * Dieser Worker ist verantwortlich für automatische Erinnerungen:
 * - Überfällige Rechnungen (SENT status, dueDate < today)
 * - Auslaufende Verträge (endDate innerhalb 30/14/7 Tagen)
 * - Offene Abrechnungsperioden (offen seit >30 Tagen)
 * - Ablaufende Dokumente (wenn expiryDate vorhanden)
 *
 * Verwendet:
 *   - src/lib/reminders/reminder-service.ts (checkAndSendReminders)
 *   - src/lib/queue/queues/email.queue.ts (für E-Mail-Versand)
 *   - Prisma models: Invoice, Contract, LeaseSettlementPeriod, ReminderLog
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type {
  ReminderJobData,
  ReminderJobResult,
} from "../queues/reminder.queue";

// =============================================================================
// Logger
// =============================================================================

const logger = jobLogger.child({ component: "reminder-worker" });

function log(
  level: "info" | "warn" | "error",
  jobId: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const logData = { jobId, ...meta };
  if (level === "error") {
    logger.error(logData, message);
  } else if (level === "warn") {
    logger.warn(logData, message);
  } else {
    logger.info(logData, message);
  }
}

// =============================================================================
// Job Processor
// =============================================================================

/**
 * Process a reminder check job.
 * If tenantId is "all", iterates over all active tenants.
 */
async function processReminderJob(
  job: Job<ReminderJobData, ReminderJobResult>
): Promise<ReminderJobResult> {
  const { data } = job;
  const jobId = job.id || `reminder-${Date.now()}`;

  log("info", jobId, "Processing reminder job", {
    tenantId: data.tenantId,
    attempt: job.attemptsMade + 1,
  });

  const { checkAndSendReminders } = await import(
    "@/lib/reminders/reminder-service"
  );
  const { prisma } = await import("@/lib/prisma");

  const result: ReminderJobResult = {
    tenantsProcessed: 0,
    totalItems: 0,
    totalEmailsSent: 0,
    totalSkipped: 0,
    errors: [],
  };

  try {
    let tenantIds: string[];

    if (data.tenantId === "all") {
      // Get all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
      });
      tenantIds = tenants.map(
        (t: { id: string; name: string }) => t.id
      );
      log("info", jobId, `Found ${tenantIds.length} active tenants`);
    } else {
      tenantIds = [data.tenantId];
    }

    // Process each tenant
    for (let i = 0; i < tenantIds.length; i++) {
      const tenantId = tenantIds[i];

      try {
        const tenantResult = await checkAndSendReminders(tenantId);

        result.tenantsProcessed++;
        result.totalItems += tenantResult.items.length;
        result.totalEmailsSent += tenantResult.emailsSent;
        result.totalSkipped += tenantResult.skipped;
        result.errors.push(...tenantResult.errors);

        log("info", jobId, `Tenant ${tenantId} processed`, {
          items: tenantResult.items.length,
          emailsSent: tenantResult.emailsSent,
          skipped: tenantResult.skipped,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Tenant ${tenantId}: ${msg}`);
        log("error", jobId, `Error processing tenant ${tenantId}`, {
          error: msg,
        });
      }

      // Report progress
      const progress = Math.round(((i + 1) / tenantIds.length) * 100);
      await job.updateProgress(progress);
    }

    log("info", jobId, "Reminder job completed", {
      tenantsProcessed: result.tenantsProcessed,
      totalItems: result.totalItems,
      totalEmailsSent: result.totalEmailsSent,
      totalSkipped: result.totalSkipped,
      errorCount: result.errors.length,
    });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("error", jobId, "Reminder job failed", {
      error: msg,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 2,
    });
    throw error;
  }
}

// =============================================================================
// Worker Instance
// =============================================================================

let reminderWorker: Worker<ReminderJobData, ReminderJobResult> | null =
  null;

/**
 * Start the reminder worker
 */
export function startReminderWorker(): Worker<
  ReminderJobData,
  ReminderJobResult
> {
  if (reminderWorker) {
    logger.info("Reminder worker already running");
    return reminderWorker;
  }

  const connection = getRedisConnection();

  reminderWorker = new Worker<ReminderJobData, ReminderJobResult>(
    "reminder",
    processReminderJob,
    {
      connection,
      concurrency: 2, // Low concurrency - daily job, no rush
      useWorkerThreads: false,
      lockDuration: 300000, // 5 minutes - can take a while for many tenants
    }
  );

  // Event handlers
  reminderWorker.on("completed", (job, result) => {
    const jobId = job.id || "unknown";
    log("info", jobId, "Job completed", {
      tenantsProcessed: result.tenantsProcessed,
      totalItems: result.totalItems,
      totalEmailsSent: result.totalEmailsSent,
    });
  });

  reminderWorker.on("failed", (job, error) => {
    const jobId = job?.id || "unknown";
    log("error", jobId, "Job failed permanently", {
      tenantId: job?.data?.tenantId,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  reminderWorker.on("error", (error) => {
    logger.error({ err: error }, "Reminder worker error");
  });

  reminderWorker.on("stalled", (jobId) => {
    log("warn", jobId, "Job stalled - will be retried");
  });

  logger.info({ concurrency: 2 }, "Reminder worker started");

  return reminderWorker;
}

/**
 * Stop the reminder worker gracefully
 */
export async function stopReminderWorker(): Promise<void> {
  if (!reminderWorker) {
    logger.info("No reminder worker running");
    return;
  }

  logger.info("Stopping reminder worker...");

  try {
    await reminderWorker.close();
    reminderWorker = null;
    logger.info("Reminder worker stopped gracefully");
  } catch (error) {
    logger.error({ err: error }, "Error stopping reminder worker");
    throw error;
  }
}

/**
 * Check if the worker is running
 */
export function isReminderWorkerRunning(): boolean {
  return reminderWorker !== null && reminderWorker.isRunning();
}

/**
 * Get the worker instance (for health checks)
 */
export function getReminderWorker(): Worker<
  ReminderJobData,
  ReminderJobResult
> | null {
  return reminderWorker;
}
