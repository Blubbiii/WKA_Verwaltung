/**
 * Retention Cron Worker — DSGVO Art. 5(1)(e) + §147 AO Retention-Sweep.
 *
 * Pro Tenant:
 *  - Settings laden (gobdRetentionYearsInvoice, gobdRetentionYearsContract)
 *  - Invoices mit status=CANCELLED älter als X Jahre → MVP: nur Logging
 *    (Soft-Delete-Markierung ist Follow-up, da Schema-Feld fehlt)
 *  - AuditLog älter als 10 Jahre → DELETE (nur wenn !DryRun)
 *    HINWEIS: braucht DB-User `wpm_retention` ODER manuelles Trigger-Disable
 *    (siehe docs/audit-log-append-only.md). Im Dry-Run nur SELECT COUNT(*).
 *
 * Dry-Run-Modus: Default TRUE. Echte Mutationen nur bei RETENTION_DRY_RUN=false.
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type {
  RetentionCronJobData,
  RetentionCronJobResult,
} from "../queues/retention-cron.queue";
import { RETENTION_CRON_QUEUE_NAME } from "../queues/retention-cron.queue";

const logger = jobLogger.child({ component: "retention-cron-worker" });

let retentionCronWorker: Worker<
  RetentionCronJobData,
  RetentionCronJobResult
> | null = null;

/** AuditLog-Retention: gesetzlich 10 Jahre (§147 AO). */
const AUDIT_LOG_RETENTION_YEARS = 10;

function isDryRun(forceDryRun?: boolean): boolean {
  if (forceDryRun !== undefined) return forceDryRun;
  // SECURE-BY-DEFAULT: Alles außer explizit "false" gilt als Dry-Run.
  return process.env.RETENTION_DRY_RUN !== "false";
}

async function processRetentionCronJob(
  job: Job<RetentionCronJobData, RetentionCronJobResult>,
): Promise<RetentionCronJobResult> {
  const jobId = job.id || `retention-cron-${Date.now()}`;
  const startedAt = new Date();
  const dryRun = isDryRun(job.data.forceDryRun);

  logger.info(
    {
      jobId,
      dryRun,
      tenantScope: job.data.tenantId ?? "all",
      env: { RETENTION_DRY_RUN: process.env.RETENTION_DRY_RUN ?? "(unset)" },
    },
    `[RetentionCronWorker] Starting sweep (${dryRun ? "DRY-RUN" : "LIVE"})`,
  );

  const { prisma } = await import("@/lib/prisma");
  const { getTenantSettings } = await import("@/lib/tenant-settings");

  // Pro Tenant iterieren
  const tenants = job.data.tenantId
    ? await prisma.tenant.findMany({
        where: { id: job.data.tenantId },
        select: { id: true, name: true },
      })
    : await prisma.tenant.findMany({ select: { id: true, name: true } });

  let invoicesAffectedTotal = 0;
  let auditLogsAffectedTotal = 0;

  for (const tenant of tenants) {
    try {
      const settings = await getTenantSettings(tenant.id);

      // 1. Invoices: CANCELLED älter als X Jahre
      const invoiceCutoff = new Date();
      invoiceCutoff.setFullYear(
        invoiceCutoff.getFullYear() - settings.gobdRetentionYearsInvoice,
      );

      const cancelledCount = await prisma.invoice.count({
        where: {
          tenantId: tenant.id,
          status: "CANCELLED",
          createdAt: { lt: invoiceCutoff },
        },
      });

      if (cancelledCount > 0) {
        logger.info(
          {
            jobId,
            tenantId: tenant.id,
            tenantName: tenant.name,
            cancelledCount,
            cutoff: invoiceCutoff.toISOString(),
            retentionYears: settings.gobdRetentionYearsInvoice,
            action: dryRun ? "would-archive (DRY-RUN)" : "TODO-archive-flag",
          },
          `[RetentionCronWorker] Cancelled invoices candidate for archival`,
        );
        // TODO: Echtes Soft-Delete benötigt Schema-Feld `archivedAt` oder
        // `retentionStatus`. MVP: nur Logging.
        invoicesAffectedTotal += cancelledCount;
      }

      // 2. AuditLog älter als 10 Jahre
      const auditCutoff = new Date();
      auditCutoff.setFullYear(
        auditCutoff.getFullYear() - AUDIT_LOG_RETENTION_YEARS,
      );

      const auditCandidates = await prisma.auditLog.count({
        where: {
          tenantId: tenant.id,
          createdAt: { lt: auditCutoff },
        },
      });

      if (auditCandidates > 0) {
        if (dryRun) {
          logger.info(
            {
              jobId,
              tenantId: tenant.id,
              tenantName: tenant.name,
              auditCandidates,
              cutoff: auditCutoff.toISOString(),
              action: "would-delete (DRY-RUN)",
            },
            `[RetentionCronWorker] AuditLog records eligible for deletion`,
          );
        } else {
          // LIVE-Modus: Versuche DELETE.
          // Append-Only-Trigger blockiert DELETE → wirft Exception
          // ("audit_logs ist append-only").
          // Operator muss vorher Trigger temporär deaktivieren ODER
          // separaten DB-User mit BYPASSRLS-Rolle benutzen.
          try {
            const result = await prisma.auditLog.deleteMany({
              where: {
                tenantId: tenant.id,
                createdAt: { lt: auditCutoff },
              },
            });
            logger.info(
              {
                jobId,
                tenantId: tenant.id,
                deletedCount: result.count,
                cutoff: auditCutoff.toISOString(),
              },
              `[RetentionCronWorker] AuditLog records DELETED`,
            );
            auditLogsAffectedTotal += result.count;
          } catch (err) {
            logger.warn(
              {
                jobId,
                tenantId: tenant.id,
                err: err instanceof Error ? err.message : String(err),
              },
              `[RetentionCronWorker] AuditLog delete blocked — append-only trigger. Manual maintenance required.`,
            );
          }
        }
      }
    } catch (err) {
      logger.error(
        {
          jobId,
          tenantId: tenant.id,
          err: err instanceof Error ? err.message : String(err),
        },
        `[RetentionCronWorker] Tenant sweep failed`,
      );
    }
  }

  const finishedAt = new Date();
  const result: RetentionCronJobResult = {
    dryRun,
    processedTenants: tenants.length,
    invoicesAffected: invoicesAffectedTotal,
    auditLogsAffected: auditLogsAffectedTotal,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };

  logger.info(
    { jobId, ...result },
    `[RetentionCronWorker] Sweep complete (${dryRun ? "DRY-RUN" : "LIVE"})`,
  );

  return result;
}

export function startRetentionCronWorker(): Worker<
  RetentionCronJobData,
  RetentionCronJobResult
> {
  if (retentionCronWorker) {
    logger.info("[RetentionCronWorker] Already running");
    return retentionCronWorker;
  }

  retentionCronWorker = new Worker<
    RetentionCronJobData,
    RetentionCronJobResult
  >(RETENTION_CRON_QUEUE_NAME, processRetentionCronJob, {
    connection: getRedisConnection(),
    concurrency: 1,
    useWorkerThreads: false,
  });

  retentionCronWorker.on("completed", (job, result) => {
    logger.info(
      {
        jobId: job.id,
        dryRun: result.dryRun,
        tenants: result.processedTenants,
      },
      "[RetentionCronWorker] Job completed",
    );
  });

  retentionCronWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      "[RetentionCronWorker] Job failed",
    );
  });

  retentionCronWorker.on("error", (error) => {
    logger.error(
      { err: error.message },
      "[RetentionCronWorker] Worker error",
    );
  });

  logger.info("[RetentionCronWorker] Started");
  return retentionCronWorker;
}

export async function stopRetentionCronWorker(): Promise<void> {
  if (!retentionCronWorker) return;
  await retentionCronWorker.close();
  retentionCronWorker = null;
  logger.info("[RetentionCronWorker] Stopped");
}

export function isRetentionCronWorkerRunning(): boolean {
  return retentionCronWorker !== null && !retentionCronWorker.closing;
}

export function getRetentionCronWorker(): Worker<
  RetentionCronJobData,
  RetentionCronJobResult
> | null {
  return retentionCronWorker;
}

export type { RetentionCronJobData, RetentionCronJobResult };
