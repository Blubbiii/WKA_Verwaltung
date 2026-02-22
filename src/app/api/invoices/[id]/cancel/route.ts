import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumber } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const cancelSchema = z.object({
  reason: z.string().min(1, "Storno-Grund erforderlich"),
});

// POST /api/invoices/[id]/cancel - Rechnung stornieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { reason } = cancelSchema.parse(body);

    // Hole Original-Rechnung
    const original = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!original) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (original.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (original.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Rechnung ist bereits storniert" },
        { status: 400 }
      );
    }

    if (original.status === "DRAFT") {
      return NextResponse.json(
        { error: "Entwürfe können nicht storniert werden. Bitte löschen Sie den Entwurf." },
        { status: 400 }
      );
    }

    // Generiere Storno-Nummer
    const { number: stornoNumber } = await getNextInvoiceNumber(
      check.tenantId!,
      original.invoiceType
    );

    // Erstelle Storno in einer Transaktion
    const result = await prisma.$transaction(async (tx) => {
      // 1. Original-Rechnung auf CANCELLED setzen
      await tx.invoice.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });

      // 2. Storno-Rechnung erstellen mit negativen Beträgen
      const stornoInvoice = await tx.invoice.create({
        data: {
          invoiceType: original.invoiceType,
          invoiceNumber: stornoNumber,
          invoiceDate: new Date(),
          dueDate: null,
          recipientType: original.recipientType,
          recipientName: original.recipientName,
          recipientAddress: original.recipientAddress,
          serviceStartDate: original.serviceStartDate,
          serviceEndDate: original.serviceEndDate,
          paymentReference: `STORNO ${original.invoiceNumber}`,
          internalReference: `Storno zu ${original.invoiceNumber}`,
          netAmount: -Number(original.netAmount),
          taxRate: Number(original.taxRate),
          taxAmount: original.taxAmount ? -Number(original.taxAmount) : null,
          grossAmount: -Number(original.grossAmount),
          notes: `Stornierung von ${original.invoiceNumber}: ${reason}`,
          status: "SENT", // Storno wird direkt als versendet markiert
          sentAt: new Date(),
          tenantId: check.tenantId!,
          createdById: check.userId,
          fundId: original.fundId,
          shareholderId: original.shareholderId,
          leaseId: original.leaseId,
          parkId: original.parkId,
          settlementPeriodId: original.settlementPeriodId,
          cancelledInvoiceId: original.id, // Referenz auf Original
        },
      });

      // 3. Storno-Positionen erstellen (mit negativen Beträgen)
      for (const item of original.items) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: stornoInvoice.id,
            position: item.position,
            description: `STORNO: ${item.description}`,
            quantity: Number(item.quantity),
            unit: item.unit,
            unitPrice: -Number(item.unitPrice),
            netAmount: -Number(item.netAmount),
            taxType: item.taxType,
            taxRate: Number(item.taxRate),
            taxAmount: -Number(item.taxAmount),
            grossAmount: -Number(item.grossAmount),
            plotAreaType: item.plotAreaType,
            plotId: item.plotId,
            referenceType: item.referenceType,
            referenceId: item.referenceId,
            datevKonto: item.datevKonto,
            datevGegenkonto: item.datevGegenkonto,
            datevKostenstelle: item.datevKostenstelle,
          },
        });
      }

      return stornoInvoice;
    });

    // Lade vollständige Storno-Rechnung
    const stornoInvoice = await prisma.invoice.findUnique({
      where: { id: result.id },
      include: {
        items: { orderBy: { position: "asc" } },
        cancelledInvoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    });

    // Invalidate dashboard caches after invoice cancellation (both original and storno created)
    invalidate.onInvoiceChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after cancel');
    });

    return NextResponse.json({
      message: "Rechnung storniert",
      originalInvoice: {
        id: original.id,
        invoiceNumber: original.invoiceNumber,
        status: "CANCELLED",
      },
      stornoInvoice,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error cancelling invoice");
    return NextResponse.json(
      { error: "Fehler beim Stornieren der Rechnung" },
      { status: 500 }
    );
  }
}
