/**
 * GET /api/wirtschaftsplan/pl
 * Enhanced P&L with budget plan (Soll/Ist comparison).
 * Extends the existing park-pl logic with budget lines.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

interface MonthData {
  month: number;
  // Ist (actual)
  energyRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  leaseExpenses: number;
  operatingCosts: number;
  totalCosts: number;
  netPL: number;
  // Soll (budget plan)
  budgetRevenue: number;
  budgetCosts: number;
  budgetNetPL: number;
  // Abweichung
  varianceRevenue: number;
  varianceCosts: number;
  varianceNetPL: number;
}

interface ParkPLEntry {
  parkId: string;
  parkName: string;
  months: MonthData[];
  totals: MonthData;
  hasBudget: boolean;
}

const MONTH_FIELDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

function emptyMonth(month: number): MonthData {
  return {
    month,
    energyRevenue: 0, otherRevenue: 0, totalRevenue: 0,
    leaseExpenses: 0, operatingCosts: 0, totalCosts: 0, netPL: 0,
    budgetRevenue: 0, budgetCosts: 0, budgetNetPL: 0,
    varianceRevenue: 0, varianceCosts: 0, varianceNetPL: 0,
  };
}

function sumMonths(months: MonthData[]): MonthData {
  const t = emptyMonth(0);
  for (const m of months) {
    t.energyRevenue += m.energyRevenue;
    t.otherRevenue += m.otherRevenue;
    t.totalRevenue += m.totalRevenue;
    t.leaseExpenses += m.leaseExpenses;
    t.operatingCosts += m.operatingCosts;
    t.totalCosts += m.totalCosts;
    t.netPL += m.netPL;
    t.budgetRevenue += m.budgetRevenue;
    t.budgetCosts += m.budgetCosts;
    t.budgetNetPL += m.budgetNetPL;
    t.varianceRevenue += m.varianceRevenue;
    t.varianceCosts += m.varianceCosts;
    t.varianceNetPL += m.varianceNetPL;
  }
  return t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// GET
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const parkIdParam = searchParams.get("parkId");
    const budgetIdParam = searchParams.get("budgetId");

    if (!yearParam) {
      return NextResponse.json({ error: "Parameter 'year' fehlt" }, { status: 400 });
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
    }

    const startOfYear = new Date(year, 0, 1);
    const startOfNextYear = new Date(year + 1, 0, 1);

    const parkFilter = parkIdParam
      ? { id: parkIdParam, tenantId: check.tenantId }
      : { tenantId: check.tenantId };

    const parks = await prisma.park.findMany({
      where: parkFilter,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (parks.length === 0) {
      return NextResponse.json({ year, parks: [], hasBudget: false });
    }

    const parkIds = parks.map((p) => p.id);

    // Load actual data + budget in parallel
    const [energySettlements, invoices, costAllocations, budgetLines] = await Promise.all([
      prisma.energySettlement.findMany({
        where: { tenantId: check.tenantId, parkId: { in: parkIds }, year },
        select: { parkId: true, month: true, netOperatorRevenueEur: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId: check.tenantId,
          parkId: { in: parkIds },
          invoiceDate: { gte: startOfYear, lt: startOfNextYear },
          invoiceType: "INVOICE",
          status: { notIn: ["CANCELLED"] },
          deletedAt: null,
        },
        select: { parkId: true, invoiceDate: true, grossAmount: true, leaseId: true },
      }),
      prisma.parkCostAllocation.findMany({
        where: {
          tenantId: check.tenantId,
          leaseRevenueSettlement: { parkId: { in: parkIds }, year },
        },
        select: {
          totalUsageFeeEur: true,
          leaseRevenueSettlement: { select: { parkId: true } },
        },
      }),
      // Budget lines: always verify budget belongs to current tenant (IDOR protection)
      (async () => {
        let resolvedBudgetId = budgetIdParam;
        if (resolvedBudgetId) {
          // Validate that the requested budget belongs to this tenant
          const owned = await prisma.annualBudget.findFirst({
            where: { id: resolvedBudgetId, tenantId: check.tenantId },
          });
          if (!owned) return [];
        } else {
          const budget = await prisma.annualBudget.findFirst({
            where: {
              tenantId: check.tenantId,
              year,
              status: { in: ["APPROVED", "DRAFT"] },
            },
            orderBy: { status: "asc" }, // APPROVED before DRAFT
          });
          resolvedBudgetId = budget?.id ?? null;
        }
        if (!resolvedBudgetId) return [];
        return prisma.budgetLine.findMany({
          where: { budgetId: resolvedBudgetId },
          include: {
            costCenter: { select: { parkId: true } },
          },
        });
      })(),
    ]);

    const hasBudget = budgetLines.length > 0;

    // Aggregate per park
    const result: ParkPLEntry[] = parks.map((park) => {
      const months: MonthData[] = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));

      // Actual: energy revenue
      for (const es of energySettlements) {
        if (es.parkId !== park.id || es.month == null) continue;
        const m = months[es.month - 1];
        if (m) m.energyRevenue += Number(es.netOperatorRevenueEur);
      }

      // Actual: invoices
      for (const inv of invoices) {
        if (inv.parkId !== park.id || !inv.invoiceDate) continue;
        const m = months[new Date(inv.invoiceDate).getMonth()];
        if (!m) continue;
        const amount = Math.abs(Number(inv.grossAmount));
        if (inv.leaseId) m.leaseExpenses += amount;
        else m.otherRevenue += amount;
      }

      // Actual: cost allocations → December
      const decMonth = months[11];
      if (decMonth) {
        for (const ca of costAllocations) {
          if (ca.leaseRevenueSettlement.parkId !== park.id) continue;
          decMonth.operatingCosts += Number(ca.totalUsageFeeEur);
        }
      }

      // Budget: aggregate lines for this park's cost centers
      const REVENUE_CATS = new Set(["REVENUE_ENERGY", "REVENUE_OTHER"]);
      for (const line of budgetLines) {
        if (line.costCenter.parkId !== park.id) continue;
        const isRevenue = REVENUE_CATS.has(line.category);
        MONTH_FIELDS.forEach((field, idx) => {
          const amount = Number(line[field]);
          const m = months[idx];
          if (!m) return;
          if (isRevenue) m.budgetRevenue += amount;
          else m.budgetCosts += amount;
        });
      }

      // Compute derived totals
      for (const m of months) {
        m.energyRevenue = round2(m.energyRevenue);
        m.otherRevenue = round2(m.otherRevenue);
        m.leaseExpenses = round2(m.leaseExpenses);
        m.operatingCosts = round2(m.operatingCosts);
        m.totalRevenue = round2(m.energyRevenue + m.otherRevenue);
        m.totalCosts = round2(m.leaseExpenses + m.operatingCosts);
        m.netPL = round2(m.totalRevenue - m.totalCosts);
        m.budgetRevenue = round2(m.budgetRevenue);
        m.budgetCosts = round2(m.budgetCosts);
        m.budgetNetPL = round2(m.budgetRevenue - m.budgetCosts);
        m.varianceRevenue = round2(m.totalRevenue - m.budgetRevenue);
        m.varianceCosts = round2(m.totalCosts - m.budgetCosts);
        m.varianceNetPL = round2(m.netPL - m.budgetNetPL);
      }

      return { parkId: park.id, parkName: park.name, months, totals: sumMonths(months), hasBudget };
    });

    logger.info({ tenantId: check.tenantId, year, parkCount: result.length, hasBudget }, "Wirtschaftsplan P&L generated");

    return NextResponse.json({ year, parks: result, hasBudget });
  } catch (error) {
    logger.error({ err: error }, "Error generating Wirtschaftsplan P&L");
    return NextResponse.json({ error: "Fehler beim Generieren der P&L" }, { status: 500 });
  }
}
