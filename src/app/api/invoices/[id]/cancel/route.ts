import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumber } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { reverseAutoPosting } from "@/lib/accounting/auto-posting";
import { apiError } from "@/lib/api-errors";

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
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (original.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    if (original.status === "CANCELLED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Rechnung ist bereits storniert" });
    }

    if (original.status === "DRAFT") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Entwürfe können nicht storniert werden. Bitte löschen Sie den Entwurf." });
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

    // Fire-and-forget auto-posting reversal
    reverseAutoPosting(id, check.userId!, check.tenantId!).catch((err) => {
      logger.warn({ err, invoiceId: id }, "[AutoPosting] Failed to reverse auto-posting");
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
    return handleApiError(error, "Fehler beim Stornieren der Rechnung");
  }
}
