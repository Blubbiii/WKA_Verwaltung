/**
 * Park Cost Allocation Calculator
 *
 * Distributes the total Nutzungsentgelt (lease revenue settlement) costs
 * to the Betreibergesellschaften (operator companies/funds) in a wind park.
 *
 * Business Logic:
 * 1. Load the LeaseRevenueSettlement with all items
 * 2. Determine which operators are in the park (from turbine operator history)
 * 3. Calculate each operator's share based on:
 *    - For DULDUNG turbines: share = operator's DULDUNG turbines / total DULDUNG turbines
 *    - For Wegenutzung: share = operator's total turbines / total turbines in park
 * 4. For each operator, calculate:
 *    - totalAllocatedEur = sum of all cost types x their respective share
 *    - directSettlementEur = sum of items where directBillingFundId matches this operator
 *    - taxableAmountEur = pool share portion (MwSt)
 *    - taxableVatEur = taxableAmountEur x vatRatePercent/100 (from TaxRateConfig)
 *    - exemptAmountEur = standort + sealed + road + cable portion (par.4 Nr.12 UStG)
 *    - netPayableEur = taxableAmountEur + exemptAmountEur - directSettlementEur
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { getTaxRate } from "@/lib/tax/tax-rates";

// ============================================================
// Types
// ============================================================

export interface OperatorShare {
  operatorFundId: string;
  operatorName: string;
  /** Number of turbines this operator has (total) */
  totalTurbineCount: number;
  /** Number of DULDUNG turbines this operator has */
  duldungTurbineCount: number;
  /** Share percentage for revenue-based costs (DULDUNG) */
  duldungSharePercent: number;
  /** Share percentage for road usage (total) */
  totalSharePercent: number;
  /** Human-readable description of allocation basis */
  allocationBasis: string;
}

export interface AllocationResult {
  items: AllocationItemResult[];
  totalUsageFeeEur: number;
  totalTaxableEur: number;
  totalExemptEur: number;
}

export interface AllocationItemResult {
  operatorFundId: string;
  allocationBasis: string;
  allocationSharePercent: number;
  totalAllocatedEur: number;
  directSettlementEur: number;
  taxableAmountEur: number;
  taxableVatEur: number;
  exemptAmountEur: number;
  netPayableEur: number;
}

// ============================================================
// Pure Calculation
// ============================================================

/**
 * Calculate cost allocation across operators.
 * Pure function - no DB dependency.
 */
export function calculateCostAllocation(params: {
  /** Pool share portion subject to MwSt */
  totalTaxableEur: number;
  /** Standort + sealed + road + cable (par.4 Nr.12 UStG exempt) */
  totalExemptEur: number;
  /** Total usage fee = taxable + exempt */
  totalUsageFeeEur: number;
  /** Per-item direct billing: fundId -> total EUR directly settled */
  directBillingByFund: Map<string, number>;
  /** Operator shares (from turbine operator history) */
  operators: OperatorShare[];
  /** Park distribution mode: SMOOTHED/TOLERATED use DULDUNG share, PROPORTIONAL uses total share */
  distributionMode: string;
  /** VAT rate in percent (e.g. 19 for 19%). Loaded from TaxRateConfig. */
  vatRatePercent: number;
}): AllocationResult {
  const {
    totalTaxableEur,
    totalExemptEur,
    totalUsageFeeEur,
    directBillingByFund,
    operators,
    distributionMode,
    vatRatePercent,
  } = params;

  const items = operators.map((op) => {
    // Use DULDUNG share for revenue-dependent costs, total share for road usage
    const useDuldung = distributionMode !== "PROPORTIONAL";
    const sharePercent = useDuldung
      ? op.duldungSharePercent
      : op.totalSharePercent;

    const taxableAmountEur = round2((totalTaxableEur * sharePercent) / 100);
    const exemptAmountEur = round2((totalExemptEur * sharePercent) / 100);
    const totalAllocatedEur = round2(taxableAmountEur + exemptAmountEur);
    const directSettlementEur = round2(
      directBillingByFund.get(op.operatorFundId) ?? 0
    );
    const taxableVatEur = round2(taxableAmountEur * (vatRatePercent / 100));
    const netPayableEur = round2(totalAllocatedEur - directSettlementEur);

    return {
      operatorFundId: op.operatorFundId,
      allocationBasis: op.allocationBasis,
      allocationSharePercent: round4(sharePercent),
      totalAllocatedEur,
      directSettlementEur,
      taxableAmountEur,
      taxableVatEur,
      exemptAmountEur,
      netPayableEur,
    };
  });

  return { items, totalUsageFeeEur, totalTaxableEur, totalExemptEur };
}

// ============================================================
// Data Loading
// ============================================================

/**
 * Load operator shares from turbine operator history.
 * Returns which operators have how many turbines (total and DULDUNG).
 */
export async function loadOperatorShares(
  tenantId: string,
  parkId: string,
  year: number
): Promise<OperatorShare[]> {
  // Load park with turbines and their current operators
  const park = await prisma.park.findFirst({
    where: { id: parkId, tenantId },
    include: {
      turbines: {
        where: { status: "ACTIVE" },
        include: {
          operatorHistory: {
            where: {
              status: "ACTIVE",
              validFrom: { lte: new Date(`${year}-12-31`) },
              OR: [
                { validTo: null },
                { validTo: { gt: new Date(`${year}-01-01`) } },
              ],
            },
            include: {
              operatorFund: {
                select: { id: true, name: true, legalForm: true },
              },
            },
          },
        },
      },
    },
  });

  if (!park) throw new Error("Park nicht gefunden");

  // Determine distribution mode for DULDUNG logic
  const distributionMode = park.defaultDistributionMode;
  const isDuldung =
    distributionMode === "SMOOTHED" || distributionMode === "TOLERATED";

  // Group by operator
  const operatorMap = new Map<string, OperatorShare>();
  const totalTurbines = park.turbines.length;

  for (const turbine of park.turbines) {
    const activeOperator = turbine.operatorHistory[0];
    if (!activeOperator?.operatorFund) continue;

    const fundId = activeOperator.operatorFund.id;
    const existing = operatorMap.get(fundId) ?? {
      operatorFundId: fundId,
      operatorName: `${activeOperator.operatorFund.name}${activeOperator.operatorFund.legalForm ? ` ${activeOperator.operatorFund.legalForm}` : ""}`,
      totalTurbineCount: 0,
      duldungTurbineCount: 0,
      duldungSharePercent: 0,
      totalSharePercent: 0,
      allocationBasis: "",
    };

    existing.totalTurbineCount += 1;
    if (isDuldung) {
      existing.duldungTurbineCount += 1;
    }

    operatorMap.set(fundId, existing);
  }

  // Calculate shares
  const totalDuldungTurbines = isDuldung
    ? Array.from(operatorMap.values()).reduce(
        (sum, op) => sum + op.duldungTurbineCount,
        0
      )
    : totalTurbines;

  for (const op of operatorMap.values()) {
    op.totalSharePercent =
      totalTurbines > 0
        ? round4((op.totalTurbineCount / totalTurbines) * 100)
        : 0;
    op.duldungSharePercent =
      totalDuldungTurbines > 0
        ? round4((op.duldungTurbineCount / totalDuldungTurbines) * 100)
        : 0;
    op.allocationBasis = isDuldung
      ? `${op.duldungTurbineCount}/${totalDuldungTurbines} (${totalDuldungTurbines} WEA DULDUNG)`
      : `${op.totalTurbineCount}/${totalTurbines} (${totalTurbines} WEA gesamt)`;
  }

  return Array.from(operatorMap.values());
}

// ============================================================
// Persistence
// ============================================================

/**
 * Create a cost allocation from a settlement and save to DB.
 *
 * Loads the LeaseRevenueSettlement, calculates operator shares,
 * computes the allocation, and persists via transaction.
 */
export async function executeCostAllocation(
  tenantId: string,
  leaseRevenueSettlementId: string,
  periodLabel?: string,
  notes?: string
): Promise<{ allocation: { id: string }; result: AllocationResult }> {
  // Load settlement with items and park
  const settlement = await prisma.leaseRevenueSettlement.findFirst({
    where: { id: leaseRevenueSettlementId, tenantId },
    include: {
      park: true,
      items: true,
    },
  });

  if (!settlement) throw new Error("Abrechnung nicht gefunden");
  if (
    settlement.status !== "CALCULATED" &&
    settlement.status !== "SETTLED" &&
    settlement.status !== "ADVANCE_CREATED"
  ) {
    throw new Error("Abrechnung muss zuerst berechnet sein");
  }

  // Sum up taxable and exempt totals from items
  const totalTaxableEur = settlement.items.reduce(
    (sum, item) => sum + Number(item.taxableAmountEur),
    0
  );
  const totalExemptEur = settlement.items.reduce(
    (sum, item) => sum + Number(item.exemptAmountEur),
    0
  );
  const totalUsageFeeEur = round2(totalTaxableEur + totalExemptEur);

  // Build direct billing map: fundId -> total EUR directly settled
  const directBillingByFund = new Map<string, number>();
  for (const item of settlement.items) {
    if (item.directBillingFundId) {
      const current =
        directBillingByFund.get(item.directBillingFundId) ?? 0;
      directBillingByFund.set(
        item.directBillingFundId,
        current + Number(item.subtotalEur)
      );
    }
  }

  // Load operator shares from turbine operator history
  const operators = await loadOperatorShares(
    tenantId,
    settlement.parkId,
    settlement.year
  );
  if (operators.length === 0)
    throw new Error("Keine Betreibergesellschaften gefunden");

  // Load VAT rate from centralized tax config
  const referenceDate = new Date(`${settlement.year}-01-01`);
  const vatRatePercent = await getTaxRate(tenantId, "STANDARD", referenceDate);

  // Calculate allocation
  const result = calculateCostAllocation({
    totalTaxableEur: round2(totalTaxableEur),
    totalExemptEur: round2(totalExemptEur),
    totalUsageFeeEur,
    directBillingByFund,
    operators,
    distributionMode: settlement.park.defaultDistributionMode,
    vatRatePercent,
  });

  // Save in transaction for atomicity
  const allocation = await prisma.$transaction(async (tx) => {
    const created = await tx.parkCostAllocation.create({
      data: {
        tenantId,
        leaseRevenueSettlementId,
        status: "DRAFT",
        totalUsageFeeEur: new Decimal(totalUsageFeeEur),
        totalTaxableEur: new Decimal(round2(totalTaxableEur)),
        totalExemptEur: new Decimal(round2(totalExemptEur)),
        periodLabel: periodLabel ?? `Nutzungsentgelt ${settlement.year}`,
        notes,
      },
    });

    for (const item of result.items) {
      await tx.parkCostAllocationItem.create({
        data: {
          allocationId: created.id,
          operatorFundId: item.operatorFundId,
          allocationBasis: item.allocationBasis,
          allocationSharePercent: new Decimal(item.allocationSharePercent),
          totalAllocatedEur: new Decimal(item.totalAllocatedEur),
          directSettlementEur: new Decimal(item.directSettlementEur),
          taxableAmountEur: new Decimal(item.taxableAmountEur),
          taxableVatEur: new Decimal(item.taxableVatEur),
          exemptAmountEur: new Decimal(item.exemptAmountEur),
          netPayableEur: new Decimal(item.netPayableEur),
        },
      });
    }

    return created;
  });

  return { allocation: { id: allocation.id }, result };
}

// ============================================================
// Helpers
// ============================================================

/** Round to 2 decimal places (for EUR currency amounts) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round to 4 decimal places (for share percentages) */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
