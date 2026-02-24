import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { TaxType, PlotAreaType } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

const itemUpdateSchema = z.object({
  description: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().optional(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  plotAreaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional().nullable(),
  plotId: z.string().uuid().optional().nullable(),
  referenceType: z.string().optional().nullable(),
  referenceId: z.string().optional().nullable(),
  datevKonto: z.string().optional().nullable(),
  datevGegenkonto: z.string().optional().nullable(),
  datevKostenstelle: z.string().optional().nullable(),
});

// Helper: Rechnung-Summen neu berechnen (akzeptiert optionalen Transaction Client)
async function recalculateInvoiceTotals(invoiceId: string, txClient?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  const db = txClient || prisma;
  const items = await db.invoiceItem.findMany({
    where: { invoiceId },
  });

  const totals = items.reduce(
    (acc, item) => ({
      netAmount: acc.netAmount + Number(item.netAmount),
      taxAmount: acc.taxAmount + Number(item.taxAmount),
      grossAmount: acc.grossAmount + Number(item.grossAmount),
    }),
    { netAmount: 0, taxAmount: 0, grossAmount: 0 }
  );

  await db.invoice.update({
    where: { id: invoiceId },
    data: totals,
  });
}

// Helper: Prüfe Zugriff auf Rechnung
async function checkInvoiceAccess(invoiceId: string, tenantId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, tenantId: true, status: true },
  });

  if (!invoice) {
    return { error: "Rechnung nicht gefunden", status: 404 };
  }

  if (invoice.tenantId !== tenantId) {
    return { error: "Keine Berechtigung", status: 403 };
  }

  if (invoice.status !== "DRAFT") {
    return { error: "Nur Entwürfe können bearbeitet werden", status: 400 };
  }

  return { invoice };
}

// PATCH /api/invoices/[id]/items/[itemId] - Position aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id, itemId } = await params;
    const body = await request.json();
    const validatedData = itemUpdateSchema.parse(body);

    // Prüfe Zugriff
    const accessCheck = await checkInvoiceAccess(id, check.tenantId!);
    if ("error" in accessCheck) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      );
    }

    // Prüfe ob Item existiert
    const existingItem = await prisma.invoiceItem.findUnique({
      where: { id: itemId },
      select: { id: true, invoiceId: true, quantity: true, unitPrice: true, taxType: true },
    });

    if (!existingItem || existingItem.invoiceId !== id) {
      return NextResponse.json(
        { error: "Position nicht gefunden" },
        { status: 404 }
      );
    }

    // Berechne neue Beträge falls Menge, Preis oder Steuertyp geändert
    const quantity = validatedData.quantity ?? Number(existingItem.quantity);
    const unitPrice = validatedData.unitPrice ?? Number(existingItem.unitPrice);
    const taxType = (validatedData.taxType ?? existingItem.taxType) as "STANDARD" | "REDUCED" | "EXEMPT";

    const netAmount = quantity * unitPrice;
    const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(netAmount, taxType);

    // Item aktualisieren + Rechnung-Summen aktualisieren atomar in einer Transaktion
    const item = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.invoiceItem.update({
        where: { id: itemId },
        data: {
          ...(validatedData.description && { description: validatedData.description }),
          ...(validatedData.quantity !== undefined && { quantity: validatedData.quantity }),
          ...(validatedData.unit !== undefined && { unit: validatedData.unit }),
          ...(validatedData.unitPrice !== undefined && { unitPrice: validatedData.unitPrice }),
          ...(validatedData.taxType && { taxType: validatedData.taxType as TaxType }),
          netAmount,
          taxRate,
          taxAmount,
          grossAmount,
          ...(validatedData.plotAreaType !== undefined && { plotAreaType: validatedData.plotAreaType as PlotAreaType }),
          ...(validatedData.plotId !== undefined && { plotId: validatedData.plotId }),
          ...(validatedData.referenceType !== undefined && { referenceType: validatedData.referenceType }),
          ...(validatedData.referenceId !== undefined && { referenceId: validatedData.referenceId }),
          ...(validatedData.datevKonto !== undefined && { datevKonto: validatedData.datevKonto }),
          ...(validatedData.datevGegenkonto !== undefined && { datevGegenkonto: validatedData.datevGegenkonto }),
          ...(validatedData.datevKostenstelle !== undefined && { datevKostenstelle: validatedData.datevKostenstelle }),
        },
      });

      // Rechnung-Summen aktualisieren
      await recalculateInvoiceTotals(id, tx);

      return updatedItem;
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating invoice item");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Position" },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id]/items/[itemId] - Position löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id, itemId } = await params;

    // Prüfe Zugriff
    const accessCheck = await checkInvoiceAccess(id, check.tenantId!);
    if ("error" in accessCheck) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      );
    }

    // Prüfe ob Item existiert
    const existingItem = await prisma.invoiceItem.findUnique({
      where: { id: itemId },
      select: { id: true, invoiceId: true },
    });

    if (!existingItem || existingItem.invoiceId !== id) {
      return NextResponse.json(
        { error: "Position nicht gefunden" },
        { status: 404 }
      );
    }

    // Delete + Summen aktualisieren + Positionen neu nummerieren atomar in einer Transaktion
    await prisma.$transaction(async (tx) => {
      // 1. Item löschen
      await tx.invoiceItem.delete({ where: { id: itemId } });

      // 2. Rechnung-Summen aktualisieren
      await recalculateInvoiceTotals(id, tx);

      // 3. Positionen neu nummerieren
      const remainingItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        orderBy: { position: "asc" },
        select: { id: true },
      });

      for (let i = 0; i < remainingItems.length; i++) {
        await tx.invoiceItem.update({
          where: { id: remainingItems[i].id },
          data: { position: i + 1 },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting invoice item");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Position" },
      { status: 500 }
    );
  }
}
