import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const quoteItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
});

const quoteUpdateSchema = z.object({
  quoteDate: z.string().optional(),
  validUntil: z.string().optional(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  letterheadId: z.uuid().optional().nullable(),
  items: z.array(quoteItemSchema).min(1).optional(),
});

// GET /api/buchhaltung/angebote/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const quote = await prisma.quote.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        items: { orderBy: { position: "asc" } },
        fund: { select: { id: true, name: true } },
        park: { select: { id: true, name: true } },
        convertedInvoice: { select: { id: true, invoiceNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!quote) {
      return apiError("NOT_FOUND", 404, { message: "Angebot nicht gefunden" });
    }

    return NextResponse.json({ data: quote });
  } catch (error) {
    logger.error({ err: error }, "Error fetching quote");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// PUT /api/buchhaltung/angebote/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const existing = await prisma.quote.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Angebot nicht gefunden" });
    }

    if (existing.status !== "DRAFT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur Entwürfe können bearbeitet werden" });
    }

    const body = await request.json();
    const parsed = quoteUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Daten", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    // Recalculate items if provided
    let itemsUpdate = {};
    let amountsUpdate = {};

    if (data.items) {
      const items = data.items.map((item, i) => {
        const net = Math.round(item.quantity * item.unitPrice * 100) / 100;
        const tax = calculateTaxAmounts(net, item.taxType);
        return {
          position: i + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || null,
          unitPrice: item.unitPrice,
          netAmount: net,
          taxType: item.taxType,
          taxRate: tax.taxRate,
          taxAmount: tax.taxAmount,
          grossAmount: tax.grossAmount,
        };
      });

      const netAmount = items.reduce((sum, it) => sum + it.netAmount, 0);
      const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0);
      const grossAmount = items.reduce((sum, it) => sum + it.grossAmount, 0);

      itemsUpdate = {
        items: {
          deleteMany: {},
          create: items,
        },
      };
      amountsUpdate = { netAmount, taxAmount, grossAmount };
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        ...(data.quoteDate && { quoteDate: new Date(data.quoteDate) }),
        ...(data.validUntil && { validUntil: new Date(data.validUntil) }),
        ...(data.recipientType !== undefined && { recipientType: data.recipientType }),
        ...(data.recipientName !== undefined && { recipientName: data.recipientName }),
        ...(data.recipientAddress !== undefined && { recipientAddress: data.recipientAddress }),
        ...(data.serviceStartDate !== undefined && { serviceStartDate: data.serviceStartDate ? new Date(data.serviceStartDate) : null }),
        ...(data.serviceEndDate !== undefined && { serviceEndDate: data.serviceEndDate ? new Date(data.serviceEndDate) : null }),
        ...(data.internalReference !== undefined && { internalReference: data.internalReference }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.fundId !== undefined && { fundId: data.fundId }),
        ...(data.parkId !== undefined && { parkId: data.parkId }),
        ...(data.letterheadId !== undefined && { letterheadId: data.letterheadId }),
        ...amountsUpdate,
        ...itemsUpdate,
      },
      include: { items: { orderBy: { position: "asc" } } },
    });

    return NextResponse.json({ data: quote });
  } catch (error) {
    logger.error({ err: error }, "Error updating quote");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// DELETE /api/buchhaltung/angebote/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const existing = await prisma.quote.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Angebot nicht gefunden" });
    }

    if (existing.status === "INVOICED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Bereits in Rechnung umgewandelte Angebote können nicht gelöscht werden" });
    }

    await prisma.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting quote");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
