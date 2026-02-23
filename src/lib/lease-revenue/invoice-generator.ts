/**
 * Lease Revenue Invoice Generator
 *
 * Generates invoices (Rechnungen) and credit notes (Gutschriften) for the
 * Nutzungsentgelt (lease revenue settlement) workflow.
 *
 * Three invoice generation functions:
 *
 * 1. generateAdvanceInvoices - Credit notes for minimum guarantee advance payments to landowners
 * 2. generateSettlementInvoices - Credit notes for year-end settlement remainder to landowners
 * 3. generateAllocationInvoices - Invoices from Netzgesellschaft to operator companies (1 per operator, mixed tax types)
 */

import { Decimal } from "@prisma/client/runtime/library";
import { Prisma, TaxType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getNextInvoiceNumbers,
  calculateTaxAmounts,
} from "@/lib/invoices/numberGenerator";
import { getTaxRate } from "@/lib/tax/tax-rates";
import { getPositionTaxMap } from "@/lib/tax/position-tax-mapping";
import { getTenantSettings } from "@/lib/tenant-settings";
import { loadAdvanceComponentBreakdown } from "./calculator";
import type {
  SettlementPdfDetails,
  CalculationSummary,
  RevenueTableEntry,
  TurbineProductionEntry,
  FeePositionEntry,
} from "@/types/pdf";

// ============================================================
// Types
// ============================================================

export interface GenerateInvoiceResult {
  created: number;
  skipped: number;
  invoiceIds: string[];
  errors: string[];
}

// ============================================================
// Helpers
// ============================================================

/** Round to 2 decimal places (cent precision) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build recipient name from Person record.
 * Prefers companyName, falls back to firstName + lastName.
 */
function buildRecipientName(person: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (person.companyName) return person.companyName;
  const parts = [person.firstName, person.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unbekannt";
}

/**
 * Build recipient address from Person record.
 * Uses newline-separated format so the PDF template can parse it correctly.
 */
function buildRecipientAddress(person: {
  street: string | null;
  houseNumber?: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
}): string {
  const lines: string[] = [];
  if (person.street) {
    const streetLine = person.houseNumber
      ? `${person.street} ${person.houseNumber}`
      : person.street;
    lines.push(streetLine);
  }
  if (person.postalCode && person.city) {
    lines.push(`${person.postalCode} ${person.city}`);
  } else if (person.city) {
    lines.push(person.city);
  }
  if (person.country && person.country !== "Deutschland") {
    lines.push(person.country);
  }
  return lines.join("\n");
}

/**
 * Build recipient name from Fund record.
 */
function buildFundName(fund: {
  name: string;
  legalForm: string | null;
}): string {
  return fund.legalForm ? `${fund.name} ${fund.legalForm}` : fund.name;
}

/**
 * Compute service period start/end dates based on settlement period type.
 * ADVANCE+QUARTERLY: e.g. Q1 → Jan 1 - Mar 31
 * ADVANCE+MONTHLY: e.g. month 3 → Mar 1 - Mar 31
 * FINAL or ADVANCE+YEARLY: full year Jan 1 - Dec 31
 */
function getServicePeriodDates(
  year: number,
  periodType: string,
  advanceInterval: string | null,
  month: number | null
): { start: Date; end: Date } {
  if (periodType === "ADVANCE" && advanceInterval === "QUARTERLY" && month != null) {
    const quarter = Math.ceil(month / 3);
    const startMonth = (quarter - 1) * 3; // 0-indexed
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 0), // last day of quarter
    };
  }
  if (periodType === "ADVANCE" && advanceInterval === "MONTHLY" && month != null) {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0), // last day of month
    };
  }
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
  };
}

/**
 * Build a human-readable period label for invoice descriptions.
 * ADVANCE+QUARTERLY: "Quartal 1 - 2025"
 * ADVANCE+MONTHLY: "Januar 2025"
 * FINAL or ADVANCE+YEARLY: "Jahr 2025"
 */
function getServicePeriodLabel(
  year: number,
  periodType: string,
  advanceInterval: string | null,
  month: number | null
): string {
  if (periodType === "ADVANCE" && advanceInterval === "QUARTERLY" && month != null) {
    const quarter = Math.ceil(month / 3);
    return `Quartal ${quarter} - ${year}`;
  }
  if (periodType === "ADVANCE" && advanceInterval === "MONTHLY" && month != null) {
    const monthNames = [
      "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember",
    ];
    return `${monthNames[month - 1]} ${year}`;
  }
  return `Jahr ${year}`;
}

/**
 * Build Flurstück reference from plotSummary JSON for invoice line descriptions.
 * Returns e.g. "Flst. 7, Flur 2, Gem. Barenburg" or "Flst. 7 / Flst. 9" for multiple plots.
 */
function buildPlotDescription(plotSummary: unknown): string {
  if (!Array.isArray(plotSummary) || plotSummary.length === 0) return "";

  const plots = plotSummary as Array<{
    plotNumber?: string;
    fieldNumber?: string;
    cadastralDistrict?: string;
  }>;

  const descriptions = plots
    .filter((p) => p.plotNumber)
    .map((p) => {
      const parts: string[] = [];
      parts.push(`Flst. ${p.plotNumber}`);
      if (p.fieldNumber && p.fieldNumber !== "0") {
        parts.push(`Flur ${p.fieldNumber}`);
      }
      if (p.cadastralDistrict) parts.push(`Gem. ${p.cadastralDistrict}`);
      return parts.join(", ");
    });

  return descriptions.join(" / ");
}

/**
 * Load revenue table entries from EnergySettlement for the Anlage (page 2).
 * Always splits into EEG and Direktvermarktung rows.
 * Supports monthly (per-settlement) or yearly (aggregated) display mode.
 */
async function loadRevenueTableEntries(
  tenantId: string,
  parkId: string,
  year: number,
  displayMode: "MONTHLY" | "YEARLY" = "YEARLY"
): Promise<RevenueTableEntry[]> {
  const settlements = await prisma.energySettlement.findMany({
    where: {
      tenantId,
      parkId,
      year,
      status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
    },
    select: {
      netOperatorRevenueEur: true,
      totalProductionKwh: true,
      eegProductionKwh: true,
      eegRevenueEur: true,
      dvProductionKwh: true,
      dvRevenueEur: true,
      month: true,
    },
    orderBy: { month: "asc" },
  });

  const makeEntry = (category: string, productionKwh: number, revenueEur: number): RevenueTableEntry => ({
    category,
    rateCtPerKwh: productionKwh > 0 ? round2((revenueEur / productionKwh) * 10000) / 100 : 0,
    productionKwh,
    revenueEur,
  });

  if (displayMode === "MONTHLY") {
    // One EEG + one DV row per month
    const entries: RevenueTableEntry[] = [];
    for (const s of settlements) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const label = s.month ? `${pad(s.month)}/${year}` : String(year);
      const eegKwh = Number(s.eegProductionKwh || 0);
      const eegEur = Number(s.eegRevenueEur || 0);
      const dvKwh = Number(s.dvProductionKwh || 0);
      const dvEur = Number(s.dvRevenueEur || 0);

      if (eegEur > 0) entries.push(makeEntry(`EEG ${label}`, eegKwh, eegEur));
      if (dvEur > 0) entries.push(makeEntry(`DV ${label}`, dvKwh, dvEur));

      // Fallback: if no EEG/DV split, use total
      if (eegEur === 0 && dvEur === 0) {
        const totalEur = Number(s.netOperatorRevenueEur);
        const totalKwh = Number(s.totalProductionKwh);
        if (totalEur > 0) entries.push(makeEntry(label, totalKwh, totalEur));
      }
    }
    return entries;
  }

  // YEARLY: aggregate all months into EEG total + DV total
  let eegKwh = 0, eegEur = 0, dvKwh = 0, dvEur = 0;
  let totalKwh = 0, totalEur = 0;
  for (const s of settlements) {
    eegKwh += Number(s.eegProductionKwh || 0);
    eegEur += Number(s.eegRevenueEur || 0);
    dvKwh += Number(s.dvProductionKwh || 0);
    dvEur += Number(s.dvRevenueEur || 0);
    totalKwh += Number(s.totalProductionKwh || 0);
    totalEur += Number(s.netOperatorRevenueEur || 0);
  }

  const entries: RevenueTableEntry[] = [];
  if (eegEur > 0) entries.push(makeEntry(`EEG ${year}`, eegKwh, eegEur));
  if (dvEur > 0) entries.push(makeEntry(`Direktvermarktung ${year}`, dvKwh, dvEur));

  // Fallback: if no EEG/DV data at all, use total
  if (entries.length === 0 && totalEur > 0) {
    entries.push(makeEntry(`Jahresabrechnung ${year}`, totalKwh, totalEur));
  }

  return entries;
}

/**
 * Load per-turbine annual production data for the Anlage (page 2).
 * Aggregates monthly TurbineProduction into yearly summaries per WEA.
 */
async function loadTurbineProductions(
  tenantId: string,
  parkId: string,
  year: number
): Promise<TurbineProductionEntry[]> {
  const productions = await prisma.turbineProduction.findMany({
    where: {
      tenantId,
      year,
      turbine: { parkId },
    },
    include: {
      turbine: { select: { designation: true } },
    },
  });

  // Aggregate by turbine (sum all months)
  const turbineMap = new Map<
    string,
    {
      designation: string;
      productionKwh: number;
      operatingHours: number;
      availabilityPctSum: number;
      monthCount: number;
    }
  >();

  for (const p of productions) {
    const existing = turbineMap.get(p.turbineId) ?? {
      designation: p.turbine.designation,
      productionKwh: 0,
      operatingHours: 0,
      availabilityPctSum: 0,
      monthCount: 0,
    };
    existing.productionKwh += Number(p.productionKwh);
    existing.operatingHours += Number(p.operatingHours ?? 0);
    if (p.availabilityPct != null) {
      existing.availabilityPctSum += Number(p.availabilityPct);
      existing.monthCount++;
    }
    turbineMap.set(p.turbineId, existing);
  }

  return Array.from(turbineMap.values())
    .map((t) => ({
      designation: t.designation,
      productionKwh: t.productionKwh,
      operatingHours: t.operatingHours > 0 ? t.operatingHours : null,
      availabilityPct:
        t.monthCount > 0
          ? round2(t.availabilityPctSum / t.monthCount)
          : null,
    }))
    .sort((a, b) => a.designation.localeCompare(b.designation));
}

// ============================================================
// Function 1: Generate Advance Invoices (Vorschuss-Gutschriften)
// ============================================================

/**
 * Creates credit notes (Gutschriften) for the minimum guarantee advance payment
 * to each landowner in a LeaseRevenueSettlement.
 *
 * For each settlement item:
 * - Calculate advance = minimum guarantee share (proportional to subtotal share)
 * - If item has directBillingFundId, the advance comes from that fund
 * - Create Invoice with type CREDIT_NOTE, status DRAFT
 * - Create InvoiceItems for each cost component
 * - Link invoice to the settlement item via advanceInvoiceId
 *
 * Updates settlement status to ADVANCE_CREATED.
 */
export async function generateAdvanceInvoices(
  tenantId: string,
  settlementId: string,
  createdById?: string,
  options?: { initialStatus?: "DRAFT" | "SENT" }
): Promise<GenerateInvoiceResult> {
  const result: GenerateInvoiceResult = {
    created: 0,
    skipped: 0,
    invoiceIds: [],
    errors: [],
  };

  // Load settlement with items, park, lessor persons, and leases
  const settlement = await prisma.leaseRevenueSettlement.findFirst({
    where: { id: settlementId, tenantId },
    include: {
      park: true,
      items: {
        include: {
          lessorPerson: true,
          lease: true,
          directBillingFund: true,
        },
      },
    },
  });

  if (!settlement) {
    result.errors.push("Abrechnung nicht gefunden");
    return result;
  }

  if (settlement.status !== "CALCULATED") {
    result.errors.push(
      `Abrechnung muss Status CALCULATED haben (aktuell: ${settlement.status})`
    );
    return result;
  }

  // Calculate minimum guarantee for proportional advance distribution
  const minimumGuaranteeEur = Number(settlement.minimumGuaranteeEur);
  const totalSubtotal = settlement.items.reduce(
    (sum, item) => sum + Number(item.subtotalEur),
    0
  );

  // Determine how many invoices we need to create (items without existing advance)
  const itemsToProcess = settlement.items.filter(
    (item) => !item.advanceInvoiceId && Number(item.subtotalEur) > 0
  );

  if (itemsToProcess.length === 0) {
    result.skipped = settlement.items.length;
    return result;
  }

  // Get invoice numbers in batch for efficiency
  const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
    tenantId,
    "CREDIT_NOTE",
    itemsToProcess.length
  );

  const invoiceDate = new Date();
  const dueDate = settlement.advanceDueDate ?? undefined;
  const serviceYear = settlement.year;

  // Compute period-aware dates and label
  const periodDates = getServicePeriodDates(
    serviceYear, settlement.periodType, settlement.advanceInterval, settlement.month
  );
  const periodLabel = getServicePeriodLabel(
    serviceYear, settlement.periodType, settlement.advanceInterval, settlement.month
  );

  // Load standard VAT rate from centralized tax config
  const standardRate = await getTaxRate(tenantId, "STANDARD", periodDates.start);
  // Load position-to-tax-type mappings from DB
  const taxMap = await getPositionTaxMap(tenantId);

  await prisma.$transaction(async (tx) => {
    let numberIndex = 0;

    for (const item of settlement.items) {
      // Skip items that already have an advance invoice
      if (item.advanceInvoiceId) {
        result.skipped++;
        continue;
      }

      const subtotalEur = Number(item.subtotalEur);

      // Skip items with zero amount
      if (subtotalEur <= 0) {
        result.skipped++;
        continue;
      }

      // Calculate advance amount: proportional share of minimum guarantee
      const advanceEur =
        totalSubtotal > 0
          ? round2((subtotalEur / totalSubtotal) * minimumGuaranteeEur)
          : 0;

      if (advanceEur <= 0) {
        result.skipped++;
        continue;
      }

      const person = item.lessorPerson;
      const recipientName = buildRecipientName(person);
      const recipientAddress = buildRecipientAddress(person);
      const invoiceNumber = invoiceNumbers[numberIndex++];

      // Determine which fund this invoice comes from
      const fundId = item.directBillingFundId ?? settlement.park.billingEntityFundId;

      // Build invoice items (one per cost component that contributes to the advance)
      const poolFeeEur = Number(item.poolFeeEur);
      const standortFeeEur = Number(item.standortFeeEur);
      const sealedAreaFeeEur = Number(item.sealedAreaFeeEur);
      const roadUsageFeeEur = Number(item.roadUsageFeeEur);
      const cableFeeEur = Number(item.cableFeeEur);

      // Distribute advance proportionally across cost types
      const advanceItems: {
        description: string;
        netAmount: number;
        taxType: TaxType;
      }[] = [];

      if (poolFeeEur > 0) {
        const share = round2((poolFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Flaechenanteil Poolflaeche\n${periodLabel}`,
          netAmount: share,
          taxType: taxMap.POOL_AREA ?? "STANDARD",
        });
      }

      if (standortFeeEur > 0) {
        const share = round2((standortFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss WEA-Standort\n${periodLabel}`,
          netAmount: share,
          taxType: taxMap.TURBINE_SITE ?? "EXEMPT",
        });
      }

      if (sealedAreaFeeEur > 0) {
        const share = round2((sealedAreaFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss versiegelte Flaeche\n${periodLabel}`,
          netAmount: share,
          taxType: taxMap.SEALED_AREA ?? "EXEMPT",
        });
      }

      if (roadUsageFeeEur > 0) {
        const share = round2((roadUsageFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Wegenutzung\n${periodLabel}`,
          netAmount: share,
          taxType: taxMap.ROAD_USAGE ?? "EXEMPT",
        });
      }

      if (cableFeeEur > 0) {
        const share = round2((cableFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Kabeltrasse\n${periodLabel}`,
          netAmount: share,
          taxType: taxMap.CABLE_ROUTE ?? "EXEMPT",
        });
      }

      // Correct rounding differences on last item
      if (advanceItems.length > 0) {
        const itemsSum = advanceItems.reduce((s, i) => s + i.netAmount, 0);
        const diff = round2(advanceEur - itemsSum);
        if (diff !== 0) {
          advanceItems[advanceItems.length - 1].netAmount = round2(
            advanceItems[advanceItems.length - 1].netAmount + diff
          );
        }
      }

      // Calculate totals for the invoice
      let totalNet = 0;
      let totalTax = 0;
      let totalGross = 0;

      const invoiceItemsData: Prisma.InvoiceItemCreateManyInvoiceInput[] = [];
      let position = 1;

      for (const ai of advanceItems) {
        const tax = calculateTaxAmounts(ai.netAmount, ai.taxType);
        totalNet += ai.netAmount;
        totalTax += tax.taxAmount;
        totalGross += tax.grossAmount;

        invoiceItemsData.push({
          position: position++,
          description: ai.description,
          quantity: new Decimal(1),
          unit: "pauschal",
          unitPrice: new Decimal(ai.netAmount),
          netAmount: new Decimal(ai.netAmount),
          taxType: ai.taxType,
          taxRate: new Decimal(tax.taxRate),
          taxAmount: new Decimal(tax.taxAmount),
          grossAmount: new Decimal(tax.grossAmount),
          referenceType: "LEASE_REVENUE_SETTLEMENT",
          referenceId: settlementId,
        });
      }

      totalNet = round2(totalNet);
      totalTax = round2(totalTax);
      totalGross = round2(totalGross);

      // Determine primary tax rate for the invoice header
      // If any items are STANDARD -> use loaded rate, otherwise 0%
      const hasStandardTax = advanceItems.some(
        (ai) => ai.taxType === "STANDARD"
      );
      const headerTaxRate = hasStandardTax ? standardRate : 0;

      // Create the invoice
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          invoiceType: "CREDIT_NOTE",
          invoiceNumber,
          invoiceDate,
          dueDate,
          recipientType: "person",
          recipientName,
          recipientAddress,
          netAmount: new Decimal(totalNet),
          taxRate: new Decimal(headerTaxRate),
          taxAmount: new Decimal(totalTax),
          grossAmount: new Decimal(totalGross),
          status: options?.initialStatus ?? "DRAFT",
          fundId,
          leaseId: item.leaseId,
          parkId: settlement.parkId,
          createdById,
          serviceStartDate: periodDates.start,
          serviceEndDate: periodDates.end,
          internalReference: `NE-VS-${serviceYear}-${recipientName}`,
          sentAt: options?.initialStatus === "SENT" ? new Date() : null,
          paymentReference: `Nutzungsentgelt Vorschuss ${periodLabel} - ${settlement.park.name}`,
          items: {
            createMany: {
              data: invoiceItemsData,
            },
          },
        },
      });

      // Link invoice to settlement item
      await tx.leaseRevenueSettlementItem.update({
        where: { id: item.id },
        data: {
          advanceInvoiceId: invoice.id,
          advancePaidEur: new Decimal(advanceEur),
        },
      });

      result.invoiceIds.push(invoice.id);
      result.created++;
    }

    // Update settlement status
    await tx.leaseRevenueSettlement.update({
      where: { id: settlementId },
      data: {
        status: "ADVANCE_CREATED",
        advanceCreatedAt: new Date(),
      },
    });
  });

  return result;
}

// ============================================================
// Function 2: Generate Settlement Invoices (Endabrechnungs-Gutschriften)
// ============================================================

/**
 * Creates detailed credit notes for the year-end settlement (Endabrechnung).
 *
 * For each item where remainder > 0:
 * - Creates POSITIVE line items for each cost component (full calculated fees)
 * - Creates NEGATIVE line items for each advance deduction (Verrechnung)
 * - The net total of all items equals remainderEur
 * - Populates calculationDetails (SettlementPdfDetails) for the PDF Anlage (page 2)
 *
 * Links via settlementInvoiceId.
 * Updates settlement status to SETTLED.
 */
export async function generateSettlementInvoices(
  tenantId: string,
  settlementId: string,
  createdById?: string,
  options?: { initialStatus?: "DRAFT" | "SENT" }
): Promise<GenerateInvoiceResult> {
  const result: GenerateInvoiceResult = {
    created: 0,
    skipped: 0,
    invoiceIds: [],
    errors: [],
  };

  // Load settlement with items
  const settlement = await prisma.leaseRevenueSettlement.findFirst({
    where: { id: settlementId, tenantId },
    include: {
      park: true,
      items: {
        include: {
          lessorPerson: true,
          lease: true,
          directBillingFund: true,
        },
      },
    },
  });

  if (!settlement) {
    result.errors.push("Abrechnung nicht gefunden");
    return result;
  }

  if (
    settlement.status !== "ADVANCE_CREATED" &&
    settlement.status !== "CALCULATED"
  ) {
    result.errors.push(
      `Abrechnung muss Status ADVANCE_CREATED oder CALCULATED haben (aktuell: ${settlement.status})`
    );
    return result;
  }

  // Determine how many invoices we need
  const itemsToProcess = settlement.items.filter((item) => {
    if (item.settlementInvoiceId) return false;
    const remainder = round2(
      Number(item.subtotalEur) - Number(item.advancePaidEur)
    );
    return remainder > 0;
  });

  if (itemsToProcess.length === 0) {
    result.skipped = settlement.items.length;
    // Still update status even if no invoices needed
    await prisma.leaseRevenueSettlement.update({
      where: { id: settlementId },
      data: {
        status: "SETTLED",
        settlementCreatedAt: new Date(),
      },
    });
    return result;
  }

  // Get invoice numbers in batch
  const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
    tenantId,
    "CREDIT_NOTE",
    itemsToProcess.length
  );

  const invoiceDate = new Date();
  const dueDate = settlement.settlementDueDate ?? undefined;
  const serviceYear = settlement.year;
  const park = settlement.park;

  // Load standard VAT rate from centralized tax config
  const serviceStartDate = new Date(`${serviceYear}-01-01`);
  const standardRate = await getTaxRate(tenantId, "STANDARD", serviceStartDate);
  // Load position-to-tax-type mappings from DB
  const taxMap = await getPositionTaxMap(tenantId);

  // Load advance component breakdown for negative deduction positions
  const advanceBreakdown = await loadAdvanceComponentBreakdown(
    tenantId,
    settlement.parkId,
    settlement.year
  );

  // Load data for Anlage (page 2) - shared across all invoices
  // Prefer revenueSources from calculationDetails (entered in wizard)
  // Fall back to loading from EnergySettlement records
  const calcDetails = settlement.calculationDetails as Record<string, unknown> | null;
  const storedSources = Array.isArray(calcDetails?.revenueSources)
    ? (calcDetails.revenueSources as Array<{ category: string; productionKwh: number; revenueEur: number }>)
    : null;

  let revenueTable: RevenueTableEntry[];
  if (storedSources && storedSources.length > 0) {
    revenueTable = storedSources.map((s) => {
      const production = Number(s.productionKwh || 0);
      const revenue = Number(s.revenueEur || 0);
      return {
        category: String(s.category || "Einspeisung"),
        rateCtPerKwh: production > 0 ? round2((revenue / production) * 10000) / 100 : 0,
        productionKwh: production,
        revenueEur: revenue,
      };
    });
  } else {
    const displayMode = (calcDetails?.revenueDisplayMode as "MONTHLY" | "YEARLY") || "YEARLY";
    revenueTable = await loadRevenueTableEntries(
      tenantId,
      settlement.parkId,
      settlement.year,
      displayMode
    );
  }
  const revenueTableTotal = Number(settlement.totalParkRevenueEur);
  const turbineProductions = await loadTurbineProductions(
    tenantId,
    settlement.parkId,
    settlement.year
  );

  // Build calculation summary for Anlage
  const totalPoolAreaSqm = Number(settlement.totalPoolAreaSqm);
  const weaStandortTotal = Number(settlement.weaStandortTotalEur);
  const poolAreaTotal = Number(settlement.poolAreaTotalEur);

  const calculationSummary: CalculationSummary = {
    totalRevenueEur: Number(settlement.totalParkRevenueEur),
    revenuePhasePercentage: Number(settlement.revenueSharePercent),
    calculatedAnnualFee: Number(settlement.calculatedFeeEur),
    minimumPerContract: Number(settlement.minimumGuaranteeEur),
    actualAnnualFee: Number(settlement.actualFeeEur),
    weaSharePercentage: Number(park.weaSharePercentage ?? 0),
    weaShareAmount: weaStandortTotal,
    weaSharePerUnit:
      settlement.totalWEACount > 0
        ? round2(weaStandortTotal / settlement.totalWEACount)
        : 0,
    weaCount: settlement.totalWEACount,
    poolSharePercentage: Number(park.poolSharePercentage ?? 0),
    poolShareAmount: poolAreaTotal,
    poolSharePerHa:
      totalPoolAreaSqm > 0
        ? round2(poolAreaTotal / (totalPoolAreaSqm / 10000))
        : 0,
    poolTotalHa: round2(totalPoolAreaSqm / 10000),
    parkName: park.name,
    year: settlement.year,
  };

  const settlementPdfDetails: SettlementPdfDetails = {
    type: "FINAL",
    subtitle: `Nutzungsentgelt / ${park.name} / ${settlement.year}`,
    revenueTable: revenueTable.length > 0 ? revenueTable : undefined,
    revenueTableTotal: revenueTable.length > 0 ? revenueTableTotal : undefined,
    calculationSummary,
    turbineProductions:
      turbineProductions.length > 0 ? turbineProductions : undefined,
  };

  await prisma.$transaction(async (tx) => {
    let numberIndex = 0;

    for (const item of settlement.items) {
      // Skip items that already have a settlement invoice
      if (item.settlementInvoiceId) {
        result.skipped++;
        continue;
      }

      const subtotalEur = Number(item.subtotalEur);
      const advancePaidEur = Number(item.advancePaidEur);
      const remainderEur = round2(subtotalEur - advancePaidEur);

      // Skip items with no remainder
      if (remainderEur <= 0) {
        result.skipped++;
        await tx.leaseRevenueSettlementItem.update({
          where: { id: item.id },
          data: { remainderEur: new Decimal(0) },
        });
        continue;
      }

      const person = item.lessorPerson;
      const recipientName = buildRecipientName(person);
      const recipientAddress = buildRecipientAddress(person);
      const invoiceNumber = invoiceNumbers[numberIndex++];

      // Determine which fund this invoice comes from
      const fundId =
        item.directBillingFundId ?? settlement.park.billingEntityFundId;

      // Build Flurstück reference from plotSummary
      const plotDesc = buildPlotDescription(item.plotSummary);
      const plotSuffix = plotDesc ? ` ${plotDesc}` : "";

      // Full fee components from FINAL calculation
      const poolFeeEur = Number(item.poolFeeEur);
      const standortFeeEur = Number(item.standortFeeEur);
      const sealedAreaFeeEur = Number(item.sealedAreaFeeEur);
      const roadUsageFeeEur = Number(item.roadUsageFeeEur);
      const cableFeeEur = Number(item.cableFeeEur);

      // Advance breakdown for this lease (for Anlage page 2)
      const advance = advanceBreakdown.get(item.leaseId);

      // -------------------------------------------------------
      // Build feePositions for Anlage (page 2): full +/- detail
      // -------------------------------------------------------
      const feePositions: FeePositionEntry[] = [];

      // Positive positions: full FINAL fees
      if (poolFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt Flaechenanteil Poolflaeche${plotSuffix}\nJahr ${serviceYear}`,
          netAmount: poolFeeEur,
          taxType: taxMap.POOL_AREA ?? "STANDARD",
        });
      }
      if (standortFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt WEA-Standort${plotSuffix}\nJahr ${serviceYear}`,
          netAmount: standortFeeEur,
          taxType: taxMap.TURBINE_SITE ?? "EXEMPT",
        });
      }
      if (sealedAreaFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt versiegelte Flaeche\nJahr ${serviceYear}`,
          netAmount: sealedAreaFeeEur,
          taxType: taxMap.SEALED_AREA ?? "EXEMPT",
        });
      }
      if (roadUsageFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt Wegenutzung\nJahr ${serviceYear}`,
          netAmount: roadUsageFeeEur,
          taxType: taxMap.ROAD_USAGE ?? "EXEMPT",
        });
      }
      if (cableFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt Kabeltrasse\nJahr ${serviceYear}`,
          netAmount: cableFeeEur,
          taxType: taxMap.CABLE_ROUTE ?? "EXEMPT",
        });
      }

      // Negative positions: advance deductions (Verrechnung)
      if (advance) {
        if (advance.poolFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Vorschuss Poolflaeche\nJahr ${serviceYear}`,
            netAmount: -advance.poolFeeEur,
            taxType: taxMap.POOL_AREA ?? "STANDARD",
          });
        }
        if (advance.standortFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Vorschuss WEA-Standort\nJahr ${serviceYear}`,
            netAmount: -advance.standortFeeEur,
            taxType: taxMap.TURBINE_SITE ?? "EXEMPT",
          });
        }
        if (advance.sealedAreaFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Vorschuss versiegelte Flaeche\nJahr ${serviceYear}`,
            netAmount: -advance.sealedAreaFeeEur,
            taxType: taxMap.SEALED_AREA ?? "EXEMPT",
          });
        }
        if (advance.roadUsageFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Vorschuss Wegenutzung\nJahr ${serviceYear}`,
            netAmount: -advance.roadUsageFeeEur,
            taxType: taxMap.ROAD_USAGE ?? "EXEMPT",
          });
        }
        if (advance.cableFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Vorschuss Kabeltrasse\nJahr ${serviceYear}`,
            netAmount: -advance.cableFeeEur,
            taxType: taxMap.CABLE_ROUTE ?? "EXEMPT",
          });
        }
      }

      // -------------------------------------------------------
      // Build invoice items (page 1): simple NET payout amounts
      // Each cost type shows only the remainder (fee - advance)
      // -------------------------------------------------------
      const payoutItems: {
        description: string;
        netAmount: number;
        taxType: TaxType;
      }[] = [];

      const netPool = round2(poolFeeEur - (advance?.poolFeeEur ?? 0));
      const netStandort = round2(standortFeeEur - (advance?.standortFeeEur ?? 0));
      const netSealed = round2(sealedAreaFeeEur - (advance?.sealedAreaFeeEur ?? 0));
      const netRoad = round2(roadUsageFeeEur - (advance?.roadUsageFeeEur ?? 0));
      const netCable = round2(cableFeeEur - (advance?.cableFeeEur ?? 0));

      if (netPool > 0) {
        payoutItems.push({
          description: `Verguetung Endabrechnung Poolflaeche\nJahr ${serviceYear}`,
          netAmount: netPool,
          taxType: taxMap.POOL_AREA ?? "STANDARD",
        });
      }
      if (netStandort > 0) {
        payoutItems.push({
          description: `Verguetung Endabrechnung WEA-Standort\nJahr ${serviceYear}`,
          netAmount: netStandort,
          taxType: taxMap.TURBINE_SITE ?? "EXEMPT",
        });
      }
      if (netSealed > 0) {
        payoutItems.push({
          description: `Verguetung Endabrechnung versiegelte Flaeche\nJahr ${serviceYear}`,
          netAmount: netSealed,
          taxType: taxMap.SEALED_AREA ?? "EXEMPT",
        });
      }
      if (netRoad > 0) {
        payoutItems.push({
          description: `Verguetung Endabrechnung Wegenutzung\nJahr ${serviceYear}`,
          netAmount: netRoad,
          taxType: taxMap.ROAD_USAGE ?? "EXEMPT",
        });
      }
      if (netCable > 0) {
        payoutItems.push({
          description: `Verguetung Endabrechnung Kabeltrasse\nJahr ${serviceYear}`,
          netAmount: netCable,
          taxType: taxMap.CABLE_ROUTE ?? "EXEMPT",
        });
      }

      // Rounding correction: ensure sum of payout items equals remainderEur exactly
      if (payoutItems.length > 0) {
        const payoutSum = round2(
          payoutItems.reduce((s, i) => s + i.netAmount, 0)
        );
        const diff = round2(remainderEur - payoutSum);
        if (diff !== 0) {
          payoutItems[0].netAmount = round2(payoutItems[0].netAmount + diff);
        }
      }

      // Calculate totals
      let totalNet = 0;
      let totalTax = 0;
      let totalGross = 0;

      const invoiceItemsData: Prisma.InvoiceItemCreateManyInvoiceInput[] = [];
      let position = 1;

      for (const pi of payoutItems) {
        const tax = calculateTaxAmounts(pi.netAmount, pi.taxType);
        totalNet += pi.netAmount;
        totalTax += tax.taxAmount;
        totalGross += tax.grossAmount;

        invoiceItemsData.push({
          position: position++,
          description: pi.description,
          quantity: new Decimal(1),
          unit: "pauschal",
          unitPrice: new Decimal(pi.netAmount),
          netAmount: new Decimal(pi.netAmount),
          taxType: pi.taxType,
          taxRate: new Decimal(tax.taxRate),
          taxAmount: new Decimal(tax.taxAmount),
          grossAmount: new Decimal(tax.grossAmount),
          referenceType: "LEASE_REVENUE_SETTLEMENT",
          referenceId: settlementId,
        });
      }

      totalNet = round2(totalNet);
      totalTax = round2(totalTax);
      totalGross = round2(totalGross);

      const hasStandardTax = payoutItems.some(
        (pi) => pi.taxType === "STANDARD"
      );
      const headerTaxRate = hasStandardTax ? standardRate : 0;

      // Per-invoice calculationDetails: shared park data + lessor-specific feePositions
      const invoicePdfDetails: SettlementPdfDetails = {
        ...settlementPdfDetails,
        feePositions: feePositions.length > 0 ? feePositions : undefined,
      };

      // Create the invoice with calculationDetails for PDF Anlage (page 2)
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          invoiceType: "CREDIT_NOTE",
          invoiceNumber,
          invoiceDate,
          dueDate,
          recipientType: "person",
          recipientName,
          recipientAddress,
          netAmount: new Decimal(totalNet),
          taxRate: new Decimal(headerTaxRate),
          taxAmount: new Decimal(totalTax),
          grossAmount: new Decimal(totalGross),
          status: options?.initialStatus ?? "DRAFT",
          fundId,
          leaseId: item.leaseId,
          parkId: settlement.parkId,
          createdById,
          serviceStartDate: new Date(`${serviceYear}-01-01`),
          serviceEndDate: new Date(`${serviceYear}-12-31`),
          internalReference: `NE-EA-${serviceYear}-${recipientName}`,
          sentAt: options?.initialStatus === "SENT" ? new Date() : null,
          paymentReference: `Nutzungsentgelt Endabrechnung Jahr ${serviceYear} - ${park.name}`,
          calculationDetails:
            invoicePdfDetails as unknown as Prisma.InputJsonValue,
          items: {
            createMany: {
              data: invoiceItemsData,
            },
          },
        },
      });

      // Link invoice to settlement item and update remainder
      await tx.leaseRevenueSettlementItem.update({
        where: { id: item.id },
        data: {
          settlementInvoiceId: invoice.id,
          remainderEur: new Decimal(remainderEur),
        },
      });

      result.invoiceIds.push(invoice.id);
      result.created++;
    }

    // Update settlement status
    await tx.leaseRevenueSettlement.update({
      where: { id: settlementId },
      data: {
        status: "SETTLED",
        settlementCreatedAt: new Date(),
      },
    });
  });

  return result;
}

// ============================================================
// Function 3: Generate Allocation Invoices (Betreiber-Rechnungen)
// ============================================================

/**
 * Creates invoices (Rechnungen) from Netzgesellschaft to operator companies.
 *
 * For each ParkCostAllocationItem, creates ONE invoice with up to 2 positions:
 * - Position 1 (if taxable > 0): VAT (MwSt from TaxRateConfig) for taxableAmountEur (Pool/Flaechenanteil)
 * - Position 2 (if exempt > 0): Exempt (par.4 Nr.12 UStG) for exemptAmountEur (Standort + versiegelt + Weg + Kabel)
 *
 * Links via vatInvoiceId and exemptInvoiceId (both point to the same invoice).
 * Updates allocation status to INVOICED.
 */
export async function generateAllocationInvoices(
  tenantId: string,
  allocationId: string,
  createdById?: string
): Promise<GenerateInvoiceResult> {
  const result: GenerateInvoiceResult = {
    created: 0,
    skipped: 0,
    invoiceIds: [],
    errors: [],
  };

  // Load allocation with items and operator funds
  const allocation = await prisma.parkCostAllocation.findFirst({
    where: { id: allocationId, tenantId },
    include: {
      leaseRevenueSettlement: {
        include: { park: true },
      },
      items: {
        include: {
          operatorFund: true,
        },
      },
    },
  });

  if (!allocation) {
    result.errors.push("Kostenaufteilung nicht gefunden");
    return result;
  }

  if (allocation.status !== "DRAFT") {
    result.errors.push(
      `Kostenaufteilung muss Status DRAFT haben (aktuell: ${allocation.status})`
    );
    return result;
  }

  const settlement = allocation.leaseRevenueSettlement;
  const park = settlement.park;
  const serviceYear = settlement.year;

  // Compute period-aware dates and label for invoices
  const periodDates = getServicePeriodDates(
    serviceYear, settlement.periodType, settlement.advanceInterval, settlement.month
  );
  const periodLabel = getServicePeriodLabel(
    serviceYear, settlement.periodType, settlement.advanceInterval, settlement.month
  );
  const isAdvance = settlement.periodType === "ADVANCE";

  // Load standard VAT rate from centralized tax config
  const standardRate = await getTaxRate(tenantId, "STANDARD", periodDates.start);
  // Load position-to-tax-type mappings from DB
  const taxMap = await getPositionTaxMap(tenantId);

  // Load tenant settings for tax exempt note and payment terms
  const tenantSettings = await getTenantSettings(tenantId);

  // Count invoices needed: 1 per operator item that has any amount > 0
  let invoiceCount = 0;
  for (const item of allocation.items) {
    const hasTaxable = !item.vatInvoiceId && Number(item.taxableAmountEur) > 0;
    const hasExempt = !item.exemptInvoiceId && Number(item.exemptAmountEur) > 0;
    if (hasTaxable || hasExempt) invoiceCount++;
  }

  if (invoiceCount === 0) {
    result.skipped = allocation.items.length;
    return result;
  }

  // Get invoice numbers in batch
  const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
    tenantId,
    "INVOICE",
    invoiceCount
  );

  const invoiceDate = new Date();

  await prisma.$transaction(async (tx) => {
    let numberIndex = 0;

    for (const item of allocation.items) {
      const fund = item.operatorFund;
      const recipientName = buildFundName(fund);
      const recipientAddress = fund.address ?? "";
      const taxableAmountEur = Number(item.taxableAmountEur);
      const taxableVatEur = Number(item.taxableVatEur);
      const exemptAmountEur = Number(item.exemptAmountEur);

      const hasTaxable = !item.vatInvoiceId && taxableAmountEur > 0;
      const hasExempt = !item.exemptInvoiceId && exemptAmountEur > 0;

      if (!hasTaxable && !hasExempt) {
        result.skipped++;
        continue;
      }

      const invoiceNumber = invoiceNumbers[numberIndex++];
      const prefix = isAdvance ? "Vorschuss" : "Kostenaufteilung";

      // Build invoice items (1-2 positions depending on amounts)
      const invoiceItemsData: Prisma.InvoiceItemCreateManyInvoiceInput[] = [];
      let totalNet = 0;
      let totalTax = 0;
      let totalGross = 0;
      let position = 1;

      // Position 1: Taxable (Pool/Flaechenanteil) at standard MwSt rate
      if (hasTaxable) {
        const grossAmount = round2(taxableAmountEur + taxableVatEur);
        totalNet += taxableAmountEur;
        totalTax += taxableVatEur;
        totalGross += grossAmount;

        invoiceItemsData.push({
          position: position++,
          description: isAdvance
            ? `Vorschuss Flaechenanteil Poolflaeche + A&E\n${periodLabel} (${item.allocationBasis})`
            : `Flaechenanteil Poolflaeche + A&E\n${periodLabel} (${item.allocationBasis})`,
          quantity: new Decimal(1),
          unit: "pauschal",
          unitPrice: new Decimal(taxableAmountEur),
          netAmount: new Decimal(taxableAmountEur),
          taxType: taxMap.POOL_AREA ?? "STANDARD",
          taxRate: new Decimal(standardRate),
          taxAmount: new Decimal(taxableVatEur),
          grossAmount: new Decimal(grossAmount),
          referenceType: "COST_ALLOCATION",
          referenceId: allocationId,
        });
      }

      // Position 2: Exempt (Standort + versiegelt + Weg + Kabel)
      if (hasExempt) {
        totalNet += exemptAmountEur;
        totalGross += exemptAmountEur;

        invoiceItemsData.push({
          position: position++,
          description: isAdvance
            ? `Vorschuss WEA-Standort, versiegelte Flaeche, Wegenutzung, Kabel\n${periodLabel} (${item.allocationBasis})`
            : `WEA-Standort, versiegelte Flaeche, Wegenutzung, Kabel\n${periodLabel} (${item.allocationBasis})`,
          quantity: new Decimal(1),
          unit: "pauschal",
          unitPrice: new Decimal(exemptAmountEur),
          netAmount: new Decimal(exemptAmountEur),
          taxType: taxMap.TURBINE_SITE ?? "EXEMPT",
          taxRate: new Decimal(0),
          taxAmount: new Decimal(0),
          grossAmount: new Decimal(exemptAmountEur),
          referenceType: "COST_ALLOCATION",
          referenceId: allocationId,
        });
      }

      totalNet = round2(totalNet);
      totalTax = round2(totalTax);
      totalGross = round2(totalGross);

      const headerTaxRate = hasTaxable ? standardRate : 0;

      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          invoiceType: "INVOICE",
          invoiceNumber,
          invoiceDate,
          recipientType: "fund",
          recipientName,
          recipientAddress,
          netAmount: new Decimal(totalNet),
          taxRate: new Decimal(headerTaxRate),
          taxAmount: new Decimal(totalTax),
          grossAmount: new Decimal(totalGross),
          status: "DRAFT",
          fundId: item.operatorFundId,
          parkId: park.id,
          createdById,
          serviceStartDate: periodDates.start,
          serviceEndDate: periodDates.end,
          internalReference: `NE-KA-${serviceYear}-${fund.name}`,
          paymentReference: `${prefix} Nutzungsentgelt ${periodLabel} - ${park.name}`,
          notes: hasExempt
            ? `Pos. Standort ${tenantSettings.taxExemptNote}`
            : undefined,
          items: {
            createMany: {
              data: invoiceItemsData,
            },
          },
        },
      });

      // Link invoice to allocation item (both fields point to same invoice)
      await tx.parkCostAllocationItem.update({
        where: { id: item.id },
        data: {
          ...(hasTaxable ? { vatInvoiceId: invoice.id } : {}),
          ...(hasExempt ? { exemptInvoiceId: invoice.id } : {}),
        },
      });

      result.invoiceIds.push(invoice.id);
      result.created++;
    }

    // Update allocation status
    await tx.parkCostAllocation.update({
      where: { id: allocationId },
      data: { status: "INVOICED" },
    });
  });

  return result;
}
