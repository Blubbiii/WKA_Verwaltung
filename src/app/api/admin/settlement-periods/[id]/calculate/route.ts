import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { apiLogger as logger } from "@/lib/logger";
import {
  calculateSettlement,
  calculateMonthlyAdvance,
} from "@/lib/settlement";

const calculateSchema = z.object({
  totalRevenue: z.number().optional(), // Optional: Überschreibt Period.totalRevenue
  saveResult: z.boolean().default(true), // Ergebnis in Period speichern?
});

// Typ für ADVANCE Berechnung wird aus Calculator importiert (MonthlyAdvanceResult)

// Typ für FINAL Berechnung (Jahresendabrechnung mit Verrechnung)
interface FinalCalculationResult {
  parkId: string;
  parkName: string;
  year: number;
  periodType: "FINAL";
  calculatedAt: Date;
  totalRevenue: number;
  revenuePhasePercentage: number | null;
  leases: Array<{
    leaseId: string;
    lessorId: string;
    lessorName: string;
    lessorAddress: string | null;
    totalMinimumRent: number;
    totalRevenueShare: number;
    alreadyPaidAdvances: number;
    finalPayment: number; // MAX(revenueShare, minimumRent) - alreadyPaidAdvances
    isCredit: boolean; // true wenn finalPayment > 0 (Nachzahlung)
  }>;
  totals: {
    leaseCount: number;
    totalMinimumRent: number;
    totalRevenueShare: number;
    totalAdvancesPaid: number;
    totalFinalPayment: number;
  };
}

// POST /api/admin/settlement-periods/[id]/calculate - Berechne Abrechnungsbetraege
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Parse optional body
    let options: { totalRevenue: number | undefined; saveResult: boolean } = {
      totalRevenue: undefined,
      saveResult: true,
    };
    try {
      const body = await request.json();
      const parsed = calculateSchema.parse(body);
      options = {
        totalRevenue: parsed.totalRevenue,
        saveResult: parsed.saveResult,
      };
    } catch {
      // Leerer Body ist OK
    }

    // Hole Periode mit Park
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            minimumRentPerTurbine: true,
            weaSharePercentage: true,
            poolSharePercentage: true,
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
        { error: "Geschlossene Perioden können nicht neu berechnet werden" },
        { status: 400 }
      );
    }

    // Unterscheide zwischen ADVANCE und FINAL
    if (period.periodType === "ADVANCE") {
      // ADVANCE: Vorschuss-Pachtzahlungen (shared Calculator)
      const interval = (period.advanceInterval as "YEARLY" | "QUARTERLY" | "MONTHLY") || "MONTHLY";
      const advanceResult = await calculateMonthlyAdvance({
        parkId: period.parkId,
        year: period.year,
        month: period.month ?? 1,
        tenantId: check.tenantId!,
      });

      // Scale amounts by interval factor and map to wizard-expected field names
      const scaleFactor = interval === "YEARLY" ? 12 : interval === "QUARTERLY" ? 3 : 1;
      const scaledResult = {
        parkId: advanceResult.parkId,
        parkName: advanceResult.parkName,
        year: advanceResult.year,
        month: advanceResult.month,
        periodType: advanceResult.periodType,
        calculatedAt: advanceResult.calculatedAt,
        minimumRentPerTurbine: advanceResult.yearlyMinimumRentTotal / Math.max(1, advanceResult.totals.totalWeaCount ?? 1),
        // Map "advances" to "leases" for wizard compatibility
        leases: advanceResult.advances.map((a) => ({
          leaseId: a.leaseId,
          lessorId: a.lessorId,
          lessorName: a.lessorName,
          lessorAddress: a.lessorAddress,
          monthlyMinimumRent: a.totalAdvance * scaleFactor,
          plotCount: a.weaCount + (a.poolAreaSqm > 0 ? 1 : 0),
        })),
        totals: {
          leaseCount: advanceResult.totals.leaseCount,
          totalMonthlyMinimumRent: advanceResult.totals.totalMonthlyAdvance * scaleFactor,
        },
      };

      // Speichere Ergebnis
      if (options.saveResult) {
        await prisma.leaseSettlementPeriod.update({
          where: { id },
          data: {
            totalMinimumRent: new Decimal(scaledResult.totals.totalMonthlyMinimumRent),
            status: period.status === "OPEN" ? "IN_PROGRESS" : period.status,
          },
        });
      }

      const updated = await prisma.leaseSettlementPeriod.findUnique({
        where: { id },
        include: {
          park: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json({
        period: updated,
        calculation: scaledResult,
      });
    } else {
      // FINAL: Jahresendabrechnung mit Verrechnung der Vorschüsse
      const finalResult = await calculateFinalSettlement({
        parkId: period.parkId,
        year: period.year,
        totalRevenue: options.totalRevenue ?? (period.totalRevenue ? Number(period.totalRevenue) : undefined),
        tenantId: check.tenantId!,
      });

      // Speichere Ergebnis
      if (options.saveResult) {
        await prisma.leaseSettlementPeriod.update({
          where: { id },
          data: {
            totalRevenue: new Decimal(finalResult.totalRevenue),
            totalMinimumRent: new Decimal(finalResult.totals.totalMinimumRent),
            totalActualRent: new Decimal(finalResult.totals.totalFinalPayment + finalResult.totals.totalAdvancesPaid),
            status: period.status === "OPEN" ? "IN_PROGRESS" : period.status,
          },
        });
      }

      const updated = await prisma.leaseSettlementPeriod.findUnique({
        where: { id },
        include: {
          park: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json({
        period: updated,
        calculation: finalResult,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error calculating settlement");
    return NextResponse.json(
      { error: "Fehler bei der Berechnung" },
      { status: 500 }
    );
  }
}

// ===========================================
// FINAL CALCULATION (Jahresendabrechnung)
// ===========================================

interface CalculateFinalOptions {
  parkId: string;
  year: number;
  totalRevenue?: number;
  tenantId: string;
}

async function calculateFinalSettlement(
  options: CalculateFinalOptions
): Promise<FinalCalculationResult> {
  const { parkId, year, tenantId, totalRevenue: overrideRevenue } = options;

  // Nutze bestehenden Calculator für Basis-Berechnung
  const baseCalculation = await calculateSettlement({
    parkId,
    year,
    totalRevenue: overrideRevenue,
    tenantId,
  });

  // Lade bereits gezahlte ADVANCE Perioden für dieses Jahr
  const advancePeriods = await prisma.leaseSettlementPeriod.findMany({
    where: {
      parkId,
      year,
      tenantId,
      periodType: "ADVANCE",
      status: { in: ["IN_PROGRESS", "CLOSED"] },
    },
    include: {
      invoices: {
        where: { status: { in: ["SENT", "PAID"] } },
        select: {
          id: true,
          leaseId: true,
          grossAmount: true,
        },
      },
    },
  });

  // Berechne bereits gezahlte Vorschüsse pro Lease
  const advancesPaidByLease = new Map<string, number>();
  for (const period of advancePeriods) {
    for (const invoice of period.invoices) {
      if (invoice.leaseId) {
        const current = advancesPaidByLease.get(invoice.leaseId) || 0;
        advancesPaidByLease.set(invoice.leaseId, current + Number(invoice.grossAmount));
      }
    }
  }

  // Berechne finale Zahlungen pro Lease
  const leases = baseCalculation.leases.map((lease) => {
    const alreadyPaidAdvances = advancesPaidByLease.get(lease.leaseId) || 0;
    // totalPayment already has per-turbine MAX applied in calculator
    const totalDue = lease.totalPayment;
    const finalPayment = totalDue - alreadyPaidAdvances;

    return {
      leaseId: lease.leaseId,
      lessorId: lease.lessorId,
      lessorName: lease.lessorName,
      lessorAddress: lease.lessorAddress,
      totalMinimumRent: lease.totalMinimumRent,
      totalRevenueShare: lease.totalRevenueShare,
      alreadyPaidAdvances,
      finalPayment: Math.round(finalPayment * 100) / 100,
      isCredit: finalPayment > 0,
    };
  });

  return {
    parkId: baseCalculation.parkId,
    parkName: baseCalculation.parkName,
    year,
    periodType: "FINAL",
    calculatedAt: new Date(),
    totalRevenue: baseCalculation.totalRevenue,
    revenuePhasePercentage: baseCalculation.revenuePhasePercentage,
    leases,
    totals: {
      leaseCount: leases.length,
      totalMinimumRent: leases.reduce((sum, l) => sum + l.totalMinimumRent, 0),
      totalRevenueShare: leases.reduce((sum, l) => sum + l.totalRevenueShare, 0),
      totalAdvancesPaid: leases.reduce((sum, l) => sum + l.alreadyPaidAdvances, 0),
      totalFinalPayment: leases.reduce((sum, l) => sum + l.finalPayment, 0),
    },
  };
}

// GET /api/admin/settlement-periods/[id]/calculate - Lese letzte Berechnung
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Hole Periode
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            minimumRentPerTurbine: true,
            weaSharePercentage: true,
            poolSharePercentage: true,
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

    // Berechnung erneut ausfuehren (ohne zu speichern) für aktuelle Daten
    const calculation = await calculateSettlement({
      parkId: period.parkId,
      year: period.year,
      totalRevenue: period.totalRevenue ? Number(period.totalRevenue) : undefined,
      tenantId: check.tenantId!,
    });

    return NextResponse.json({
      period: {
        id: period.id,
        year: period.year,
        status: period.status,
        totalRevenue: period.totalRevenue,
        totalMinimumRent: period.totalMinimumRent,
        totalActualRent: period.totalActualRent,
        park: period.park,
      },
      calculation,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching calculation");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berechnung" },
      { status: 500 }
    );
  }
}
