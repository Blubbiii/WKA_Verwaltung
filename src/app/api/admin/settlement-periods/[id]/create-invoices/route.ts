import { NextRequest, NextResponse } from "next/server";
import { TaxType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumbers, calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { calculateSettlement } from "@/lib/settlement";
import type {
  LeaseCalculationResult,
  PlotAreaCalculationResult,
  SettlementCalculationResult,
} from "@/lib/settlement";
import type { SettlementPdfDetails, CalculationSummary, RevenueTableEntry, TurbineProductionEntry } from "@/types/pdf";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const revenueSourceSchema = z.object({
  category: z.string(),
  productionKwh: z.number().min(0),
  revenueEur: z.number().min(0),
});

const createInvoicesSchema = z.object({
  invoiceDate: z.string().datetime().optional(),
  revenueSources: z.array(revenueSourceSchema).optional(),
});

// Default settlement articles (fallback when park has none configured)
const DEFAULT_SETTLEMENT_ARTICLES = [
  { type: "MINDESTPACHT", label: "Mindestnutzungsentgeld", taxRate: 0, accountNumber: "8400" },
  { type: "JAHRESNUTZUNGSENTGELD", label: "Jahresnutzungsentgeld", taxRate: 0, accountNumber: "8400" },
  { type: "VORSCHUSSVERRECHNUNG", label: "Verrechnung Vorschüsse", taxRate: 0, accountNumber: "8400" },
  { type: "ZUWEGUNG", label: "Zuwegungsentschaedigung", taxRate: 0, accountNumber: "8401" },
  { type: "KABELTRASSE", label: "Kabeltrassenentschaedigung", taxRate: 0, accountNumber: "8401" },
  { type: "AUSGLEICH", label: "Ausgleichsentschaedigung", taxRate: 0, accountNumber: "8401" },
];

interface SettlementArticle {
  type: string;
  label: string;
  taxRate: number;
  accountNumber: string;
}

// Monatsname für Rechnungsbeschreibung
const MONTH_NAMES = [
  "", "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

// Map taxRate to Prisma TaxType enum
function taxRateToTaxType(taxRate: number): TaxType {
  if (taxRate === 0) return "EXEMPT";
  if (taxRate === 7) return "REDUCED";
  return "STANDARD";
}

// Calculate due date from payment day (Stichtag)
function calculateDueDate(invoiceDate: Date, paymentDay: number): Date {
  const year = invoiceDate.getFullYear();
  const month = invoiceDate.getMonth();
  if (invoiceDate.getDate() <= paymentDay) {
    return new Date(year, month, paymentDay);
  }
  return new Date(year, month + 1, paymentDay);
}

// Get settlement articles from park (with fallback to defaults)
function getArticles(park: { settlementArticles?: unknown }): SettlementArticle[] {
  if (Array.isArray(park.settlementArticles) && park.settlementArticles.length > 0) {
    return park.settlementArticles as SettlementArticle[];
  }
  return DEFAULT_SETTLEMENT_ARTICLES;
}

function findArticle(articles: SettlementArticle[], type: string): SettlementArticle | undefined {
  return articles.find((a) => a.type === type);
}

// Build per-PlotArea description for invoice items
function buildPlotAreaDescription(
  plotArea: PlotAreaCalculationResult,
  prefix: string,
): string {
  const base = `G:${plotArea.cadastralDistrict}, Flur:${plotArea.fieldNumber}, FS:${plotArea.plotNumber}`;

  switch (plotArea.areaType) {
    case "WEA_STANDORT":
      return `${prefix}: Flurstueck ${base}, WEA(s):1`;
    case "POOL": {
      const areaHa = plotArea.areaSqm
        ? (plotArea.areaSqm / 10000).toFixed(5)
        : "0";
      return `${prefix}: Flurstueck ${base}, Fl:${areaHa} ha`;
    }
    case "WEG":
      return `${prefix}: Flurstueck ${base}`;
    case "AUSGLEICH":
      return `${prefix}: Flurstueck ${base}`;
    case "KABEL":
      return `${prefix}: Flurstueck ${base}`;
    default:
      return `${prefix}: ${base}`;
  }
}

// Determine quantity, unit and unit price for a PlotArea item
// WEG/AUSGLEICH show m², KABEL shows m, others show 1 pauschal
function getPlotAreaItemDetails(
  plotArea: PlotAreaCalculationResult,
  periodAmount: number,
  parkRates: { wegPerSqm: number; ausgleichPerSqm: number; kabelPerM: number },
): { quantity: number; unit: string; unitPrice: number } {
  // If fixed compensation override, we can't show a per-unit rate
  if (plotArea.compensationFixedAmount != null) {
    return { quantity: 1, unit: "pauschal", unitPrice: periodAmount };
  }

  switch (plotArea.areaType) {
    case "WEG": {
      const sqm = plotArea.areaSqm ?? 0;
      if (sqm > 0 && parkRates.wegPerSqm > 0) {
        return { quantity: sqm, unit: "m\u00B2", unitPrice: periodAmount / sqm };
      }
      return { quantity: 1, unit: "pauschal", unitPrice: periodAmount };
    }
    case "AUSGLEICH": {
      const sqm = plotArea.areaSqm ?? 0;
      if (sqm > 0 && parkRates.ausgleichPerSqm > 0) {
        return { quantity: sqm, unit: "m\u00B2", unitPrice: periodAmount / sqm };
      }
      return { quantity: 1, unit: "pauschal", unitPrice: periodAmount };
    }
    case "KABEL": {
      const m = plotArea.lengthM ?? 0;
      if (m > 0 && parkRates.kabelPerM > 0) {
        return { quantity: m, unit: "m", unitPrice: periodAmount / m };
      }
      return { quantity: 1, unit: "pauschal", unitPrice: periodAmount };
    }
    default:
      return { quantity: 1, unit: "pauschal", unitPrice: periodAmount };
  }
}

// Determine which article type maps to a PlotArea areaType
function articleTypeForArea(areaType: string, isFinal: boolean): string {
  switch (areaType) {
    case "WEA_STANDORT":
    case "POOL":
      return isFinal ? "JAHRESNUTZUNGSENTGELD" : "MINDESTPACHT";
    case "WEG":
      return "ZUWEGUNG";
    case "KABEL":
      return "KABELTRASSE";
    case "AUSGLEICH":
      return "AUSGLEICH";
    default:
      return isFinal ? "JAHRESNUTZUNGSENTGELD" : "MINDESTPACHT";
  }
}

// POST /api/admin/settlement-periods/[id]/create-invoices - Gutschriften erstellen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { invoiceDate, revenueSources } = createInvoicesSchema.parse(body);

    // Hole Periode mit Park-Konfiguration
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        year: true,
        month: true,
        periodType: true,
        advanceInterval: true,
        parkId: true,
        tenantId: true,
        status: true,
        totalRevenue: true,
        totalMinimumRent: true,
        totalActualRent: true,
        linkedEnergySettlementId: true,
        park: {
          select: {
            id: true,
            name: true,
            minimumRentPerTurbine: true,
            settlementArticles: true,
            defaultPaymentDay: true,
            wegCompensationPerSqm: true,
            ausgleichCompensationPerSqm: true,
            kabelCompensationPerM: true,
          },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (period.status === "CLOSED") {
      return NextResponse.json(
        { error: "Für geschlossene Perioden können keine Gutschriften mehr erstellt werden" },
        { status: 400 }
      );
    }

    const articles = getArticles(period.park);
    const defaultPaymentDay = period.park.defaultPaymentDay ?? 15;

    if (period.periodType === "ADVANCE") {
      return await createAdvanceCreditNotes({
        period,
        articles,
        defaultPaymentDay,
        invoiceDate,
        tenantId: check.tenantId!,
        userId: check.userId!,
      });
    } else {
      return await createFinalCreditNotes({
        period,
        articles,
        defaultPaymentDay,
        invoiceDate,
        tenantId: check.tenantId!,
        userId: check.userId!,
        revenueSources,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating credit notes");
    const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json(
      { error: `Fehler beim Erstellen der Gutschriften: ${errMsg}` },
      { status: 500 }
    );
  }
}

// ===========================================
// ADVANCE CREDIT NOTES (Monatliche Mindestpacht-Gutschriften)
// ===========================================

type AdvanceInterval = "YEARLY" | "QUARTERLY" | "MONTHLY";

// Divisor for splitting yearly amount by interval
function getIntervalDivisor(interval: AdvanceInterval): number {
  switch (interval) {
    case "YEARLY": return 1;
    case "QUARTERLY": return 4;
    case "MONTHLY": return 12;
  }
}

// Human-readable period description for an interval
function getIntervalPeriodLabel(interval: AdvanceInterval, year: number, month: number | null): string {
  switch (interval) {
    case "YEARLY":
      return `Leistungszeitraum ${year}`;
    case "QUARTERLY": {
      const q = month ?? 1;
      return `${q}. Quartal ${year}`;
    }
    case "MONTHLY": {
      const m = month ?? 1;
      return `${MONTH_NAMES[m]} ${year}`;
    }
  }
}

// Human-readable interval type name
function getIntervalTypeName(interval: AdvanceInterval): string {
  switch (interval) {
    case "YEARLY": return "Jahresvorschuss";
    case "QUARTERLY": return "Quartalsvorschuss";
    case "MONTHLY": return "Monatsvorschuss";
  }
}

// Service date range for an interval period
function getIntervalServiceDates(interval: AdvanceInterval, year: number, month: number | null): { start: Date; end: Date } {
  switch (interval) {
    case "YEARLY":
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    case "QUARTERLY": {
      const q = (month ?? 1) - 1; // 0-based quarter index
      const startMonth = q * 3;
      return { start: new Date(year, startMonth, 1), end: new Date(year, startMonth + 3, 0) };
    }
    case "MONTHLY": {
      const m = (month ?? 1) - 1; // 0-based month index
      return { start: new Date(year, m, 1), end: new Date(year, m + 1, 0) };
    }
  }
}

interface CreateCreditNotesOptions {
  period: {
    id: string;
    year: number;
    month: number | null;
    advanceInterval: string | null;
    parkId: string;
    park: {
      id: string;
      name: string;
      defaultPaymentDay: number | null;
      wegCompensationPerSqm: unknown;
      ausgleichCompensationPerSqm: unknown;
      kabelCompensationPerM: unknown;
    };
    totalRevenue: unknown;
    totalMinimumRent: unknown;
    totalActualRent: unknown;
    linkedEnergySettlementId: string | null;
  };
  articles: SettlementArticle[];
  defaultPaymentDay: number;
  invoiceDate?: string;
  tenantId: string;
  userId: string;
  revenueSources?: Array<{ category: string; productionKwh: number; revenueEur: number }>;
}

async function createAdvanceCreditNotes(options: CreateCreditNotesOptions) {
  const { period, articles, defaultPaymentDay, invoiceDate, tenantId, userId } = options;

  const interval = (period.advanceInterval as AdvanceInterval) || "MONTHLY";
  const divisor = getIntervalDivisor(interval);

  // Validate: QUARTERLY and MONTHLY need a month/quarter number
  if (interval !== "YEARLY" && !period.month) {
    return NextResponse.json(
      { error: "Quartals-/Monatsvorschuss benötigt eine Periodenangabe" },
      { status: 400 }
    );
  }

  const periodLabel = getIntervalPeriodLabel(interval, period.year, period.month);
  const intervalTypeName = getIntervalTypeName(interval);

  // Use calculateSettlement to get per-PlotArea detail
  const calcResult = await calculateSettlement({
    parkId: period.parkId,
    year: period.year,
    tenantId,
    periodType: "ADVANCE",
    month: period.month ?? undefined,
  });

  if (calcResult.leases.length === 0) {
    return NextResponse.json(
      { error: "Keine abrechenbaren Verträge gefunden" },
      { status: 400 }
    );
  }

  // Load paymentDay per lease
  const leaseIds = calcResult.leases.map((l) => l.leaseId);
  const leases = await prisma.lease.findMany({
    where: { id: { in: leaseIds } },
    select: { id: true, paymentDay: true },
  });
  const leasePaymentDays = new Map(leases.map((l) => [l.id, l.paymentDay]));

  // Load lessor address info
  const leasesWithLessor = await prisma.lease.findMany({
    where: { id: { in: leaseIds } },
    select: {
      id: true,
      lessor: {
        select: {
          personType: true,
          companyName: true,
          firstName: true,
          lastName: true,
          street: true,
          postalCode: true,
          city: true,
        },
      },
    },
  });
  const lessorByLease = new Map(leasesWithLessor.map((l) => [l.id, l.lessor]));

  // Filter out leases with negligible total
  const validLeases = calcResult.leases.filter((l) => l.totalPayment > 0.01);
  if (validLeases.length === 0) {
    return NextResponse.json(
      { error: "Keine abrechenbaren Betraege gefunden" },
      { status: 400 }
    );
  }

  const invoiceDateValue = invoiceDate ? new Date(invoiceDate) : new Date();

  // Service date range depends on interval
  const { start: serviceStartDate, end: serviceEndDate } = getIntervalServiceDates(interval, period.year, period.month);

  // Batch-generate credit note numbers
  const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
    tenantId,
    "CREDIT_NOTE",
    validLeases.length
  );

  // Park rates for WEG/AUSGLEICH/KABEL item details
  const parkRates = {
    wegPerSqm: period.park.wegCompensationPerSqm ? Number(period.park.wegCompensationPerSqm) : 0,
    ausgleichPerSqm: period.park.ausgleichCompensationPerSqm ? Number(period.park.ausgleichCompensationPerSqm) : 0,
    kabelPerM: period.park.kabelCompensationPerM ? Number(period.park.kabelCompensationPerM) : 0,
  };

  const createdInvoices = [];

  for (let i = 0; i < validLeases.length; i++) {
    const leaseCalc = validLeases[i];
    const invoiceNumber = invoiceNumbers[i];
    const paymentDay = leasePaymentDays.get(leaseCalc.leaseId) ?? defaultPaymentDay;
    const lessor = lessorByLease.get(leaseCalc.leaseId);
    const dueDateValue = calculateDueDate(invoiceDateValue, paymentDay);

    const recipientName = lessor?.companyName ||
      `${lessor?.firstName || ""} ${lessor?.lastName || ""}`.trim() || leaseCalc.lessorName;
    const addressParts = [
      lessor?.street,
      `${lessor?.postalCode || ""} ${lessor?.city || ""}`.trim(),
    ].filter(Boolean);
    const recipientAddress = addressParts.join(", ") || leaseCalc.lessorAddress || "";

    // Build per-PlotArea items (yearly amount / divisor)
    const itemsData: Array<{
      position: number;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      netAmount: number;
      taxType: TaxType;
      taxRate: number;
      taxAmount: number;
      grossAmount: number;
      referenceType: string;
      referenceId: string;
      plotAreaType: string;
      plotId: string;
      datevKonto: string;
    }> = [];

    let position = 0;
    let totalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    for (const plotArea of leaseCalc.plotAreas) {
      const periodAmount = plotArea.calculatedAmount / divisor;
      if (Math.abs(periodAmount) < 0.01) continue;

      position++;
      const artType = articleTypeForArea(plotArea.areaType, false);
      const article = findArticle(articles, artType);
      const taxRate = article?.taxRate ?? 0;
      const taxType = taxRateToTaxType(taxRate);
      const tax = calculateTaxAmounts(periodAmount, taxType);
      const description = buildPlotAreaDescription(plotArea, article?.label ?? "Mindestnutzungsentgeld");
      const itemDetails = getPlotAreaItemDetails(plotArea, periodAmount, parkRates);

      totalNet += periodAmount;
      totalTax += tax.taxAmount;
      totalGross += tax.grossAmount;

      itemsData.push({
        position,
        description,
        quantity: itemDetails.quantity,
        unit: itemDetails.unit,
        unitPrice: itemDetails.unitPrice,
        netAmount: periodAmount,
        taxType,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        grossAmount: tax.grossAmount,
        referenceType: "PLOT_AREA",
        referenceId: plotArea.plotAreaId,
        plotAreaType: plotArea.areaType,
        plotId: plotArea.plotId,
        datevKonto: article?.accountNumber ?? "",
      });
    }

    if (itemsData.length === 0) continue;

    // Build calculation summary for PDF (same as FINAL)
    const calculationSummary = buildCalculationSummary(calcResult, leaseCalc);

    // Build settlement details for PDF
    const settlementDetails: SettlementPdfDetails = {
      type: "ADVANCE",
      subtitle: `Nutzungsentgelt / ${period.park.name} / ${periodLabel}`,
      introText: "Gemaess den Ihnen vorliegenden Verträgen erhalten Sie nachfolgende Vorschuss-Pachtzahlung:",
      calculationSummary,
    };

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceType: "CREDIT_NOTE",
          invoiceNumber,
          invoiceDate: invoiceDateValue,
          dueDate: dueDateValue,
          recipientType: lessor?.personType === "legal" ? "COMPANY" : "PERSON",
          recipientName,
          recipientAddress,
          serviceStartDate,
          serviceEndDate,
          paymentReference: `Pacht ${periodLabel} - ${period.park.name}`,
          internalReference: `${intervalTypeName} ${period.month ? `${period.month}/` : ""}${period.year}`,
          notes: settlementDetails.introText ?? null,
          calculationDetails: settlementDetails as unknown as Record<string, unknown>,
          netAmount: new Decimal(totalNet.toFixed(2)),
          taxRate: new Decimal(0),
          taxAmount: new Decimal(totalTax.toFixed(2)),
          grossAmount: new Decimal(totalGross.toFixed(2)),
          status: "DRAFT",
          tenantId,
          createdById: userId,
          leaseId: leaseCalc.leaseId,
          parkId: period.parkId,
          settlementPeriodId: period.id,
        },
      });

      // Create per-PlotArea items
      for (const item of itemsData) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            position: item.position,
            description: item.description,
            quantity: new Decimal(item.quantity.toFixed(4)),
            unit: item.unit,
            unitPrice: new Decimal(item.unitPrice.toFixed(4)),
            netAmount: new Decimal(item.netAmount.toFixed(2)),
            taxType: item.taxType,
            taxRate: new Decimal(item.taxRate.toFixed(2)),
            taxAmount: new Decimal(item.taxAmount.toFixed(2)),
            grossAmount: new Decimal(item.grossAmount.toFixed(2)),
            referenceType: item.referenceType,
            referenceId: item.referenceId,
            plotAreaType: item.plotAreaType as "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL",
            plotId: item.plotId,
            datevKonto: item.datevKonto || undefined,
          },
        });
      }

      return inv;
    });

    createdInvoices.push(invoice);
  }

  // Aktualisiere Periode
  await prisma.leaseSettlementPeriod.update({
    where: { id: period.id },
    data: {
      advanceInvoiceDate: invoiceDateValue,
      status: "IN_PROGRESS",
    },
  });

  return NextResponse.json({
    message: `${createdInvoices.length} Gutschrift(en) für ${periodLabel} erstellt`,
    periodType: "ADVANCE",
    invoices: createdInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      recipientName: inv.recipientName,
      grossAmount: inv.grossAmount,
    })),
  });
}

// ===========================================
// FINAL CREDIT NOTES (Jahresendabrechnung mit Verrechnung)
// ===========================================

async function createFinalCreditNotes(options: CreateCreditNotesOptions) {
  const { period, articles, defaultPaymentDay, invoiceDate, tenantId, userId, revenueSources } = options;

  if (!period.totalActualRent) {
    return NextResponse.json(
      { error: "Bitte fuehren Sie zuerst die Berechnung durch" },
      { status: 400 }
    );
  }

  // Re-run the calculation to get per-lease + per-PlotArea results
  const calcResult = await calculateSettlement({
    parkId: period.parkId,
    year: period.year,
    totalRevenue: period.totalRevenue ? Number(period.totalRevenue) : 0,
    tenantId,
    periodType: "FINAL",
    linkedEnergySettlementId: period.linkedEnergySettlementId ?? undefined,
  });

  if (calcResult.leases.length === 0) {
    return NextResponse.json(
      { error: "Keine abrechenbaren Verträge gefunden" },
      { status: 400 }
    );
  }

  // Artikelkonten
  const jahresArticle = findArticle(articles, "JAHRESNUTZUNGSENTGELD");
  const verrechnungArticle = findArticle(articles, "VORSCHUSSVERRECHNUNG");
  const jahresTaxRate = jahresArticle?.taxRate ?? 0;
  const jahresTaxType = taxRateToTaxType(jahresTaxRate);

  // Load ADVANCE invoices per lease for detailed deduction
  const advanceInvoices = await prisma.invoice.findMany({
    where: {
      parkId: period.parkId,
      tenantId,
      invoiceType: "CREDIT_NOTE",
      status: { in: ["DRAFT", "SENT", "PAID"] },
      settlementPeriod: {
        year: period.year,
        periodType: "ADVANCE",
      },
    },
    include: {
      items: { orderBy: { position: "asc" } },
    },
  });

  // Group advance invoices by leaseId
  const advanceByLease = new Map<string, typeof advanceInvoices>();
  for (const inv of advanceInvoices) {
    if (!inv.leaseId) continue;
    const list = advanceByLease.get(inv.leaseId) || [];
    list.push(inv);
    advanceByLease.set(inv.leaseId, list);
  }

  // Load paymentDay per lease
  const leaseIds = calcResult.leases.map((l) => l.leaseId);
  const leasesDb = await prisma.lease.findMany({
    where: { id: { in: leaseIds } },
    select: { id: true, paymentDay: true },
  });
  const leasePaymentDays = new Map(leasesDb.map((l) => [l.id, l.paymentDay]));

  // Load lessor address info
  const leasesWithLessor = await prisma.lease.findMany({
    where: { id: { in: leaseIds } },
    select: {
      id: true,
      lessor: {
        select: {
          personType: true,
          companyName: true,
          firstName: true,
          lastName: true,
          street: true,
          postalCode: true,
          city: true,
        },
      },
    },
  });
  const lessorByLease = new Map(leasesWithLessor.map((l) => [l.id, l.lessor]));

  // Build revenue table for Anlage (page 2)
  // Priority: 1. revenueSources from wizard, 2. EnergyRevenueType monthly rates
  let revenueTable: RevenueTableEntry[] | undefined;
  let revenueTableTotal: number | undefined;

  if (revenueSources && revenueSources.length > 0) {
    // Use revenue sources provided by the wizard (EEG/Direktvermarktung breakdown)
    revenueTable = revenueSources
      .filter((s) => s.revenueEur > 0)
      .map((s) => ({
        category: s.category,
        rateCtPerKwh: s.productionKwh > 0
          ? Math.round((s.revenueEur / s.productionKwh) * 10000) / 100
          : 0,
        productionKwh: s.productionKwh,
        revenueEur: s.revenueEur,
      }));
    revenueTableTotal = revenueTable.reduce((sum, r) => sum + r.revenueEur, 0);
    revenueTableTotal = Math.round(revenueTableTotal * 100) / 100;
  } else if (period.linkedEnergySettlementId) {
    try {
      // Load the linked EnergySettlement for total production
      const energySettlement = await prisma.energySettlement.findUnique({
        where: { id: period.linkedEnergySettlementId },
        select: {
          totalProductionKwh: true,
          netOperatorRevenueEur: true,
        },
      });

      if (energySettlement) {
        const totalProdKwh = Number(energySettlement.totalProductionKwh);

        // Load all active revenue types with their monthly rates for this year
        const revenueTypes = await prisma.energyRevenueType.findMany({
          where: {
            tenantId,
            isActive: true,
            energyMonthlyRates: {
              some: {
                year: period.year,
                tenantId,
              },
            },
          },
          include: {
            energyMonthlyRates: {
              where: {
                year: period.year,
                tenantId,
              },
              orderBy: { month: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        });

        if (revenueTypes.length > 0) {
          revenueTable = [];
          revenueTableTotal = 0;

          for (const rt of revenueTypes) {
            if (rt.energyMonthlyRates.length === 0) continue;

            // Average rate across all months that have data
            const rateSum = rt.energyMonthlyRates.reduce(
              (sum, mr) => sum + Number(mr.ratePerKwh),
              0
            );
            const avgRateCtPerKwh = rateSum / rt.energyMonthlyRates.length;

            // Revenue = totalProd * avgRate / 100 (ct → EUR)
            const revenueEur = totalProdKwh * avgRateCtPerKwh / 100;

            revenueTable.push({
              category: rt.code || rt.name,
              rateCtPerKwh: Math.round(avgRateCtPerKwh * 10000) / 10000,
              productionKwh: Math.round(totalProdKwh * 1000) / 1000,
              revenueEur: Math.round(revenueEur * 100) / 100,
            });
            revenueTableTotal += revenueEur;
          }

          revenueTableTotal = Math.round(revenueTableTotal * 100) / 100;
        }
      }
    } catch (err) {
      // Revenue table is optional - log and continue without it
      logger.warn({ err }, "Could not build revenue table for settlement PDF");
    }
  }

  // Load per-turbine production for Anlage (FINAL only)
  let turbineProductions: TurbineProductionEntry[] | undefined;
  try {
    const turbines = await prisma.turbine.findMany({
      where: { parkId: period.parkId, status: "ACTIVE" },
      select: { id: true, designation: true },
      orderBy: { designation: "asc" },
    });

    if (turbines.length > 0) {
      const entries: TurbineProductionEntry[] = [];

      for (const turbine of turbines) {
        const productions = await prisma.turbineProduction.findMany({
          where: { turbineId: turbine.id, year: period.year, tenantId },
        });

        if (productions.length === 0) continue;

        const totalKwh = productions.reduce((s, p) => s + Number(p.productionKwh), 0);
        const totalHours = productions.reduce((s, p) => s + Number(p.operatingHours ?? 0), 0);
        const avgAvail = productions.filter((p) => p.availabilityPct != null).length > 0
          ? productions.reduce((s, p) => s + Number(p.availabilityPct ?? 0), 0) /
            productions.filter((p) => p.availabilityPct != null).length
          : null;

        entries.push({
          designation: turbine.designation,
          productionKwh: Math.round(totalKwh * 1000) / 1000,
          operatingHours: totalHours > 0 ? Math.round(totalHours * 100) / 100 : null,
          availabilityPct: avgAvail != null ? Math.round(avgAvail * 100) / 100 : null,
        });
      }

      if (entries.length > 0) {
        turbineProductions = entries;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Could not load turbine production data for settlement PDF");
  }

  const invoiceDateValue = invoiceDate ? new Date(invoiceDate) : new Date();

  // Park rates for WEG/AUSGLEICH/KABEL item details
  const finalParkRates = {
    wegPerSqm: period.park.wegCompensationPerSqm ? Number(period.park.wegCompensationPerSqm) : 0,
    ausgleichPerSqm: period.park.ausgleichCompensationPerSqm ? Number(period.park.ausgleichCompensationPerSqm) : 0,
    kabelPerM: period.park.kabelCompensationPerM ? Number(period.park.kabelCompensationPerM) : 0,
  };

  // Build per-lease credit notes
  const prepared: Array<{
    leaseCalc: LeaseCalculationResult;
    items: Array<{
      position: number;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      netAmount: number;
      taxType: TaxType;
      taxRate: number;
      taxAmount: number;
      grossAmount: number;
      referenceType?: string;
      referenceId?: string;
      plotAreaType?: string;
      plotId?: string;
      datevKonto?: string;
    }>;
    totalNet: number;
    totalTax: number;
    totalGross: number;
    paymentDay: number;
    settlementDetails: SettlementPdfDetails;
  }> = [];

  for (const leaseCalc of calcResult.leases) {
    if (leaseCalc.totalPayment <= 0.01) continue;

    const items: typeof prepared[0]["items"] = [];
    let position = 0;
    let totalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    // 1. Per-PlotArea Jahresnutzungsentgelt positions
    for (const plotArea of leaseCalc.plotAreas) {
      if (Math.abs(plotArea.calculatedAmount) < 0.01) continue;

      position++;
      const artType = articleTypeForArea(plotArea.areaType, true);
      const article = findArticle(articles, artType);
      const taxRate = article?.taxRate ?? jahresTaxRate;
      const taxType = taxRateToTaxType(taxRate);
      const tax = calculateTaxAmounts(plotArea.calculatedAmount, taxType);
      const description = buildPlotAreaDescription(
        plotArea,
        article?.label ?? jahresArticle?.label ?? "Jahresnutzungsentgeld"
      );
      const itemDetails = getPlotAreaItemDetails(plotArea, plotArea.calculatedAmount, finalParkRates);

      totalNet += plotArea.calculatedAmount;
      totalTax += tax.taxAmount;
      totalGross += tax.grossAmount;

      items.push({
        position,
        description,
        quantity: itemDetails.quantity,
        unit: itemDetails.unit,
        unitPrice: itemDetails.unitPrice,
        netAmount: plotArea.calculatedAmount,
        taxType,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        grossAmount: tax.grossAmount,
        referenceType: "PLOT_AREA",
        referenceId: plotArea.plotAreaId,
        plotAreaType: plotArea.areaType,
        plotId: plotArea.plotId,
        datevKonto: article?.accountNumber,
      });
    }

    // 2. Verrechnung: Mirror each advance item as negative
    const leaseAdvances = advanceByLease.get(leaseCalc.leaseId) || [];
    for (const advInvoice of leaseAdvances) {
      const advDate = new Intl.DateTimeFormat("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
      }).format(advInvoice.invoiceDate);

      for (const advItem of advInvoice.items) {
        const advNet = Number(advItem.netAmount);
        if (Math.abs(advNet) < 0.01) continue;

        position++;
        const verrTaxType = taxRateToTaxType(verrechnungArticle?.taxRate ?? 0);
        const verrTax = calculateTaxAmounts(advNet, verrTaxType);
        const verrLabel = verrechnungArticle?.label ?? "Verrechnung Mindestnutzungsentgeld";

        totalNet -= advNet;
        totalTax -= verrTax.taxAmount;
        totalGross -= verrTax.grossAmount;

        items.push({
          position,
          description: `${verrLabel}: ${advItem.description} vom ${advDate}`,
          quantity: 1,
          unit: "pauschal",
          unitPrice: -advNet,
          netAmount: -advNet,
          taxType: verrTaxType,
          taxRate: verrTax.taxRate,
          taxAmount: -verrTax.taxAmount,
          grossAmount: -verrTax.grossAmount,
          referenceType: "ADVANCE_DEDUCTION",
          referenceId: advInvoice.id,
          plotAreaType: advItem.plotAreaType ?? undefined,
          plotId: advItem.plotId ?? undefined,
          datevKonto: verrechnungArticle?.accountNumber,
        });
      }
    }

    // Skip if net amount after deductions is negligible
    if (items.length === 0) continue;

    const paymentDay = leasePaymentDays.get(leaseCalc.leaseId) ?? defaultPaymentDay;

    // Build calculation summary for PDF
    const calculationSummary = buildCalculationSummary(calcResult, leaseCalc);

    const settlementDetails: SettlementPdfDetails = {
      type: "FINAL",
      subtitle: `Nutzungsentgelt / ${calcResult.parkName} / Leistungszeitraum ${period.year}`,
      introText: "Gemaess den Ihnen vorliegenden Verträgen erhalten Sie nachfolgende Pachtzahlung:",
      calculationSummary,
      revenueTable,
      revenueTableTotal,
      turbineProductions,
    };

    prepared.push({
      leaseCalc,
      items,
      totalNet,
      totalTax,
      totalGross,
      paymentDay,
      settlementDetails,
    });
  }

  if (prepared.length === 0) {
    return NextResponse.json(
      { error: "Keine offenen Betraege nach Verrechnung der Vorschüsse" },
      { status: 400 }
    );
  }

  // Batch-generate credit note numbers
  const { numbers: creditNoteNumbers } = await getNextInvoiceNumbers(
    tenantId,
    "CREDIT_NOTE",
    prepared.length
  );

  const createdInvoices = [];

  for (let i = 0; i < prepared.length; i++) {
    const { leaseCalc, items, totalNet, totalTax, totalGross, paymentDay, settlementDetails } = prepared[i];
    const invoiceNumber = creditNoteNumbers[i];

    const dueDateValue = calculateDueDate(invoiceDateValue, paymentDay);
    const lessor = lessorByLease.get(leaseCalc.leaseId);
    const recipientName = lessor?.companyName ||
      `${lessor?.firstName || ""} ${lessor?.lastName || ""}`.trim() || leaseCalc.lessorName;
    const addressParts = [
      lessor?.street,
      `${lessor?.postalCode || ""} ${lessor?.city || ""}`.trim(),
    ].filter(Boolean);
    const recipientAddress = addressParts.join(", ") || leaseCalc.lessorAddress || "";

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceType: "CREDIT_NOTE",
          invoiceNumber,
          invoiceDate: invoiceDateValue,
          dueDate: dueDateValue,
          recipientType: lessor?.personType === "legal" ? "COMPANY" : "PERSON",
          recipientName,
          recipientAddress,
          serviceStartDate: new Date(period.year, 0, 1),
          serviceEndDate: new Date(period.year, 11, 31),
          paymentReference: `Pachtabrechnung ${period.year} - ${period.park.name}`,
          internalReference: `Endabrechnung ${period.year}`,
          notes: settlementDetails.introText ?? null,
          calculationDetails: settlementDetails as unknown as Record<string, unknown>,
          netAmount: new Decimal(Math.abs(totalNet).toFixed(2)),
          taxRate: new Decimal(0),
          taxAmount: new Decimal(Math.abs(totalTax).toFixed(2)),
          grossAmount: new Decimal(Math.abs(totalGross).toFixed(2)),
          status: "DRAFT",
          tenantId,
          createdById: userId,
          leaseId: leaseCalc.leaseId,
          parkId: period.parkId,
          settlementPeriodId: period.id,
        },
      });

      // Create per-PlotArea items
      for (const item of items) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            position: item.position,
            description: item.description,
            quantity: new Decimal(item.quantity.toFixed(4)),
            unit: item.unit,
            unitPrice: new Decimal(item.unitPrice.toFixed(4)),
            netAmount: new Decimal(item.netAmount.toFixed(2)),
            taxType: item.taxType,
            taxRate: new Decimal(item.taxRate.toFixed(2)),
            taxAmount: new Decimal(item.taxAmount.toFixed(2)),
            grossAmount: new Decimal(item.grossAmount.toFixed(2)),
            referenceType: item.referenceType,
            referenceId: item.referenceId,
            plotAreaType: item.plotAreaType as "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL" | undefined,
            plotId: item.plotId,
            datevKonto: item.datevKonto || undefined,
          },
        });
      }

      return inv;
    });

    createdInvoices.push(invoice);
  }

  // Aktualisiere Periode
  await prisma.leaseSettlementPeriod.update({
    where: { id: period.id },
    data: {
      settlementDate: invoiceDateValue,
      status: "IN_PROGRESS",
    },
  });

  return NextResponse.json({
    message: `Endabrechnung ${period.year}: ${createdInvoices.length} Gutschrift(en) erstellt`,
    periodType: "FINAL",
    summary: {
      creditNotesCount: createdInvoices.length,
      totalAmount: createdInvoices.reduce((sum, inv) => sum + Number(inv.grossAmount), 0),
    },
    invoices: createdInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      recipientName: inv.recipientName,
      grossAmount: inv.grossAmount,
    })),
  });
}

// ===========================================
// HELPERS
// ===========================================

function buildCalculationSummary(
  calcResult: SettlementCalculationResult,
  leaseCalc: LeaseCalculationResult,
): CalculationSummary {
  const weaAreas = leaseCalc.plotAreas.filter((pa) => pa.areaType === "WEA_STANDORT");
  const poolAreas = leaseCalc.plotAreas.filter((pa) => pa.areaType === "POOL");

  const weaShareAmount = weaAreas.reduce((s, pa) => s + pa.calculatedAmount, 0);
  const poolShareAmount = poolAreas.reduce((s, pa) => s + pa.calculatedAmount, 0);
  const totalPoolSqm = poolAreas.reduce((s, pa) => s + (pa.areaSqm ?? 0), 0);
  const totalPoolHa = totalPoolSqm / 10000;

  return {
    totalRevenueEur: calcResult.totalRevenue,
    revenuePhasePercentage: calcResult.revenuePhasePercentage ?? 0,
    calculatedAnnualFee: leaseCalc.totalRevenueShare,
    minimumPerContract: leaseCalc.totalMinimumRent,
    actualAnnualFee: leaseCalc.totalPayment,
    weaSharePercentage: calcResult.weaSharePercentage ?? 10,
    weaShareAmount,
    weaSharePerUnit: leaseCalc.weaCount > 0 ? weaShareAmount / leaseCalc.weaCount : 0,
    weaCount: leaseCalc.weaCount,
    poolSharePercentage: calcResult.poolSharePercentage ?? 90,
    poolShareAmount,
    poolSharePerHa: totalPoolHa > 0 ? poolShareAmount / totalPoolHa : 0,
    poolTotalHa: totalPoolHa,
    parkName: calcResult.parkName,
    year: calcResult.year,
  };
}
