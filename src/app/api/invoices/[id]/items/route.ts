import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { TaxType, PlotAreaType } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

const itemCreateSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  plotAreaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional(),
  plotId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  datevKonto: z.string().optional(),
  datevGegenkonto: z.string().optional(),
  datevKostenstelle: z.string().optional(),
});

const itemUpdateSchema = itemCreateSchema.partial();

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

// GET /api/invoices/[id]/items - Alle Positionen einer Rechnung
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Prüfe ob Rechnung existiert und zugänglich ist
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
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

    const items = await prisma.invoiceItem.findMany({
      where: { invoiceId: id },
      orderBy: { position: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice items");
    return NextResponse.json(
      { error: "Fehler beim Laden der Positionen" },
      { status: 500 }
    );
  }
}

// POST /api/invoices/[id]/items - Position hinzufügen (nur DRAFT)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = itemCreateSchema.parse(body);

    // Prüfe ob Rechnung existiert und DRAFT ist
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
        { error: "Nur Entwürfe können bearbeitet werden" },
        { status: 400 }
      );
    }

    // Nächste Position ermitteln
    const lastItem = await prisma.invoiceItem.findFirst({
      where: { invoiceId: id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (lastItem?.position ?? 0) + 1;

    // Berechne Beträge
    const netAmount = validatedData.quantity * validatedData.unitPrice;
    const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
      netAmount,
      validatedData.taxType as "STANDARD" | "REDUCED" | "EXEMPT"
    );

    // Item erstellen + Rechnung-Summen aktualisieren atomar in einer Transaktion
    const item = await prisma.$transaction(async (tx) => {
      const createdItem = await tx.invoiceItem.create({
        data: {
          invoiceId: id,
          position: nextPosition,
          description: validatedData.description,
          quantity: validatedData.quantity,
          unit: validatedData.unit,
          unitPrice: validatedData.unitPrice,
          netAmount,
          taxType: validatedData.taxType as TaxType,
          taxRate,
          taxAmount,
          grossAmount,
          plotAreaType: validatedData.plotAreaType as PlotAreaType,
          plotId: validatedData.plotId,
          referenceType: validatedData.referenceType,
          referenceId: validatedData.referenceId,
          datevKonto: validatedData.datevKonto,
          datevGegenkonto: validatedData.datevGegenkonto,
          datevKostenstelle: validatedData.datevKostenstelle,
        },
      });

      // Rechnung-Summen aktualisieren
      await recalculateInvoiceTotals(id, tx);

      return createdItem;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating invoice item");
    return NextResponse.json(
      { error: "Fehler beim Hinzufügen der Position" },
      { status: 500 }
    );
  }
}
