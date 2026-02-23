// Management Billing Calculator
// Calculates fee amounts based on settlement revenue data and stakeholder fee terms.
// Supports both preview (calculate only) and persist (calculate + save) modes.

import { prisma } from "@/lib/prisma";
import { getClientSettlementData } from "./cross-tenant-access";
import { resolveFeePercentage } from "./fee-resolver";
import type {
  ManagementBillingInput,
  ManagementBillingResult,
  ManagementBillingDetail,
} from "./types";
import { getTaxRate } from "@/lib/tax/tax-rates";

/**
 * Round a number to 2 decimal places (cents).
 */
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate the management billing for a stakeholder and period.
 * This is a pure calculation -- it does NOT persist any data.
 *
 * @param input - stakeholderId, year, month
 * @returns Calculated billing result with per-fund details
 */
export async function calculateManagementBilling(
  input: ManagementBillingInput
): Promise<ManagementBillingResult> {
  const { stakeholderId, year, month } = input;

  // 1. Load stakeholder to get tax type and billing configuration
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id: stakeholderId },
    select: {
      id: true,
      billingEnabled: true,
      taxType: true,
      stakeholderTenantId: true,
    },
  });

  if (!stakeholder) {
    throw new Error("Stakeholder nicht gefunden");
  }

  if (!stakeholder.billingEnabled) {
    throw new Error("Abrechnung fuer diesen Stakeholder nicht aktiviert");
  }

  // 2. Get settlement data from client tenant
  const settlementData = await getClientSettlementData(
    stakeholderId,
    year,
    month
  );

  // 3. Resolve fee percentage for this period (checks history first)
  const feePercentage = await resolveFeePercentage(stakeholderId, year, month);

  if (feePercentage <= 0) {
    throw new Error("Kein gueltiger Gebuehrensatz konfiguriert");
  }

  // 4. Calculate per-fund details
  const details: ManagementBillingDetail[] = [];
  let totalBaseRevenue = 0;

  for (const settlement of settlementData.settlements) {
    for (const item of settlement.items) {
      const feeEur = (item.revenueShareEur * feePercentage) / 100;
      details.push({
        fundId: item.recipientFundId,
        fundName: item.fundName,
        productionKwh: item.productionShareKwh,
        revenueEur: item.revenueShareEur,
        feeEur: roundToCents(feeEur),
      });
      totalBaseRevenue += item.revenueShareEur;
    }
  }

  // 5. Calculate totals with proper rounding
  const feeAmountNet = roundToCents(
    (totalBaseRevenue * feePercentage) / 100
  );
  // Use DB-backed tax rate lookup with reference date from billing period
  const referenceDate = new Date(year, month ? month - 1 : 0, 1);
  const taxRate = await getTaxRate(
    stakeholder.stakeholderTenantId,
    stakeholder.taxType || "STANDARD",
    referenceDate
  );
  const taxAmount = roundToCents((feeAmountNet * taxRate) / 100);
  const feeAmountGross = roundToCents(feeAmountNet + taxAmount);

  return {
    baseRevenueEur: roundToCents(totalBaseRevenue),
    feePercentage,
    feeAmountNet,
    taxRate,
    taxAmount,
    feeAmountGross,
    details,
  };
}

/**
 * Calculate and persist a ManagementBilling record.
 * Uses findFirst + create/update instead of upsert because the composite
 * unique constraint [stakeholderId, year, month] contains a nullable field (month).
 * Prisma's upsert does not support nullable fields in composite where clauses.
 *
 * @param input - stakeholderId, year, month
 * @returns The persisted billing ID and calculation result
 */
export async function calculateAndSaveBilling(
  input: ManagementBillingInput
): Promise<{ id: string; result: ManagementBillingResult }> {
  const result = await calculateManagementBilling(input);

  // Build the where clause for finding an existing billing record.
  // month can be null (annual billing), so we handle it explicitly.
  const existingBilling = await prisma.managementBilling.findFirst({
    where: {
      stakeholderId: input.stakeholderId,
      year: input.year,
      month: input.month ?? null,
    },
    select: { id: true },
  });

  const billingData = {
    baseRevenueEur: result.baseRevenueEur,
    feePercentageUsed: result.feePercentage,
    feeAmountNetEur: result.feeAmountNet,
    taxRate: result.taxRate,
    taxAmountEur: result.taxAmount,
    feeAmountGrossEur: result.feeAmountGross,
    calculationDetails: result.details as unknown as Record<string, unknown>[],
    status: "CALCULATED" as const,
  };

  let billing;

  if (existingBilling) {
    // Update existing record, reset invoice link on recalculation
    billing = await prisma.managementBilling.update({
      where: { id: existingBilling.id },
      data: {
        ...billingData,
        invoiceId: null,
      },
    });
  } else {
    // Create new record
    billing = await prisma.managementBilling.create({
      data: {
        stakeholderId: input.stakeholderId,
        year: input.year,
        month: input.month,
        ...billingData,
      },
    });
  }

  return { id: billing.id, result };
}
