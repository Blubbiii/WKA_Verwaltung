/**
 * Lease Advance Payment Rule Handler (Pacht-Vorschussrechnungen)
 *
 * Generates monthly advance credit notes (Gutschriften) to landowners (Verpaechter).
 * Wind parks pay monthly advance lease payments which are later reconciled in
 * the annual Nutzungsentgelt settlement.
 *
 * Key differences from LEASE_PAYMENT:
 * - Creates CREDIT_NOTEs (Gutschriften) instead of INVOICEs
 * - Intended as advance payments that will be reconciled annually
 * - Includes lease reference, plot details, and period information
 * - Prevents duplicate generation for the same month/lease combination
 *
 * Uses the same calculation logic as monthly-lease.ts (calculateLeaseAmount + proration).
 */

import { prisma } from "@/lib/prisma";
import { InvoiceType, TaxType, ContractStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getNextInvoiceNumber,
  getNextInvoiceNumbers,
  calculateTaxAmounts,
} from "@/lib/invoices/numberGenerator";
import { BillingRuleType } from "../types";
import {
  RuleHandler,
  LeaseAdvanceParameters,
  BillingRuleParameters,
  ExecuteRuleOptions,
  ExecutionResult,
  InvoiceCreationResult,
} from "../types";
import { calculateProrationFactor, calculateLeaseAmount } from "./monthly-lease";
import { getTenantSettings } from "@/lib/tenant-settings";

/** German month names for invoice descriptions */
const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** Round to 2 decimal places */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build a compact plot description string for the invoice item.
 * Example: "Flst. 12 (Gem. Neustadt), Flst. 45 (Gem. Altstadt)"
 */
function buildPlotDescription(
  leasePlots: Array<{
    plot: {
      cadastralDistrict: string | null;
      plotNumber: string | null;
    };
  }>
): string {
  if (leasePlots.length === 0) return "";
  const parts = leasePlots.map((lp) => {
    const num = lp.plot.plotNumber || "?";
    const district = lp.plot.cadastralDistrict
      ? ` (Gem. ${lp.plot.cadastralDistrict})`
      : "";
    return `Flst. ${num}${district}`;
  });
  return parts.join(", ");
}

/**
 * Normalize Prisma Decimal fields from a lease plot query into plain numbers
 * for the calculateLeaseAmount function.
 */
function normalizeLeasePlots(
  leasePlots: Array<{
    plot: {
      id: string;
      areaSqm: Decimal | null;
      plotAreas: Array<{
        id: string;
        areaType: string;
        areaSqm: Decimal | null;
        lengthM: Decimal | null;
        compensationType: string;
        compensationFixedAmount: Decimal | null;
        compensationPercentage: Decimal | null;
      }>;
    };
  }>
) {
  return leasePlots.map((lp) => ({
    plot: {
      id: lp.plot.id,
      areaSqm: lp.plot.areaSqm ? Number(lp.plot.areaSqm) : null,
      plotAreas: lp.plot.plotAreas.map((pa) => ({
        id: pa.id,
        areaType: pa.areaType,
        areaSqm: pa.areaSqm ? Number(pa.areaSqm) : null,
        lengthM: pa.lengthM ? Number(pa.lengthM) : null,
        compensationType: pa.compensationType,
        compensationFixedAmount: pa.compensationFixedAmount
          ? Number(pa.compensationFixedAmount)
          : null,
        compensationPercentage: pa.compensationPercentage
          ? Number(pa.compensationPercentage)
          : null,
      })),
    },
  }));
}

/**
 * Normalize park Decimal fields into plain numbers for calculateLeaseAmount.
 */
function normalizePark(park: {
  minimumRentPerTurbine: Decimal | null;
  weaSharePercentage: Decimal | null;
  poolSharePercentage: Decimal | null;
  wegCompensationPerSqm: Decimal | null;
  ausgleichCompensationPerSqm: Decimal | null;
  kabelCompensationPerM: Decimal | null;
} | null) {
  if (!park) return null;
  return {
    minimumRentPerTurbine: park.minimumRentPerTurbine
      ? Number(park.minimumRentPerTurbine)
      : null,
    weaSharePercentage: park.weaSharePercentage
      ? Number(park.weaSharePercentage)
      : null,
    poolSharePercentage: park.poolSharePercentage
      ? Number(park.poolSharePercentage)
      : null,
    wegCompensationPerSqm: park.wegCompensationPerSqm
      ? Number(park.wegCompensationPerSqm)
      : null,
    ausgleichCompensationPerSqm: park.ausgleichCompensationPerSqm
      ? Number(park.ausgleichCompensationPerSqm)
      : null,
    kabelCompensationPerM: park.kabelCompensationPerM
      ? Number(park.kabelCompensationPerM)
      : null,
  };
}

/**
 * Load active leases with all required relations for advance calculation.
 */
async function loadActiveLeases(tenantId: string, parkId?: string) {
  return prisma.lease.findMany({
    where: {
      tenantId,
      status: ContractStatus.ACTIVE,
      ...(parkId && {
        leasePlots: {
          some: {
            plot: {
              parkId,
            },
          },
        },
      }),
    },
    include: {
      lessor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          street: true,
          postalCode: true,
          city: true,
          country: true,
        },
      },
      leasePlots: {
        include: {
          plot: {
            include: {
              park: {
                select: {
                  id: true,
                  name: true,
                  minimumRentPerTurbine: true,
                  weaSharePercentage: true,
                  poolSharePercentage: true,
                  wegCompensationPerSqm: true,
                  ausgleichCompensationPerSqm: true,
                  kabelCompensationPerM: true,
                },
              },
              plotAreas: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Check if an advance credit note already exists for a given lease/month/year combination.
 * This prevents duplicate generation.
 */
async function advanceAlreadyExists(
  tenantId: string,
  leaseId: string,
  year: number,
  month: number
): Promise<boolean> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const existing = await prisma.invoice.findFirst({
    where: {
      tenantId,
      leaseId,
      invoiceType: InvoiceType.CREDIT_NOTE,
      deletedAt: null,
      status: { not: "CANCELLED" },
      serviceStartDate: { gte: monthStart },
      serviceEndDate: { lte: new Date(year, month, 0, 23, 59, 59) },
      // Match by internal reference pattern to identify advances
      internalReference: {
        startsWith: `PV-${year}-${month.toString().padStart(2, "0")}`,
      },
    },
    select: { id: true },
  });

  return !!existing;
}

/**
 * Handler for monthly lease advance payments (Pacht-Vorschussrechnungen).
 *
 * For each active lease in the tenant, calculates the monthly advance amount
 * based on the same logic as LEASE_PAYMENT and generates a credit note (Gutschrift)
 * to the landowner.
 */
export class LeaseAdvanceHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.LEASE_ADVANCE;

  validateParameters(
    parameters: unknown
  ): parameters is LeaseAdvanceParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    if (params.parkId !== undefined && typeof params.parkId !== "string") {
      return false;
    }
    if (params.year !== undefined && typeof params.year !== "number") {
      return false;
    }
    if (params.month !== undefined && typeof params.month !== "number") {
      return false;
    }
    if (params.month !== undefined) {
      const m = params.month as number;
      if (m < 1 || m > 12 || !Number.isInteger(m)) {
        return false;
      }
    }
    if (
      params.taxType !== undefined &&
      !["STANDARD", "REDUCED", "EXEMPT"].includes(params.taxType as string)
    ) {
      return false;
    }
    if (params.dueDays !== undefined && typeof params.dueDays !== "number") {
      return false;
    }

    return true;
  }

  async preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]> {
    const params = parameters as LeaseAdvanceParameters;
    const results: InvoiceCreationResult[] = [];

    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month || now.getMonth() + 1;

    const leases = await loadActiveLeases(tenantId, params.parkId);

    for (const lease of leases) {
      const park = lease.leasePlots[0]?.plot?.park || null;
      const recipientName =
        lease.lessor.companyName ||
        `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();

      // Check proration
      const prorationFactor = calculateProrationFactor(
        year,
        month,
        lease.startDate,
        lease.endDate
      );

      if (prorationFactor <= 0) {
        results.push({
          success: false,
          recipientName,
          amount: 0,
          error: "Pachtvertrag nicht aktiv in diesem Monat",
        });
        continue;
      }

      // Check for duplicates
      const isDuplicate = await advanceAlreadyExists(
        tenantId,
        lease.id,
        year,
        month
      );
      if (isDuplicate) {
        results.push({
          success: false,
          recipientName,
          amount: 0,
          error: `Vorschuss fuer ${MONTH_NAMES[month - 1]} ${year} bereits erstellt`,
        });
        continue;
      }

      // Calculate amount
      const normalizedLeasePlots = normalizeLeasePlots(lease.leasePlots);
      const normalizedPark = normalizePark(park);

      const fullMonthAmount = calculateLeaseAmount(
        { id: lease.id, leasePlots: normalizedLeasePlots },
        normalizedPark,
        true // useMinimumRent for advances
      );

      const amount = round2(fullMonthAmount * prorationFactor);

      if (amount <= 0) {
        results.push({
          success: false,
          recipientName,
          amount: 0,
          error: "Berechneter Betrag ist 0 oder negativ",
        });
        continue;
      }

      // Plot description for context
      const plotDesc = buildPlotDescription(lease.leasePlots);
      const isPartial = prorationFactor < 1;

      results.push({
        success: true,
        recipientName,
        amount,
      });
    }

    return results;
  }

  async execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult> {
    const params = parameters as LeaseAdvanceParameters;
    const invoiceResults: InvoiceCreationResult[] = [];

    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month || now.getMonth() + 1;
    const taxType = params.taxType || "EXEMPT"; // Pacht is typically tax-exempt
    const tenantSettings = await getTenantSettings(tenantId);
    const dueDays = params.dueDays || tenantSettings.paymentTermDays;

    // Dry-Run: Only preview
    if (options.dryRun) {
      const preview = await this.preview(tenantId, parameters);
      const successful = preview.filter((r) => r.success);
      const totalAmount = successful.reduce(
        (sum, r) => sum + (r.amount || 0),
        0
      );

      return {
        status: preview.every((r) => r.success) ? "success" : "partial",
        invoicesCreated: 0,
        totalAmount,
        details: {
          invoices: preview,
          summary: {
            totalProcessed: preview.length,
            successful: successful.length,
            failed: preview.filter((r) => !r.success).length,
            skipped: 0,
          },
          metadata: {
            year,
            month,
            monthName: MONTH_NAMES[month - 1],
            isDryRun: true,
          },
        },
      };
    }

    // Load leases
    const leases = await loadActiveLeases(tenantId, params.parkId);

    // Count how many invoices we will actually create (for batch number generation)
    const leasesToProcess: typeof leases = [];
    const skippedLeases: Array<{ lease: (typeof leases)[0]; reason: string }> =
      [];

    for (const lease of leases) {
      const prorationFactor = calculateProrationFactor(
        year,
        month,
        lease.startDate,
        lease.endDate
      );

      if (prorationFactor <= 0) {
        skippedLeases.push({
          lease,
          reason: "Pachtvertrag nicht aktiv in diesem Monat",
        });
        continue;
      }

      const isDuplicate = await advanceAlreadyExists(
        tenantId,
        lease.id,
        year,
        month
      );
      if (isDuplicate) {
        skippedLeases.push({
          lease,
          reason: `Vorschuss fuer ${MONTH_NAMES[month - 1]} ${year} bereits erstellt`,
        });
        continue;
      }

      leasesToProcess.push(lease);
    }

    // Add skipped results
    for (const { lease, reason } of skippedLeases) {
      const recipientName =
        lease.lessor.companyName ||
        `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();
      invoiceResults.push({
        success: false,
        recipientName,
        amount: 0,
        error: reason,
      });
    }

    if (leasesToProcess.length === 0) {
      const successful = invoiceResults.filter((r) => r.success);
      return {
        status: invoiceResults.length === 0 ? "success" : "partial",
        invoicesCreated: 0,
        totalAmount: 0,
        details: {
          invoices: invoiceResults,
          summary: {
            totalProcessed: invoiceResults.length,
            successful: 0,
            failed: invoiceResults.filter((r) => !r.success && r.error !== undefined).length,
            skipped: invoiceResults.length,
          },
          metadata: { year, month, monthName: MONTH_NAMES[month - 1] },
        },
      };
    }

    // Batch-generate invoice numbers for efficiency
    const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
      tenantId,
      InvoiceType.CREDIT_NOTE,
      leasesToProcess.length
    );

    let totalAmount = 0;
    let numberIndex = 0;

    // Create credit notes in a transaction
    await prisma.$transaction(async (tx) => {
      for (const lease of leasesToProcess) {
        try {
          const park = lease.leasePlots[0]?.plot?.park || null;

          const prorationFactor = calculateProrationFactor(
            year,
            month,
            lease.startDate,
            lease.endDate
          );

          const normalizedLeasePlots = normalizeLeasePlots(lease.leasePlots);
          const normalizedPark = normalizePark(park);

          const fullMonthAmount = calculateLeaseAmount(
            { id: lease.id, leasePlots: normalizedLeasePlots },
            normalizedPark,
            true
          );

          const amount = round2(fullMonthAmount * prorationFactor);

          if (amount <= 0) {
            const recipientName =
              lease.lessor.companyName ||
              `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();
            invoiceResults.push({
              success: false,
              recipientName,
              amount: 0,
              error: "Berechneter Betrag ist 0 oder negativ",
            });
            // Skip this number - we already allocated it
            numberIndex++;
            continue;
          }

          const isPartialMonth = prorationFactor < 1;

          // Recipient info
          const recipientName =
            lease.lessor.companyName ||
            `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();
          const recipientAddress = [
            lease.lessor.street,
            `${lease.lessor.postalCode || ""} ${lease.lessor.city || ""}`.trim(),
          ]
            .filter(Boolean)
            .join("\n");

          // Service period
          const monthFirstDay = new Date(year, month - 1, 1);
          const monthLastDay = new Date(year, month, 0);
          const serviceStartDate =
            lease.startDate > monthFirstDay ? lease.startDate : monthFirstDay;
          const serviceEndDate =
            lease.endDate && lease.endDate < monthLastDay
              ? lease.endDate
              : monthLastDay;

          // Invoice number from batch
          const invoiceNumber = invoiceNumbers[numberIndex++];

          // Tax calculation
          const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
            amount,
            taxType
          );

          // Build description
          const plotDesc = buildPlotDescription(lease.leasePlots);
          const baseDescription = `Pacht-Vorschuss ${MONTH_NAMES[month - 1]} ${year}`;
          const description = isPartialMonth
            ? `${baseDescription} (Teilmonat, ${Math.round(prorationFactor * 100)}%)`
            : baseDescription;
          const plotLine = plotDesc ? `\n${plotDesc}` : "";

          // Internal reference for duplicate detection
          const internalReference = `PV-${year}-${month.toString().padStart(2, "0")}-${lease.id.slice(0, 8)}`;

          // Create credit note
          const invoice = await tx.invoice.create({
            data: {
              invoiceType: InvoiceType.CREDIT_NOTE,
              invoiceNumber,
              invoiceDate: new Date(),
              dueDate: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
              recipientType: "lessor",
              recipientName,
              recipientAddress,
              serviceStartDate,
              serviceEndDate,
              paymentReference: `Pacht-Vorschuss ${MONTH_NAMES[month - 1]} ${year}`,
              internalReference,
              netAmount: new Decimal(amount),
              taxRate: new Decimal(taxRate),
              taxAmount: new Decimal(taxAmount),
              grossAmount: new Decimal(grossAmount),
              status: "DRAFT",
              tenantId,
              leaseId: lease.id,
              parkId: park?.id,
              items: {
                create: [
                  {
                    position: 1,
                    description: `${description}${plotLine}`,
                    quantity: new Decimal(1),
                    unit: "pauschal",
                    unitPrice: new Decimal(amount),
                    netAmount: new Decimal(amount),
                    taxType: taxType as TaxType,
                    taxRate: new Decimal(taxRate),
                    taxAmount: new Decimal(taxAmount),
                    grossAmount: new Decimal(grossAmount),
                    referenceType: "LEASE_ADVANCE",
                    referenceId: lease.id,
                  },
                ],
              },
            },
          });

          totalAmount += grossAmount;

          invoiceResults.push({
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            recipientName,
            amount: grossAmount,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unbekannter Fehler";
          const recipientName =
            lease.lessor.companyName ||
            `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();
          invoiceResults.push({
            success: false,
            recipientName,
            error: errorMessage,
          });
          numberIndex++;
        }
      }
    });

    const successful = invoiceResults.filter((r) => r.success);
    const failed = invoiceResults.filter((r) => !r.success);

    let status: "success" | "failed" | "partial";
    if (failed.length === 0) {
      status = "success";
    } else if (successful.length === 0) {
      status = "failed";
    } else {
      status = "partial";
    }

    return {
      status,
      invoicesCreated: successful.length,
      totalAmount,
      errorMessage:
        failed.length > 0
          ? `${failed.length} Gutschriften konnten nicht erstellt werden`
          : undefined,
      details: {
        invoices: invoiceResults,
        summary: {
          totalProcessed: invoiceResults.length,
          successful: successful.length,
          failed: failed.filter((r) => r.error && !r.error.includes("bereits erstellt")).length,
          skipped: failed.filter((r) => r.error?.includes("bereits erstellt")).length,
        },
        metadata: {
          year,
          month,
          monthName: MONTH_NAMES[month - 1],
        },
      },
    };
  }
}

export const leaseAdvanceHandler = new LeaseAdvanceHandler();
