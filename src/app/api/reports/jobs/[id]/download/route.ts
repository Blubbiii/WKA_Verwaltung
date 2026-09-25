/**
 * GET /api/reports/jobs/[id]/download
 *
 * Delivers the PDF of a finished background report. The worker only stores it
 * (storageKey in the job result); signed storage URLs point at the internal
 * MinIO host and are not reachable from the browser, so the file goes through
 * the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { getPdfQueue } from "@/lib/queue/queues/pdf.queue";
import { getFileBuffer } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const job = await getPdfQueue().getJob(id);
    if (!job) return apiError("NOT_FOUND", 404, { message: "Job nicht gefunden" });

    // Fail closed: a job without tenant is not handed out as a file.
    const data = job.data as { tenantId?: string; type?: string; year?: number };
    if (!data.tenantId || data.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Job gehört zu anderem Mandanten" });
    }

    const result = job.returnvalue as { storageKey?: string } | null;
    if (!result?.storageKey) {
      return apiError("CONFLICT", 409, { message: "Der Bericht ist noch nicht fertig" });
    }

    const pdf = await getFileBuffer(result.storageKey);
    const filename =
      data.type === "annual-report" && data.year ? `Jahresbericht_${data.year}.pdf` : `Bericht_${id}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Bericht-Download fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Bericht konnte nicht geladen werden" });
  }
}
