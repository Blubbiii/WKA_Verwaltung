import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { enqueueInboxOcrJob } from "@/lib/queue/queues/inbox-ocr.queue";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/inbox/[id]/ocr — Re-trigger OCR processing
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:update");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const invoice = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      select: { id: true, fileUrl: true, ocrStatus: true },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", 404, { message: "Eingangsrechnung nicht gefunden" });
    }

    if (invoice.ocrStatus === "PROCESSING") {
      return apiError("BAD_REQUEST", 400, { message: "OCR läuft bereits" });
    }

    // Reset status and re-enqueue
    await prisma.incomingInvoice.update({
      where: { id },
      data: { ocrStatus: "PENDING", ocrRawText: null },
    });

    await enqueueInboxOcrJob({
      invoiceId: id,
      tenantId: check.tenantId!,
      fileUrl: invoice.fileUrl,
    });

    return NextResponse.json({ success: true, message: "OCR erneut gestartet" });
  } catch (error) {
    logger.error({ err: error }, "Error re-triggering OCR");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
