import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";

// POST /api/invoices/[id]/send - Rechnung als versendet markieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (invoice.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (invoice.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Rechnung kann nicht versendet werden (Status: ${invoice.status})` },
        { status: 400 }
      );
    }

    // Prüfe ob Positionen vorhanden
    const itemCount = await prisma.invoiceItem.count({
      where: { invoiceId: id },
    });

    if (itemCount === 0) {
      return NextResponse.json(
        { error: "Rechnung hat keine Positionen" },
        { status: 400 }
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
      include: {
        items: { orderBy: { position: "asc" } },
      },
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
    return NextResponse.json(
      { error: "Fehler beim Versenden der Rechnung" },
      { status: 500 }
    );
  }
}
