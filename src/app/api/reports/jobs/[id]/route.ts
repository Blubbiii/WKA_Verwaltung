/**
 * GET /api/reports/jobs/[id]
 *
 * P-4 Sprint 2: Status-Endpoint für asynchron generierte Reports.
 * Liefert: queued | active | completed | failed mit Result-Daten.
 * Bei completed: storageKey für Download.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { getPdfQueue } from "@/lib/queue/queues/pdf.queue";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const queue = getPdfQueue();
    const job = await queue.getJob(id);

    if (!job) {
      return apiError("NOT_FOUND", 404, { message: "Job nicht gefunden" });
    }

    // Tenant-Isolation: Job-Data tenantId muss matchen.
    const jobData = job.data as { tenantId?: string };
    if (jobData.tenantId && jobData.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Job gehört zu anderem Mandanten" });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return NextResponse.json({
      jobId: job.id,
      state, // "completed" | "failed" | "active" | "delayed" | "waiting" | "waiting-children" | "unknown"
      progress,
      attemptsMade: job.attemptsMade,
      result: result ?? null,
      // Job-Status-Property, kein API-Error
      // eslint-disable-next-line no-restricted-syntax
      error: failedReason ?? null,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn ?? null,
    });
  } catch (error) {
    logger.error({ err: error }, "Job-Status-Abfrage fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Job-Status-Abfrage fehlgeschlagen",
    });
  }
}
