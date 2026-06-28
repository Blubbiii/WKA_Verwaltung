/**
 * Idee E — Daily-Digest Worker.
 *
 * Iteriert User mit `dailyDigestEnabled=true` und sendet pro User eine
 * E-Mail mit den 5 wichtigsten Vorgängen seit `dailyDigestLastSentAt`.
 *
 * SECURE-BY-DEFAULT: Dry-Run wenn `DIGEST_DRY_RUN !== "false"`.
 * Operator muss explizit `DIGEST_DRY_RUN=false` setzen damit echte Mails
 * gesendet werden. Pattern angelehnt an retention-cron.worker.ts.
 *
 * Idempotenz: `dailyDigestLastSentAt > startOfToday` → skip (verhindert
 * Doppel-Sends bei manuellem Trigger oder Cron-Replay).
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { jobLogger } from "@/lib/logger";
import type {
  DailyDigestJobData,
  DailyDigestJobResult,
} from "../queues/daily-digest.queue";
import { DAILY_DIGEST_QUEUE_NAME } from "../queues/daily-digest.queue";

const logger = jobLogger.child({ component: "daily-digest-worker" });

let dailyDigestWorker: Worker<
  DailyDigestJobData,
  DailyDigestJobResult
> | null = null;

const BATCH_SIZE = 10;

function isDryRun(forceDryRun?: boolean): boolean {
  if (forceDryRun !== undefined) return forceDryRun;
  return process.env.DIGEST_DRY_RUN !== "false";
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DigestPayload {
  newInvoices: number;
  newIncomingInvoices: number;
  pendingApprovals: number;
  recentActivities: Array<{ action: string; createdAt: Date }>;
}

async function loadDigestForUser(
  prisma: typeof import("@/lib/prisma").prisma,
  tenantId: string,
  since: Date,
): Promise<DigestPayload> {
  const [newInvoices, newIncomingInvoices, pendingApprovals, recentActivities] =
    await Promise.all([
      prisma.invoice.count({
        where: { tenantId, createdAt: { gte: since } },
      }),
      prisma.incomingInvoice.count({
        where: { tenantId, createdAt: { gte: since } },
      }),
      prisma.approvalRequest.count({
        where: { tenantId, status: "PENDING", expiresAt: { gt: new Date() } },
      }),
      prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { action: true, createdAt: true },
      }),
    ]);
  return {
    newInvoices,
    newIncomingInvoices,
    pendingApprovals,
    recentActivities,
  };
}

function renderDigestHtml(
  firstName: string | null,
  data: DigestPayload,
  baseUrl: string,
): string {
  const greeting = firstName ? `Hallo ${firstName},` : "Hallo,";
  const items: string[] = [];
  if (data.newInvoices > 0) {
    items.push(`<li><strong>${data.newInvoices}</strong> neue Rechnung${data.newInvoices === 1 ? "" : "en"}</li>`);
  }
  if (data.newIncomingInvoices > 0) {
    items.push(
      `<li><strong>${data.newIncomingInvoices}</strong> neue Eingangsbeleg${data.newIncomingInvoices === 1 ? "" : "e"}</li>`,
    );
  }
  if (data.pendingApprovals > 0) {
    items.push(
      `<li><strong>${data.pendingApprovals}</strong> Genehmigung${data.pendingApprovals === 1 ? "" : "en"} wartet${data.pendingApprovals === 1 ? "" : "n"} auf dich</li>`,
    );
  }

  const activitiesHtml =
    data.recentActivities.length > 0
      ? `<h3 style="margin-top: 20px; font-size: 14px;">Letzte Vorgänge</h3>
         <ul style="font-size: 13px;">
           ${data.recentActivities
             .map(
               (a) =>
                 `<li>${a.action} — ${new Date(a.createdAt).toLocaleString("de-DE")}</li>`,
             )
             .join("")}
         </ul>`
      : "";

  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="font-weight: 600;">${greeting}</h2>
  <p>Übersicht der wichtigsten Vorgänge seit gestern:</p>
  ${items.length > 0 ? `<ul style="font-size: 14px; line-height: 1.6;">${items.join("")}</ul>` : "<p><em>Es gab keine relevanten Vorgänge.</em></p>"}
  ${activitiesHtml}
  <p style="margin-top: 24px;">
    <a href="${baseUrl}/dashboard" style="background: #335E99; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Zum Dashboard</a>
  </p>
  <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 11px; color: #6b7280;">
    Diese E-Mail bekommst du, weil du die tägliche Übersicht aktiviert hast.
    <a href="${baseUrl}/settings" style="color: #335E99;">Deaktivieren</a>
  </p>
</body></html>`;
}

async function processDailyDigestJob(
  job: Job<DailyDigestJobData, DailyDigestJobResult>,
): Promise<DailyDigestJobResult> {
  const jobId = job.id || `daily-digest-${Date.now()}`;
  const startedAt = new Date();
  const dryRun = isDryRun(job.data.forceDryRun);
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  logger.info(
    { jobId, dryRun, userScope: job.data.userId ?? "all" },
    `[DailyDigestWorker] Starting (${dryRun ? "DRY-RUN" : "LIVE"})`,
  );

  const { prisma } = await import("@/lib/prisma");
  const { getProvider } = await import("@/lib/email/provider");
  const provider = getProvider();
  if (!provider && !dryRun) {
    logger.warn({ jobId }, "[DailyDigestWorker] No email provider configured — skipping LIVE send");
    return {
      dryRun: true,
      processedUsers: 0,
      sentMails: 0,
      skippedAlreadySentToday: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  const today = startOfToday();
  const users = await prisma.user.findMany({
    where: {
      dailyDigestEnabled: true,
      status: "ACTIVE",
      ...(job.data.userId ? { id: job.data.userId } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      tenantId: true,
      dailyDigestLastSentAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (user) => {
        // Idempotenz-Check
        if (
          user.dailyDigestLastSentAt &&
          user.dailyDigestLastSentAt >= today
        ) {
          skipped++;
          return;
        }
        const since = user.dailyDigestLastSentAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
        const data = await loadDigestForUser(prisma, user.tenantId, since);

        if (dryRun) {
          logger.info(
            { jobId, userId: user.id, would: data },
            "[DailyDigestWorker] DRY-RUN would send",
          );
          return;
        }

        const html = renderDigestHtml(user.firstName, data, baseUrl);
        try {
          await provider!.send({
            to: user.email,
            subject: "WPM — deine Übersicht für heute",
            html,
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { dailyDigestLastSentAt: new Date() },
          });
          sent++;
        } catch (err) {
          logger.warn(
            { jobId, userId: user.id, err: err instanceof Error ? err.message : String(err) },
            "[DailyDigestWorker] send failed",
          );
        }
      }),
    );
  }

  const finishedAt = new Date();
  const result: DailyDigestJobResult = {
    dryRun,
    processedUsers: users.length,
    sentMails: sent,
    skippedAlreadySentToday: skipped,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
  logger.info({ jobId, ...result }, "[DailyDigestWorker] complete");
  return result;
}

export function startDailyDigestWorker(): Worker<
  DailyDigestJobData,
  DailyDigestJobResult
> {
  if (dailyDigestWorker) return dailyDigestWorker;

  dailyDigestWorker = new Worker<DailyDigestJobData, DailyDigestJobResult>(
    DAILY_DIGEST_QUEUE_NAME,
    processDailyDigestJob,
    {
      connection: getRedisConnection(),
      concurrency: 1,
      useWorkerThreads: false,
    },
  );
  dailyDigestWorker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, err: error.message },
      "[DailyDigestWorker] Job failed",
    );
  });
  logger.info("[DailyDigestWorker] Started");
  return dailyDigestWorker;
}

export async function stopDailyDigestWorker(): Promise<void> {
  if (!dailyDigestWorker) return;
  await dailyDigestWorker.close();
  dailyDigestWorker = null;
}

export type { DailyDigestJobData, DailyDigestJobResult };
