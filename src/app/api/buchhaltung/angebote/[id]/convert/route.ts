import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumber } from "@/lib/invoices/numberGenerator";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/buchhaltung/angebote/[id]/convert — ACCEPTED → INVOICED + creates Invoice
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const quote = await prisma.quote.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: { items: { orderBy: { position: "asc" } } },
    });

    if (!quote) {
      return apiError("NOT_FOUND", 404, { message: "Angebot nicht gefunden" });
    }

    if (quote.status !== "ACCEPTED") {
      return apiError("BAD_REQUEST", 400, { message: "Nur angenommene Angebote können in Rechnungen umgewandelt werden" });
    }

    // Atomic: create invoice + update quote
    const { number: invoiceNumber } = await getNextInvoiceNumber(check.tenantId!, "INVOICE");

    const result = await prisma.$transaction(async (tx) => {
      // Create invoice from quote data
      const invoice = await tx.invoice.create({
        data: {
          tenantId: check.tenantId!,
          invoiceType: "INVOICE",
          invoiceNumber,
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
          recipientType: quote.recipientType,
          recipientName: quote.recipientName,
          recipientAddress: quote.recipientAddress,
          serviceStartDate: quote.serviceStartDate,
          serviceEndDate: quote.serviceEndDate,
          internalReference: quote.internalReference,
          notes: quote.notes,
          fundId: quote.fundId,
          parkId: quote.parkId,
          letterheadId: quote.letterheadId,
          createdById: check.userId || null,
          netAmount: quote.netAmount,
          taxAmount: quote.taxAmount || 0,
          grossAmount: quote.grossAmount,
          currency: quote.currency,
          status: "DRAFT",
          items: {
            create: quote.items.map((item) => ({
              position: item.position,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              netAmount: item.netAmount,
              taxType: item.taxType,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              grossAmount: item.grossAmount,
            })),
          },
        },
        include: { items: true },
      });

      // Mark quote as invoiced
      await tx.quote.update({
        where: { id },
        data: {
          status: "INVOICED",
          convertedAt: new Date(),
          convertedInvoiceId: invoice.id,
        },
      });

      return invoice;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error converting quote to invoice");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
