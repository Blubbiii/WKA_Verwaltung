import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import { createAutoPosting } from "@/lib/accounting/auto-posting";
import { apiError } from "@/lib/api-errors";

// POST /api/invoices/[id]/send - Rechnung als versendet markieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, tenantId: true, status: true },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (invoice.status !== "DRAFT") {
      return apiError("BAD_REQUEST", undefined, { message: `Rechnung kann nicht versendet werden (Status: ${invoice.status})` });
    }

    // Prüfe ob Positionen vorhanden
    const itemCount = await prisma.invoiceItem.count({
      where: { invoiceId: id },
    });

    if (itemCount === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Rechnung hat keine Positionen" });
    }

    const updated = await prisma.invoice.update({
      where: { id, tenantId: check.tenantId! },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    });

    // Fire-and-forget auto-posting
    createAutoPosting(id, check.userId!, check.tenantId!).catch((err) => {
      logger.warn({ err, invoiceId: id }, "[AutoPosting] Failed to create auto-posting");
    });

    // Fire-and-forget webhook dispatch
    dispatchWebhook(check.tenantId!, "invoice.sent", {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      sentAt: new Date().toISOString(),
    }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Error sending invoice");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Versenden der Rechnung" });
  }
}
