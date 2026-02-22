import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { executeSettlementCalculation } from "@/lib/lease-revenue/calculator";
import { getIntervalDivisor } from "@/types/billing";

// =============================================================================
// POST /api/leases/settlement/[id]/calculate - Execute settlement calculation
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Read optional body parameters (e.g. manual revenue from wizard)
    let manualRevenueEur: number | undefined;
    let revenueSources: Array<{ category: string; productionKwh: number; revenueEur: number }> | undefined;
    try {
      const body = await request.json();
      if (body.totalRevenue != null && Number(body.totalRevenue) > 0) {
        manualRevenueEur = Number(body.totalRevenue);
      }
      if (Array.isArray(body.revenueSources) && body.revenueSources.length > 0) {
        revenueSources = body.revenueSources.map((s: Record<string, unknown>) => ({
          category: String(s.category || ""),
          productionKwh: Number(s.productionKwh || 0),
          revenueEur: Number(s.revenueEur || 0),
        })).filter((s: { revenueEur: number }) => s.revenueEur > 0);
      }
    } catch {
      // No body or invalid JSON — that's fine, proceed without manual revenue
    }

    const calcOptions: { manualRevenueEur?: number; revenueSources?: typeof revenueSources } = {};
    if (manualRevenueEur != null) calcOptions.manualRevenueEur = manualRevenueEur;
    if (revenueSources && revenueSources.length > 0) calcOptions.revenueSources = revenueSources;

    const { settlement, calculation } = await executeSettlementCalculation(
      check.tenantId!,
      id,
      check.userId,
      Object.keys(calcOptions).length > 0 ? calcOptions : undefined
    );

    // Build wizard-compatible response by enriching calculation with display data
    const enriched = await buildWizardResponse(id, settlement, calculation);

    return NextResponse.json(
      serializePrisma({
        settlement,
        calculation: enriched,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    // Business logic errors (missing config, wrong status, etc.)
    if (
      message.includes("nicht gefunden") ||
      message.includes("fehlt") ||
      message.includes("nicht berechnet") ||
      message.includes("konfiguriert") ||
      message.includes("Status")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error(
      { err: error },
      "Error calculating lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler bei der Berechnung des Nutzungsentgelts" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Transform internal calculation result to wizard-compatible format
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildWizardResponse(settlementId: string, settlement: any, calc: any) {
  // Load the full settlement with items and related data for display names
  const full = await prisma.leaseRevenueSettlement.findUnique({
    where: { id: settlementId },
    include: {
      park: { select: { id: true, name: true } },
      items: {
        include: {
          lessorPerson: {
            select: { id: true, firstName: true, lastName: true, companyName: true },
          },
          lease: {
            select: {
              id: true,
              leasePlots: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!full) return calc;

  const periodType = full.periodType || "FINAL";
  const parkName = full.park?.name || "";

  if (periodType === "ADVANCE") {
    // ADVANCE wizard format
    const divisor = getIntervalDivisor(full.advanceInterval);
    const leases = full.items.map((item) => {
      const name = item.lessorPerson?.companyName
        || [item.lessorPerson?.firstName, item.lessorPerson?.lastName].filter(Boolean).join(" ")
        || "Unbekannt";
      return {
        leaseId: item.leaseId,
        lessorId: item.lessorPersonId,
        lessorName: name,
        lessorAddress: null,
        monthlyMinimumRent: Number(item.subtotalEur),
        plotCount: item.lease?.leasePlots?.length || 0,
      };
    });

    return {
      parkId: full.parkId,
      parkName,
      year: full.year,
      month: full.month || 1,
      periodType: "ADVANCE" as const,
      calculatedAt: new Date().toISOString(),
      minimumRentPerTurbine: calc.minimumGuaranteeEur
        ? Number(calc.minimumGuaranteeEur) / (full.totalWEACount || 1) * divisor
        : null,
      leases,
      totals: {
        leaseCount: leases.length,
        totalMonthlyMinimumRent: leases.reduce((sum, l) => sum + l.monthlyMinimumRent, 0),
      },
    };
  }

  // FINAL wizard format
  const leases = full.items.map((item) => {
    const name = item.lessorPerson?.companyName
      || [item.lessorPerson?.firstName, item.lessorPerson?.lastName].filter(Boolean).join(" ")
      || "Unbekannt";
    const totalAmount = Number(item.subtotalEur);
    const advancePaid = Number(item.advancePaidEur);
    const finalPayment = totalAmount - advancePaid;

    return {
      leaseId: item.leaseId,
      lessorId: item.lessorPersonId,
      lessorName: name,
      lessorAddress: null,
      totalMinimumRent: Number(calc.minimumGuaranteeEur) > 0
        ? (Number(calc.minimumGuaranteeEur) / full.items.length)
        : 0,
      totalRevenueShare: Number(calc.calculatedFeeEur) > 0
        ? (Number(calc.calculatedFeeEur) / full.items.length)
        : 0,
      alreadyPaidAdvances: advancePaid,
      finalPayment,
      isCredit: finalPayment < 0,
    };
  });

  return {
    parkId: full.parkId,
    parkName,
    year: full.year,
    periodType: "FINAL" as const,
    calculatedAt: new Date().toISOString(),
    totalRevenue: Number(full.totalParkRevenueEur),
    revenuePhasePercentage: Number(full.revenueSharePercent) || null,
    leases,
    totals: {
      leaseCount: leases.length,
      totalMinimumRent: Number(full.minimumGuaranteeEur),
      totalRevenueShare: Number(full.calculatedFeeEur),
      totalAdvancesPaid: leases.reduce((sum, l) => sum + l.alreadyPaidAdvances, 0),
      totalFinalPayment: leases.reduce((sum, l) => sum + l.finalPayment, 0),
    },
  };
}
