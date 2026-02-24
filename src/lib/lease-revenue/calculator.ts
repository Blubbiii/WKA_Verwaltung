/**
 * Lease Revenue Calculator - Nutzungsentgelt-Berechnungslogik
 *
 * Core calculation engine for Nutzungsentgelt (lease revenue settlement)
 * in a wind park management system.
 *
 * Business Logic:
 * 1. Sum all EnergySettlement revenues for the park and year
 * 2. Look up revenue share percentage from ParkRevenuePhase (based on years since commissioning)
 * 3. Calculate: calculatedFee = totalRevenue x revenueSharePercent / 100
 * 4. Apply minimum guarantee: actualFee = MAX(calculatedFee, minimumRentPerTurbine x totalWEACount)
 * 5. Split into WEA-Standort share (e.g. 10%) and Pool/Flaechen share (e.g. 90%)
 * 6. Distribute to individual landowners based on their plot areas and turbine counts
 * 7. Add surcharges (sealed area, road usage, cable)
 * 8. Split into taxable (pool share -> MwSt via TaxRateConfig) and exempt (standort + sealed + road + cable -> §4 Nr.12 UStG)
 */

import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import type {
  SettlementCalculationInput,
  SettlementCalculationResult,
} from "@/types/billing";
import { getIntervalDivisor } from "@/types/billing";

// ============================================================
// Pure Calculation Functions (no Prisma dependency)
// ============================================================

/**
 * Determine the active revenue phase for a given year.
 * Revenue phases define the percentage of park revenue that goes to landowners.
 * The phase is determined by the number of years in operation (relative to commissioning year).
 */
export function getActiveRevenuePhase(
  revenuePhases: {
    startYear: number;
    endYear: number | null;
    revenueSharePercentage: number;
  }[],
  commissioningYear: number,
  settlementYear: number
): { revenueSharePercentage: number } | null {
  const yearsInOperation = settlementYear - commissioningYear + 1;
  return (
    revenuePhases.find(
      (p) =>
        yearsInOperation >= p.startYear &&
        (p.endYear === null || yearsInOperation <= p.endYear)
    ) ?? null
  );
}

/**
 * Core settlement calculation - pure function, no DB dependency.
 * Takes all inputs and returns the complete calculation result.
 *
 * Steps:
 * 1. Revenue-based fee = totalParkRevenueEur * revenueSharePercent / 100
 * 2. Minimum guarantee = minimumRentPerTurbine * totalWEACount
 * 3. Actual fee = MAX(calculated, minimum)
 * 4. Split into WEA-Standort and Pool shares
 * 5. Distribute to individual leases (pool: proportional to area, standort: proportional to turbines)
 * 6. Add surcharges (sealed area, road, cable)
 * 7. Tax split: pool share is taxable (MwSt), everything else is exempt (§4 Nr.12 UStG)
 */
export function calculateSettlementFees(
  input: SettlementCalculationInput
): SettlementCalculationResult {
  const {
    totalParkRevenueEur,
    revenueSharePercent,
    minimumRentPerTurbine,
    weaSharePercentage,
    poolSharePercentage,
    totalWEACount,
    totalPoolAreaSqm,
    leases,
  } = input;

  // Step 1: Revenue-based fee
  const calculatedFeeEur = round2(
    (totalParkRevenueEur * revenueSharePercent) / 100
  );

  // Step 2: Minimum guarantee
  const minimumGuaranteeEur = round2(minimumRentPerTurbine * totalWEACount);

  // Step 3: Actual fee = MAX(calculated, minimum)
  const actualFeeEur = Math.max(calculatedFeeEur, minimumGuaranteeEur);
  const usedMinimum = minimumGuaranteeEur >= calculatedFeeEur;

  // Step 4: Split into WEA-Standort and Pool shares
  const weaStandortTotalEur = round2(
    (actualFeeEur * weaSharePercentage) / 100
  );
  const poolAreaTotalEur = round2(
    (actualFeeEur * poolSharePercentage) / 100
  );

  // Step 5: Distribute to individual leases
  const items = leases.map((lease) => {
    // Pool area share (proportional to pool area)
    const poolAreaSharePercent =
      totalPoolAreaSqm > 0
        ? round4((lease.poolAreaSqm / totalPoolAreaSqm) * 100)
        : 0;
    const poolFeeEur = round2(
      (poolAreaTotalEur * poolAreaSharePercent) / 100
    );

    // WEA-Standort share (proportional to turbine count)
    const standortFeeEur =
      totalWEACount > 0
        ? round2((weaStandortTotalEur * lease.turbineCount) / totalWEACount)
        : 0;

    // Surcharges
    const sealedAreaFeeEur = round2(
      lease.sealedAreaSqm * lease.sealedAreaRate
    );
    const roadUsageFeeEur = round2(lease.roadUsageFeeEur); // already calculated externally
    const cableFeeEur = round2(lease.cableLengthM * lease.cableRate);

    // Subtotal
    const subtotalEur = round2(
      poolFeeEur +
        standortFeeEur +
        sealedAreaFeeEur +
        roadUsageFeeEur +
        cableFeeEur
    );

    // Tax split: Pool share is taxable (MwSt via TaxRateConfig), everything else is exempt (§4 Nr.12 UStG)
    const taxableAmountEur = round2(poolFeeEur);
    const exemptAmountEur = round2(
      standortFeeEur + sealedAreaFeeEur + roadUsageFeeEur + cableFeeEur
    );

    return {
      leaseId: lease.leaseId,
      lessorPersonId: lease.lessorPersonId,
      poolAreaSqm: lease.poolAreaSqm,
      poolAreaSharePercent,
      poolFeeEur,
      turbineCount: lease.turbineCount,
      standortFeeEur,
      sealedAreaSqm: lease.sealedAreaSqm,
      sealedAreaRate: lease.sealedAreaRate,
      sealedAreaFeeEur,
      roadUsageFeeEur,
      cableFeeEur,
      subtotalEur,
      taxableAmountEur,
      exemptAmountEur,
      directBillingFundId: lease.directBillingFundId,
    };
  });

  return {
    calculatedFeeEur,
    minimumGuaranteeEur,
    actualFeeEur,
    usedMinimum,
    weaStandortTotalEur,
    poolAreaTotalEur,
    items,
  };
}

/**
 * Calculate ADVANCE fees (Vorschuss).
 * Uses only the minimum guarantee as the base, divided by the interval.
 * No revenue data needed.
 */
export function calculateAdvanceFees(
  input: SettlementCalculationInput,
  advanceInterval: string | null
): SettlementCalculationResult {
  const {
    minimumRentPerTurbine,
    weaSharePercentage,
    poolSharePercentage,
    totalWEACount,
    totalPoolAreaSqm,
    leases,
  } = input;

  const divisor = getIntervalDivisor(advanceInterval);

  // Advance is based purely on minimum guarantee
  const yearlyMinimum = round2(minimumRentPerTurbine * totalWEACount);
  const periodAmount = round2(yearlyMinimum / divisor);

  // Split into WEA-Standort and Pool shares (same logic as FINAL)
  const weaStandortTotalEur = round2(
    (periodAmount * weaSharePercentage) / 100
  );
  const poolAreaTotalEur = round2(
    (periodAmount * poolSharePercentage) / 100
  );

  // Distribute to individual leases (same proportional logic)
  const items = leases.map((lease) => {
    const poolAreaSharePercent =
      totalPoolAreaSqm > 0
        ? round4((lease.poolAreaSqm / totalPoolAreaSqm) * 100)
        : 0;
    const poolFeeEur = round2(
      (poolAreaTotalEur * poolAreaSharePercent) / 100
    );

    const standortFeeEur =
      totalWEACount > 0
        ? round2((weaStandortTotalEur * lease.turbineCount) / totalWEACount)
        : 0;

    // Surcharges also divided by interval
    const sealedAreaFeeEur = round2(
      (lease.sealedAreaSqm * lease.sealedAreaRate) / divisor
    );
    const roadUsageFeeEur = round2(lease.roadUsageFeeEur / divisor);
    const cableFeeEur = round2((lease.cableLengthM * lease.cableRate) / divisor);

    const subtotalEur = round2(
      poolFeeEur + standortFeeEur + sealedAreaFeeEur + roadUsageFeeEur + cableFeeEur
    );

    // Tax split: Pool share is taxable, everything else is exempt
    const taxableAmountEur = round2(poolFeeEur);
    const exemptAmountEur = round2(
      standortFeeEur + sealedAreaFeeEur + roadUsageFeeEur + cableFeeEur
    );

    return {
      leaseId: lease.leaseId,
      lessorPersonId: lease.lessorPersonId,
      poolAreaSqm: lease.poolAreaSqm,
      poolAreaSharePercent,
      poolFeeEur,
      turbineCount: lease.turbineCount,
      standortFeeEur,
      sealedAreaSqm: lease.sealedAreaSqm,
      sealedAreaRate: lease.sealedAreaRate,
      sealedAreaFeeEur,
      roadUsageFeeEur,
      cableFeeEur,
      subtotalEur,
      taxableAmountEur,
      exemptAmountEur,
      directBillingFundId: lease.directBillingFundId,
    };
  });

  const actualFeeEur = items.reduce((sum, i) => sum + i.subtotalEur, 0);

  return {
    calculatedFeeEur: 0, // No revenue-based calculation for ADVANCE
    minimumGuaranteeEur: periodAmount,
    actualFeeEur: round2(actualFeeEur),
    usedMinimum: true, // ADVANCE always uses minimum
    weaStandortTotalEur,
    poolAreaTotalEur,
    items,
  };
}

/**
 * Load total advance payments already made for a park+year.
 * Queries LeaseRevenueSettlement records with periodType="ADVANCE".
 * Returns sum per lease for deduction in FINAL settlement.
 */
export async function loadAdvancePaymentsForFinal(
  tenantId: string,
  parkId: string,
  year: number
): Promise<{
  totalPaidAdvances: number;
  perLease: Map<string, number>;
}> {
  const advanceSettlements = await prisma.leaseRevenueSettlement.findMany({
    where: {
      tenantId,
      parkId,
      year,
      periodType: "ADVANCE",
      status: { in: ["CALCULATED", "SETTLED", "ADVANCE_CREATED", "PENDING_REVIEW", "APPROVED", "CLOSED"] },
    },
    include: {
      items: {
        select: { leaseId: true, subtotalEur: true },
      },
    },
  });

  const perLease = new Map<string, number>();
  let totalPaidAdvances = 0;

  for (const settlement of advanceSettlements) {
    for (const item of settlement.items) {
      const amount = Number(item.subtotalEur);
      perLease.set(item.leaseId, (perLease.get(item.leaseId) ?? 0) + amount);
      totalPaidAdvances += amount;
    }
  }

  return { totalPaidAdvances: round2(totalPaidAdvances), perLease };
}

// ============================================================
// Data Loading Functions (Prisma-dependent)
// ============================================================

/**
 * Load all data needed for settlement calculation from the database.
 * Returns a SettlementCalculationInput or throws if data is incomplete.
 *
 * This function:
 * - Loads the park with its configuration, revenue phases, turbines, and plots
 * - Determines the active revenue phase for the given year
 * - Aggregates total park revenue from EnergySettlements
 * - Builds per-lease data from plots and their areas
 */
export async function loadSettlementData(
  tenantId: string,
  parkId: string,
  year: number,
  linkedEnergySettlementId?: string
): Promise<SettlementCalculationInput> {
  // Load park with config and revenue phases
  const park = await prisma.park.findFirst({
    where: { id: parkId, tenantId },
    include: {
      revenuePhases: { orderBy: { phaseNumber: "asc" } },
      turbines: {
        where: { status: "ACTIVE" },
        select: { id: true, designation: true, ratedPowerKw: true },
      },
      plots: {
        where: { status: "ACTIVE" },
        include: {
          plotAreas: true,
          leasePlots: {
            include: {
              lease: {
                include: {
                  lessor: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!park) throw new Error("Park nicht gefunden");
  if (!park.commissioningDate)
    throw new Error("Inbetriebnahmedatum fehlt");
  if (!park.minimumRentPerTurbine)
    throw new Error("Mindestnutzungsentgelt je WEA fehlt");
  if (park.weaSharePercentage == null)
    throw new Error("WEA-Standort-Anteil fehlt");
  if (park.poolSharePercentage == null)
    throw new Error("Pool-Flaechen-Anteil fehlt");

  // Determine revenue phase
  const commissioningYear = park.commissioningDate.getFullYear();
  const activePhase = getActiveRevenuePhase(
    park.revenuePhases.map((p) => ({
      startYear: p.startYear,
      endYear: p.endYear,
      revenueSharePercentage: Number(p.revenueSharePercentage),
    })),
    commissioningYear,
    year
  );

  if (!activePhase)
    throw new Error(`Keine Erlösphase für Jahr ${year} konfiguriert`);

  // Load total park revenue for the year from EnergySettlements
  // If a specific EnergySettlement is linked, use that; otherwise aggregate all
  let totalParkRevenueEur = 0;
  if (linkedEnergySettlementId) {
    const linked = await prisma.energySettlement.findUnique({
      where: { id: linkedEnergySettlementId },
      select: { netOperatorRevenueEur: true },
    });
    totalParkRevenueEur = Number(linked?.netOperatorRevenueEur ?? 0);
  } else {
    const revenueResult = await prisma.energySettlement.aggregate({
      where: {
        parkId,
        tenantId,
        year,
        status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
      },
      _sum: { netOperatorRevenueEur: true },
    });
    totalParkRevenueEur = Number(
      revenueResult._sum.netOperatorRevenueEur ?? 0
    );
  }

  // Aggregate plot data per lease
  // Build a map: leaseId -> { poolAreaSqm, turbineCount, sealedAreaSqm, lessorPersonId, ... }
  const leaseDataMap = new Map<
    string,
    {
      leaseId: string;
      lessorPersonId: string;
      poolAreaSqm: number;
      turbineCount: number;
      sealedAreaSqm: number;
      sealedAreaRate: number;
      roadUsageFeeEur: number;
      cableLengthM: number;
      cableRate: number;
      directBillingFundId: string | null;
    }
  >();

  let totalPoolAreaSqm = 0;
  const totalWEACount = park.turbines.length;

  // Default surcharge rates from park configuration
  const defaultWegRate = Number(park.wegCompensationPerSqm ?? 0);
  const defaultKabelRate = Number(park.kabelCompensationPerM ?? 0);

  for (const plot of park.plots) {
    for (const leasePlot of plot.leasePlots) {
      const lease = leasePlot.lease;
      if (!lease || lease.status !== "ACTIVE") continue;

      const existing = leaseDataMap.get(lease.id) ?? {
        leaseId: lease.id,
        lessorPersonId: lease.lessorId,
        poolAreaSqm: 0,
        turbineCount: 0,
        sealedAreaSqm: 0,
        sealedAreaRate: defaultWegRate,
        roadUsageFeeEur: 0,
        cableLengthM: 0,
        cableRate: defaultKabelRate,
        directBillingFundId: lease.directBillingFundId ?? null,
      };

      // Sum up areas by type from plotAreas
      for (const area of plot.plotAreas) {
        const areaSqm = Number(area.areaSqm ?? 0);

        switch (area.areaType) {
          case "POOL":
            existing.poolAreaSqm += areaSqm;
            totalPoolAreaSqm += areaSqm;
            break;
          case "WEA_STANDORT":
            existing.turbineCount += 1; // count WEA locations
            break;
          case "WEG":
            // Road usage: area * rate
            existing.roadUsageFeeEur += round2(areaSqm * defaultWegRate);
            break;
          case "AUSGLEICH":
            // Compensation area counts towards pool area for distribution
            existing.poolAreaSqm += areaSqm;
            totalPoolAreaSqm += areaSqm;
            break;
          case "KABEL":
            // Cable: use lengthM if available, otherwise areaSqm as proxy
            existing.cableLengthM += Number(area.lengthM ?? areaSqm);
            break;
        }
      }

      leaseDataMap.set(lease.id, existing);
    }
  }

  return {
    parkId,
    year,
    totalParkRevenueEur,
    revenueSharePercent: activePhase.revenueSharePercentage,
    minimumRentPerTurbine: Number(park.minimumRentPerTurbine),
    weaSharePercentage: Number(park.weaSharePercentage),
    poolSharePercentage: Number(park.poolSharePercentage),
    totalWEACount,
    totalPoolAreaSqm: round2(totalPoolAreaSqm),
    leases: Array.from(leaseDataMap.values()),
  };
}

// ============================================================
// Persistence Functions
// ============================================================

/**
 * Execute calculation and save results to DB in a transaction.
 * Creates or updates the LeaseRevenueSettlement and its items.
 *
 * Workflow:
 * 1. Load the settlement record, verify it is in a calculable state
 * 2. Load all calculation input data via loadSettlementData
 * 3. Run the pure calculation via calculateSettlementFees
 * 4. Persist results atomically: update settlement header + recreate items
 */
export async function executeSettlementCalculation(
  tenantId: string,
  settlementId: string,
  userId?: string,
  options?: {
    manualRevenueEur?: number;
    revenueSources?: Array<{ category: string; productionKwh: number; revenueEur: number }>;
    revenueDisplayMode?: "MONTHLY" | "YEARLY";
  }
): Promise<{
  settlement: Awaited<ReturnType<typeof prisma.leaseRevenueSettlement.update>>;
  calculation: SettlementCalculationResult;
}> {
  // Load settlement
  const settlement = await prisma.leaseRevenueSettlement.findFirst({
    where: { id: settlementId, tenantId },
    include: { park: true },
  });

  if (!settlement) throw new Error("Abrechnung nicht gefunden");
  if (settlement.status !== "OPEN" && settlement.status !== "CALCULATED") {
    throw new Error(
      "Abrechnung kann in diesem Status nicht berechnet werden"
    );
  }

  const isAdvance = settlement.periodType === "ADVANCE";

  // Load data and calculate
  const input = await loadSettlementData(
    tenantId,
    settlement.parkId,
    settlement.year,
    settlement.linkedEnergySettlementId ?? undefined
  );

  // Override revenue with manual amount if provided (e.g. from wizard)
  if (options?.manualRevenueEur != null && options.manualRevenueEur > 0) {
    input.totalParkRevenueEur = options.manualRevenueEur;
  }

  // Choose calculation based on period type
  const result = isAdvance
    ? calculateAdvanceFees(input, settlement.advanceInterval)
    : calculateSettlementFees(input);

  // For FINAL: load advance payments and compute per-lease deductions
  let advancePerLease = new Map<string, number>();
  let totalPaidAdvances = 0;
  if (!isAdvance) {
    const advanceData = await loadAdvancePaymentsForFinal(
      tenantId,
      settlement.parkId,
      settlement.year
    );
    advancePerLease = advanceData.perLease;
    totalPaidAdvances = advanceData.totalPaidAdvances;
  }

  // Save in transaction
  const updated = await prisma.$transaction(async (tx) => {
    // Delete existing items
    await tx.leaseRevenueSettlementItem.deleteMany({
      where: { settlementId },
    });

    // Update settlement header
    const updatedSettlement = await tx.leaseRevenueSettlement.update({
      where: { id: settlementId },
      data: {
        totalParkRevenueEur: new Decimal(isAdvance ? 0 : input.totalParkRevenueEur),
        revenueSharePercent: new Decimal(isAdvance ? 0 : input.revenueSharePercent),
        calculatedFeeEur: new Decimal(result.calculatedFeeEur),
        minimumGuaranteeEur: new Decimal(result.minimumGuaranteeEur),
        actualFeeEur: new Decimal(result.actualFeeEur),
        usedMinimum: result.usedMinimum,
        weaStandortTotalEur: new Decimal(result.weaStandortTotalEur),
        poolAreaTotalEur: new Decimal(result.poolAreaTotalEur),
        totalWEACount: input.totalWEACount,
        totalPoolAreaSqm: new Decimal(input.totalPoolAreaSqm),
        status: "CALCULATED",
        calculationDetails: {
          calculatedAt: new Date().toISOString(),
          calculatedBy: userId ?? null,
          periodType: settlement.periodType,
          advanceInterval: settlement.advanceInterval,
          totalPaidAdvances,
          input: {
            totalParkRevenueEur: input.totalParkRevenueEur,
            revenueSharePercent: input.revenueSharePercent,
            minimumRentPerTurbine: input.minimumRentPerTurbine,
            weaSharePercentage: input.weaSharePercentage,
            poolSharePercentage: input.poolSharePercentage,
          },
          ...(options?.revenueSources && options.revenueSources.length > 0
            ? { revenueSources: options.revenueSources }
            : {}),
          revenueDisplayMode: options?.revenueDisplayMode ?? "YEARLY",
        } as Prisma.InputJsonValue,
      },
    });

    // Create items
    for (const item of result.items) {
      const plotSummary = await buildPlotSummary(tx, item.leaseId);

      // For FINAL: deduct advance payments per lease
      const advancePaidEur = !isAdvance
        ? round2(advancePerLease.get(item.leaseId) ?? 0)
        : 0;
      const remainderEur = !isAdvance
        ? round2(Math.max(0, item.subtotalEur - advancePaidEur))
        : 0;

      await tx.leaseRevenueSettlementItem.create({
        data: {
          settlementId,
          leaseId: item.leaseId,
          lessorPersonId: item.lessorPersonId,
          plotSummary: plotSummary as Prisma.InputJsonValue,
          poolAreaSqm: new Decimal(item.poolAreaSqm),
          poolAreaSharePercent: new Decimal(item.poolAreaSharePercent),
          poolFeeEur: new Decimal(item.poolFeeEur),
          turbineCount: item.turbineCount,
          standortFeeEur: new Decimal(item.standortFeeEur),
          sealedAreaSqm: new Decimal(item.sealedAreaSqm),
          sealedAreaRate: new Decimal(item.sealedAreaRate),
          sealedAreaFeeEur: new Decimal(item.sealedAreaFeeEur),
          roadUsageFeeEur: new Decimal(item.roadUsageFeeEur),
          cableFeeEur: new Decimal(item.cableFeeEur),
          subtotalEur: new Decimal(item.subtotalEur),
          taxableAmountEur: new Decimal(item.taxableAmountEur),
          exemptAmountEur: new Decimal(item.exemptAmountEur),
          advancePaidEur: new Decimal(advancePaidEur),
          remainderEur: new Decimal(remainderEur),
          directBillingFundId: item.directBillingFundId,
        },
      });
    }

    return updatedSettlement;
  });

  return { settlement: updated, calculation: result };
}

// ============================================================
// Helper Functions
// ============================================================

/** Round to 2 decimal places (cent precision) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round to 4 decimal places (percentage precision) */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Build a snapshot of plot data for audit trail.
 * This snapshot is stored in the settlement item so that later changes
 * to plot data do not affect the historical calculation.
 */
async function buildPlotSummary(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  leaseId: string
): Promise<unknown[]> {
  const leasePlots = await tx.leasePlot.findMany({
    where: { leaseId },
    include: {
      plot: {
        include: { plotAreas: true },
      },
    },
  });

  return leasePlots.map((lp) => ({
    plotId: lp.plotId,
    plotNumber: lp.plot.plotNumber,
    cadastralDistrict: lp.plot.cadastralDistrict,
    fieldNumber: lp.plot.fieldNumber,
    areaSqm: Number(lp.plot.areaSqm ?? 0),
    turbineCount: lp.plot.plotAreas.filter(
      (a) => a.areaType === "WEA_STANDORT"
    ).length,
    areas: lp.plot.plotAreas.map((a) => ({
      type: a.areaType,
      sqm: Number(a.areaSqm ?? 0),
      lengthM: Number(a.lengthM ?? 0),
    })),
  }));
}

// ============================================================
// Advance Component Breakdown (for FINAL invoice generation)
// ============================================================

/**
 * Per-component breakdown of advance payments for a single lease.
 * Used by generateSettlementInvoices() to create detailed negative
 * deduction positions on the FINAL credit note.
 */
export interface AdvanceComponentBreakdown {
  total: number;
  poolFeeEur: number;
  standortFeeEur: number;
  sealedAreaFeeEur: number;
  roadUsageFeeEur: number;
  cableFeeEur: number;
}

/**
 * Load per-component advance payments for FINAL invoice generation.
 *
 * Unlike loadAdvancePaymentsForFinal() which returns only totals,
 * this function returns the breakdown by cost type (pool, standort,
 * sealed area, road, cable) per lease. This allows the invoice
 * generator to create explicit negative deduction line items.
 *
 * Returns Map<leaseId, AdvanceComponentBreakdown>.
 */
export async function loadAdvanceComponentBreakdown(
  tenantId: string,
  parkId: string,
  year: number
): Promise<Map<string, AdvanceComponentBreakdown>> {
  const advanceSettlements = await prisma.leaseRevenueSettlement.findMany({
    where: {
      tenantId,
      parkId,
      year,
      periodType: "ADVANCE",
      status: {
        in: [
          "CALCULATED",
          "SETTLED",
          "ADVANCE_CREATED",
          "PENDING_REVIEW",
          "APPROVED",
          "CLOSED",
        ],
      },
    },
    include: {
      items: {
        select: {
          leaseId: true,
          subtotalEur: true,
          poolFeeEur: true,
          standortFeeEur: true,
          sealedAreaFeeEur: true,
          roadUsageFeeEur: true,
          cableFeeEur: true,
        },
      },
    },
  });

  const result = new Map<string, AdvanceComponentBreakdown>();

  for (const settlement of advanceSettlements) {
    for (const item of settlement.items) {
      const existing = result.get(item.leaseId) ?? {
        total: 0,
        poolFeeEur: 0,
        standortFeeEur: 0,
        sealedAreaFeeEur: 0,
        roadUsageFeeEur: 0,
        cableFeeEur: 0,
      };
      existing.total += Number(item.subtotalEur);
      existing.poolFeeEur += Number(item.poolFeeEur);
      existing.standortFeeEur += Number(item.standortFeeEur);
      existing.sealedAreaFeeEur += Number(item.sealedAreaFeeEur);
      existing.roadUsageFeeEur += Number(item.roadUsageFeeEur);
      existing.cableFeeEur += Number(item.cableFeeEur);
      result.set(item.leaseId, existing);
    }
  }

  // Round all accumulated values to cent precision
  for (const [key, val] of result) {
    result.set(key, {
      total: round2(val.total),
      poolFeeEur: round2(val.poolFeeEur),
      standortFeeEur: round2(val.standortFeeEur),
      sealedAreaFeeEur: round2(val.sealedAreaFeeEur),
      roadUsageFeeEur: round2(val.roadUsageFeeEur),
      cableFeeEur: round2(val.cableFeeEur),
    });
  }

  return result;
}
