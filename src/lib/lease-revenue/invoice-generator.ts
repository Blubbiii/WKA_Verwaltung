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
 * 3. generateAllocationInvoices - Invoices from Netzgesellschaft to operator companies (2 per operator)
 */

import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getNextInvoiceNumbers,
  calculateTaxAmounts,
} from "@/lib/invoices/numberGenerator";
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
 * Returns one entry per EnergySettlement (monthly or yearly) with average ct/kWh.
 */
async function loadRevenueTableEntries(
  tenantId: string,
  parkId: string,
  year: number
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
      month: true,
    },
    orderBy: { month: "asc" },
  });

  return settlements
    .filter((s) => Number(s.netOperatorRevenueEur) > 0)
    .map((s) => {
      const revenue = Number(s.netOperatorRevenueEur);
      const production = Number(s.totalProductionKwh);
      const rateCtPerKwh =
        production > 0 ? round2((revenue / production) * 10000) / 100 : 0;
      return {
        category: s.month
          ? `${String(s.month).padStart(2, "0")}/${year}`
          : `Jahresabrechnung ${year}`,
        rateCtPerKwh,
        productionKwh: production,
        revenueEur: revenue,
      };
    });
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
  createdById?: string
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
        taxType: "STANDARD" | "EXEMPT";
      }[] = [];

      if (poolFeeEur > 0) {
        const share = round2((poolFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Flaechenanteil windhoefige Flaeche ${serviceYear}`,
          netAmount: share,
          taxType: "STANDARD",
        });
      }

      if (standortFeeEur > 0) {
        const share = round2((standortFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss WEA-Standort ${serviceYear}`,
          netAmount: share,
          taxType: "EXEMPT",
        });
      }

      if (sealedAreaFeeEur > 0) {
        const share = round2((sealedAreaFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss versiegelte Flaeche ${serviceYear}`,
          netAmount: share,
          taxType: "EXEMPT",
        });
      }

      if (roadUsageFeeEur > 0) {
        const share = round2((roadUsageFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Wegenutzung ${serviceYear}`,
          netAmount: share,
          taxType: "EXEMPT",
        });
      }

      if (cableFeeEur > 0) {
        const share = round2((cableFeeEur / subtotalEur) * advanceEur);
        advanceItems.push({
          description: `Vorschuss Kabeltrasse ${serviceYear}`,
          netAmount: share,
          taxType: "EXEMPT",
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
      // Use weighted average: if all items are EXEMPT -> 0%, otherwise 19%
      const hasStandardTax = advanceItems.some(
        (ai) => ai.taxType === "STANDARD"
      );
      const headerTaxRate = hasStandardTax ? 19 : 0;

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
          status: "DRAFT",
          fundId,
          leaseId: item.leaseId,
          parkId: settlement.parkId,
          createdById,
          serviceStartDate: new Date(`${serviceYear}-01-01`),
          serviceEndDate: new Date(`${serviceYear}-12-31`),
          internalReference: `NE-VS-${serviceYear}-${recipientName}`,
          paymentReference: `Nutzungsentgelt Vorschuss ${serviceYear} - ${settlement.park.name}`,
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
  createdById?: string
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
    revenueTable = await loadRevenueTableEntries(
      tenantId,
      settlement.parkId,
      settlement.year
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
          description: `Jahresnutzungsentgelt${plotSuffix} (Flaechenanteil windhoefige Flaeche) ${serviceYear}`,
          netAmount: poolFeeEur,
          taxType: "STANDARD",
        });
      }
      if (standortFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt WEA-Standort${plotSuffix} ${serviceYear}`,
          netAmount: standortFeeEur,
          taxType: "EXEMPT",
        });
      }
      if (sealedAreaFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt versiegelte Flaeche ${serviceYear}`,
          netAmount: sealedAreaFeeEur,
          taxType: "EXEMPT",
        });
      }
      if (roadUsageFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt Wegenutzung ${serviceYear}`,
          netAmount: roadUsageFeeEur,
          taxType: "EXEMPT",
        });
      }
      if (cableFeeEur > 0) {
        feePositions.push({
          description: `Jahresnutzungsentgelt Kabeltrasse ${serviceYear}`,
          netAmount: cableFeeEur,
          taxType: "EXEMPT",
        });
      }

      // Negative positions: advance deductions (Verrechnung)
      if (advance) {
        if (advance.poolFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Mindestnutzungsentgelt Flaechenanteil ${serviceYear}`,
            netAmount: -advance.poolFeeEur,
            taxType: "STANDARD",
          });
        }
        if (advance.standortFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Mindestnutzungsentgelt WEA-Standort ${serviceYear}`,
            netAmount: -advance.standortFeeEur,
            taxType: "EXEMPT",
          });
        }
        if (advance.sealedAreaFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung versiegelte Flaeche ${serviceYear}`,
            netAmount: -advance.sealedAreaFeeEur,
            taxType: "EXEMPT",
          });
        }
        if (advance.roadUsageFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Wegenutzung ${serviceYear}`,
            netAmount: -advance.roadUsageFeeEur,
            taxType: "EXEMPT",
          });
        }
        if (advance.cableFeeEur > 0) {
          feePositions.push({
            description: `Verrechnung Kabeltrasse ${serviceYear}`,
            netAmount: -advance.cableFeeEur,
            taxType: "EXEMPT",
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
        taxType: "STANDARD" | "EXEMPT";
      }[] = [];

      const netPool = round2(poolFeeEur - (advance?.poolFeeEur ?? 0));
      const netStandort = round2(standortFeeEur - (advance?.standortFeeEur ?? 0));
      const netSealed = round2(sealedAreaFeeEur - (advance?.sealedAreaFeeEur ?? 0));
      const netRoad = round2(roadUsageFeeEur - (advance?.roadUsageFeeEur ?? 0));
      const netCable = round2(cableFeeEur - (advance?.cableFeeEur ?? 0));

      if (netPool > 0) {
        payoutItems.push({
          description: `Verguetung Jahresendabrechnung Pool ${serviceYear}`,
          netAmount: netPool,
          taxType: "STANDARD",
        });
      }
      if (netStandort > 0) {
        payoutItems.push({
          description: `Verguetung Jahresendabrechnung Standort ${serviceYear}`,
          netAmount: netStandort,
          taxType: "EXEMPT",
        });
      }
      if (netSealed > 0) {
        payoutItems.push({
          description: `Verguetung Jahresendabrechnung Ausgleichsmassnahmen ${serviceYear}`,
          netAmount: netSealed,
          taxType: "EXEMPT",
        });
      }
      if (netRoad > 0) {
        payoutItems.push({
          description: `Verguetung Jahresendabrechnung Wege ${serviceYear}`,
          netAmount: netRoad,
          taxType: "EXEMPT",
        });
      }
      if (netCable > 0) {
        payoutItems.push({
          description: `Verguetung Jahresendabrechnung Kabel ${serviceYear}`,
          netAmount: netCable,
          taxType: "EXEMPT",
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
      const headerTaxRate = hasStandardTax ? 19 : 0;

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
          status: "DRAFT",
          fundId,
          leaseId: item.leaseId,
          parkId: settlement.parkId,
          createdById,
          serviceStartDate: new Date(`${serviceYear}-01-01`),
          serviceEndDate: new Date(`${serviceYear}-12-31`),
          internalReference: `NE-EA-${serviceYear}-${recipientName}`,
          paymentReference: `Nutzungsentgelt Endabrechnung ${serviceYear} - ${park.name}`,
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
 * For each ParkCostAllocationItem, creates TWO invoices:
 * 1. VAT invoice (19% MwSt) for taxableAmountEur (Pool/Flaechenanteil)
 * 2. Exempt invoice (par.4 Nr.12 UStG) for exemptAmountEur (Standort + versiegelt + Weg + Kabel)
 *
 * Links via vatInvoiceId and exemptInvoiceId.
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

  // Count invoices needed: up to 2 per item (VAT + exempt), but only if amount > 0
  // and not already created
  let invoiceCount = 0;
  for (const item of allocation.items) {
    if (!item.vatInvoiceId && Number(item.taxableAmountEur) > 0) invoiceCount++;
    if (!item.exemptInvoiceId && Number(item.exemptAmountEur) > 0)
      invoiceCount++;
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

      // Invoice 1: VAT invoice (19% MwSt) for pool/Flaechenanteil
      if (!item.vatInvoiceId && taxableAmountEur > 0) {
        const invoiceNumber = invoiceNumbers[numberIndex++];
        const grossAmount = round2(taxableAmountEur + taxableVatEur);

        const vatInvoice = await tx.invoice.create({
          data: {
            tenantId,
            invoiceType: "INVOICE",
            invoiceNumber,
            invoiceDate,
            recipientType: "fund",
            recipientName,
            recipientAddress,
            netAmount: new Decimal(taxableAmountEur),
            taxRate: new Decimal(19),
            taxAmount: new Decimal(taxableVatEur),
            grossAmount: new Decimal(grossAmount),
            status: "DRAFT",
            fundId: item.operatorFundId,
            parkId: park.id,
            createdById,
            serviceStartDate: new Date(`${serviceYear}-01-01`),
            serviceEndDate: new Date(`${serviceYear}-12-31`),
            internalReference: `NE-KA-UST-${serviceYear}-${fund.name}`,
            paymentReference: `Kostenaufteilung Nutzungsentgelt ${serviceYear} - ${park.name} (umsatzsteuerpflichtig)`,
            items: {
              create: {
                position: 1,
                description: `Flaechenanteil windhoefige Flaeche + A&E ${serviceYear} (${item.allocationBasis})`,
                quantity: new Decimal(1),
                unit: "pauschal",
                unitPrice: new Decimal(taxableAmountEur),
                netAmount: new Decimal(taxableAmountEur),
                taxType: "STANDARD",
                taxRate: new Decimal(19),
                taxAmount: new Decimal(taxableVatEur),
                grossAmount: new Decimal(grossAmount),
                referenceType: "COST_ALLOCATION",
                referenceId: allocationId,
              },
            },
          },
        });

        // Link VAT invoice
        await tx.parkCostAllocationItem.update({
          where: { id: item.id },
          data: { vatInvoiceId: vatInvoice.id },
        });

        result.invoiceIds.push(vatInvoice.id);
        result.created++;
      }

      // Invoice 2: Exempt invoice (par.4 Nr.12 UStG) for Standort + versiegelt + Weg + Kabel
      if (!item.exemptInvoiceId && exemptAmountEur > 0) {
        const invoiceNumber = invoiceNumbers[numberIndex++];

        const exemptInvoice = await tx.invoice.create({
          data: {
            tenantId,
            invoiceType: "INVOICE",
            invoiceNumber,
            invoiceDate,
            recipientType: "fund",
            recipientName,
            recipientAddress,
            netAmount: new Decimal(exemptAmountEur),
            taxRate: new Decimal(0),
            taxAmount: new Decimal(0),
            grossAmount: new Decimal(exemptAmountEur),
            status: "DRAFT",
            fundId: item.operatorFundId,
            parkId: park.id,
            createdById,
            serviceStartDate: new Date(`${serviceYear}-01-01`),
            serviceEndDate: new Date(`${serviceYear}-12-31`),
            internalReference: `NE-KA-FRE-${serviceYear}-${fund.name}`,
            paymentReference: `Kostenaufteilung Nutzungsentgelt ${serviceYear} - ${park.name} (steuerfrei gem. par.4 Nr.12 UStG)`,
            notes: "Steuerfrei gemaess par.4 Nr.12 UStG (Vermietung und Verpachtung von Grundstuecken)",
            items: {
              create: {
                position: 1,
                description: `WEA-Standort, versiegelte Flaeche, Wegenutzung, Kabel ${serviceYear} (${item.allocationBasis})`,
                quantity: new Decimal(1),
                unit: "pauschal",
                unitPrice: new Decimal(exemptAmountEur),
                netAmount: new Decimal(exemptAmountEur),
                taxType: "EXEMPT",
                taxRate: new Decimal(0),
                taxAmount: new Decimal(0),
                grossAmount: new Decimal(exemptAmountEur),
                referenceType: "COST_ALLOCATION",
                referenceId: allocationId,
              },
            },
          },
        });

        // Link exempt invoice
        await tx.parkCostAllocationItem.update({
          where: { id: item.id },
          data: { exemptInvoiceId: exemptInvoice.id },
        });

        result.invoiceIds.push(exemptInvoice.id);
        result.created++;
      }

      // If both amounts are 0, skip
      if (taxableAmountEur <= 0 && exemptAmountEur <= 0) {
        result.skipped++;
      }
    }

    // Update allocation status
    await tx.parkCostAllocation.update({
      where: { id: allocationId },
      data: { status: "INVOICED" },
    });
  });

  return result;
}
