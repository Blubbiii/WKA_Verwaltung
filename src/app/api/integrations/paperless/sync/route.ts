/**
 * Paperless Sync API
 *
 * POST /api/integrations/paperless/sync
 * Manually enqueue a WPM document for Paperless archival.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { getPaperlessClient } from "@/lib/paperless";
import { enqueuePaperlessJob } from "@/lib/queue/queues/paperless.queue";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const paperlessSyncSchema = z.object({
  documentId: z.string().min(1, "documentId ist erforderlich"),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_UPDATE);
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return apiError("NOT_FOUND", 404, { message: "Paperless integration not enabled" });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return apiError("INTERNAL_ERROR", 503, { message: "Paperless not configured" });
    }

    const body = await request.json();
    const parsed = paperlessSyncSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { documentId } = parsed.data;

    // Verify document exists and belongs to this tenant
    const document = await prisma.document.findFirst({
      where: { id: documentId, tenantId: check.tenantId },
      select: { id: true, fileUrl: true, paperlessSyncStatus: true },
    });

    if (!document) {
      return apiError("NOT_FOUND", 404, { message: "Document not found" });
    }

    if (!document.fileUrl) {
      return apiError("BAD_REQUEST", 400, { message: "Document has no file attached" });
    }

    // Enqueue sync job
    const job = await enqueuePaperlessJob({
      documentId,
      tenantId: check.tenantId!,
      action: "upload",
    });

    // Mark as pending
    await prisma.document.update({
      where: { id: documentId },
      data: { paperlessSyncStatus: "PENDING", paperlessSyncError: null },
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Document queued for Paperless sync",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError("INTERNAL_ERROR", 500, { message });
  }
}
