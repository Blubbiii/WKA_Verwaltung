/**
 * GET /api/wirtschaftsplan/overview
 * KPI summary for the current year: YTD actuals vs budget.
 */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

const MONTH_FIELDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const REVENUE_CATS = new Set(["REVENUE_ENERGY", "REVENUE_OTHER"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET() {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });

    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based
    const startOfYear = new Date(year, 0, 1);
    const startOfNextYear = new Date(year + 1, 0, 1);

    const [energySettlements, invoices, costAllocations, budget] = await Promise.all([
      prisma.energySettlement.findMany({
        where: { tenantId: check.tenantId, year, month: { lte: currentMonth } },
        select: { netOperatorRevenueEur: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId: check.tenantId,
          invoiceDate: { gte: startOfYear, lt: startOfNextYear },
          invoiceType: "INVOICE",
          status: { notIn: ["CANCELLED"] },
          deletedAt: null,
        },
        select: { grossAmount: true, leaseId: true, invoiceDate: true },
      }),
      prisma.parkCostAllocation.findMany({
        where: {
          tenantId: check.tenantId,
          leaseRevenueSettlement: { year },
        },
        select: { totalUsageFeeEur: true },
      }),
      prisma.annualBudget.findFirst({
        where: { tenantId: check.tenantId, year, status: { in: ["APPROVED", "DRAFT"] } },
        orderBy: { status: "asc" },
        include: { lines: true },
      }),
    ]);

    // Ist
    const totalRevenue = round2(
      energySettlements.reduce((s, e) => s + Number(e.netOperatorRevenueEur), 0) +
        invoices.filter((i) => !i.leaseId).reduce((s, i) => s + Math.abs(Number(i.grossAmount)), 0)
    );
    const totalCosts = round2(
      invoices.filter((i) => i.leaseId).reduce((s, i) => s + Math.abs(Number(i.grossAmount)), 0) +
        costAllocations.reduce((s, c) => s + Number(c.totalUsageFeeEur), 0)
    );
    const netPL = round2(totalRevenue - totalCosts);

    // Budget (YTD: sum months up to currentMonth)
    let budgetRevenue = 0;
    let budgetCosts = 0;
    let hasBudget = false;

    if (budget) {
      hasBudget = true;
      for (const line of budget.lines) {
        const isRevenue = REVENUE_CATS.has(line.category);
        for (let i = 0; i < currentMonth; i++) {
          const field = MONTH_FIELDS[i];
          if (!field) continue;
          const amount = Number(line[field]);
          if (isRevenue) budgetRevenue += amount;
          else budgetCosts += amount;
        }
      }
      budgetRevenue = round2(budgetRevenue);
      budgetCosts = round2(budgetCosts);
    }

    const budgetNetPL = round2(budgetRevenue - budgetCosts);
    const budgetUsagePct = budgetCosts > 0 ? round2((totalCosts / budgetCosts) * 100) : null;

    return NextResponse.json({
      year,
      currentMonth,
      totalRevenue,
      totalCosts,
      netPL,
      budgetRevenue,
      budgetCosts,
      budgetNetPL,
      budgetUsagePct,
      hasBudget,
      varianceRevenue: round2(totalRevenue - budgetRevenue),
      varianceCosts: round2(totalCosts - budgetCosts),
      varianceNetPL: round2(netPL - budgetNetPL),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating Wirtschaftsplan overview");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Übersicht" });
  }
}
