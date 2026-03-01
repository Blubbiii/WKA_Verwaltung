import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

interface MonthData {
  month: number;         // 1..12
  energyRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  leaseExpenses: number;
  operatingCosts: number;
  totalCosts: number;
  netPL: number;
}

interface ParkPLEntry {
  parkId: string;
  parkName: string;
  months: MonthData[];
  totals: MonthData;
}

// ============================================================================
// HELPERS
// ============================================================================

function emptyMonth(month: number): MonthData {
  return {
    month,
    energyRevenue: 0,
    otherRevenue: 0,
    totalRevenue: 0,
    leaseExpenses: 0,
    operatingCosts: 0,
    totalCosts: 0,
    netPL: 0,
  };
}

function sumMonths(months: MonthData[]): MonthData {
  const totals = emptyMonth(0);
  for (const m of months) {
    totals.energyRevenue += m.energyRevenue;
    totals.otherRevenue += m.otherRevenue;
    totals.totalRevenue += m.totalRevenue;
    totals.leaseExpenses += m.leaseExpenses;
    totals.operatingCosts += m.operatingCosts;
    totals.totalCosts += m.totalCosts;
    totals.netPL += m.netPL;
  }
  return totals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// GET /api/reports/park-pl
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const parkIdParam = searchParams.get("parkId");

    if (!yearParam) {
      return NextResponse.json({ error: "Parameter 'year' fehlt" }, { status: 400 });
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
    }

    const startOfYear = new Date(year, 0, 1);
    const startOfNextYear = new Date(year + 1, 0, 1);

    // Build park filter
    const parkFilter = parkIdParam
      ? { id: parkIdParam, tenantId: check.tenantId }
      : { tenantId: check.tenantId };

    // Load parks
    const parks = await prisma.park.findMany({
      where: parkFilter,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (parks.length === 0) {
      return NextResponse.json({ year, parks: [] });
    }

    const parkIds = parks.map((p) => p.id);

    // ---- Data fetch (parallel) ----
    const [energySettlements, invoices, costAllocations] = await Promise.all([
      // 1. Energy revenue per park + month
      prisma.energySettlement.findMany({
        where: {
          tenantId: check.tenantId,
          parkId: { in: parkIds },
          year,
        },
        select: {
          parkId: true,
          month: true,
          netOperatorRevenueEur: true,
        },
      }),

      // 2. Invoices linked to parks (revenue + lease costs)
      prisma.invoice.findMany({
        where: {
          tenantId: check.tenantId,
          parkId: { in: parkIds },
          invoiceDate: { gte: startOfYear, lt: startOfNextYear },
          invoiceType: "INVOICE",
          status: { notIn: ["CANCELLED"] },
          deletedAt: null,
        },
        select: {
          parkId: true,
          invoiceDate: true,
          grossAmount: true,
          leaseId: true,
        },
      }),

      // 3. Park operating cost allocations (annual, tied to lease revenue settlement)
      prisma.parkCostAllocation.findMany({
        where: {
          tenantId: check.tenantId,
          leaseRevenueSettlement: {
            parkId: { in: parkIds },
            year,
          },
        },
        select: {
          totalUsageFeeEur: true,
          leaseRevenueSettlement: {
            select: { parkId: true },
          },
        },
      }),
    ]);

    // ---- Aggregate per park ----
    const result: ParkPLEntry[] = parks.map((park) => {
      const months: MonthData[] = Array.from({ length: 12 }, (_, i) =>
        emptyMonth(i + 1)
      );

      // Energy settlements → revenue
      for (const es of energySettlements) {
        if (es.parkId !== park.id) continue;
        if (es.month == null) continue;
        const m = months[es.month - 1];
        if (!m) continue;
        m.energyRevenue += Number(es.netOperatorRevenueEur);
      }

      // Invoices → revenue (no lease) or cost (with lease)
      for (const inv of invoices) {
        if (inv.parkId !== park.id) continue;
        if (!inv.invoiceDate) continue;
        const monthIdx = new Date(inv.invoiceDate).getMonth(); // 0-based
        const m = months[monthIdx];
        if (!m) continue;
        const amount = Math.abs(Number(inv.grossAmount));
        if (inv.leaseId) {
          m.leaseExpenses += amount;
        } else {
          m.otherRevenue += amount;
        }
      }

      // Cost allocations → operating costs (placed in December)
      const decMonth = months[11]; // December (index 11)
      if (decMonth) {
        for (const ca of costAllocations) {
          if (ca.leaseRevenueSettlement.parkId !== park.id) continue;
          decMonth.operatingCosts += Number(ca.totalUsageFeeEur);
        }
      }

      // Compute derived totals per month
      for (const m of months) {
        m.energyRevenue = round2(m.energyRevenue);
        m.otherRevenue = round2(m.otherRevenue);
        m.leaseExpenses = round2(m.leaseExpenses);
        m.operatingCosts = round2(m.operatingCosts);
        m.totalRevenue = round2(m.energyRevenue + m.otherRevenue);
        m.totalCosts = round2(m.leaseExpenses + m.operatingCosts);
        m.netPL = round2(m.totalRevenue - m.totalCosts);
      }

      return {
        parkId: park.id,
        parkName: park.name,
        months,
        totals: sumMonths(months),
      };
    });

    logger.info(
      { tenantId: check.tenantId, year, parkCount: result.length },
      "Park P&L report generated"
    );

    return NextResponse.json({ year, parks: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating park P&L report");
    return NextResponse.json(
      { error: "Fehler beim Generieren des P&L-Reports" },
      { status: 500 }
    );
  }
}
