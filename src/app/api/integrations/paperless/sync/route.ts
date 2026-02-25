/**
 * Paperless Sync API
 *
 * POST /api/integrations/paperless/sync
 * Manually enqueue a WPM document for Paperless archival.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { getPaperlessClient } from "@/lib/paperless";
import { enqueuePaperlessJob } from "@/lib/queue/queues/paperless.queue";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_UPDATE);
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Paperless integration not enabled" }, { status: 404 });
    }

    const client = await getPaperlessClient(check.tenantId);
    if (!client) {
      return NextResponse.json({ error: "Paperless not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "documentId required" }, { status: 400 });
    }

    // Verify document exists and belongs to this tenant
    const document = await prisma.document.findFirst({
      where: { id: documentId, tenantId: check.tenantId },
      select: { id: true, fileUrl: true, paperlessSyncStatus: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (!document.fileUrl) {
      return NextResponse.json({ error: "Document has no file attached" }, { status: 400 });
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
