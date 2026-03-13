/**
 * Liquidity Forecast (Liquiditätsplanung)
 *
 * Aggregates expected inflows and outflows from:
 * - Open outgoing invoices (receivables by dueDate)
 * - Unpaid incoming invoices (payables by dueDate)
 * - Recurring invoices (projected future amounts)
 * - Budget plan data (monthly revenue/cost projections)
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface LiquidityPeriod {
  label: string;
  periodStart: string;
  periodEnd: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  cumulativeBalance: number;
  details: {
    receivables: number;
    budgetRevenue: number;
    payables: number;
    budgetCosts: number;
    recurringOut: number;
  };
}

export interface LiquidityForecastResult {
  periods: LiquidityPeriod[];
  startingBalance: number;
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

const MONTH_FIELDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const MONTH_NAMES_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const REVENUE_CATEGORIES = ["REVENUE_ENERGY", "REVENUE_OTHER"];

function buildPeriods(
  startDate: Date,
  endDate: Date,
  granularity: "weekly" | "monthly"
): { label: string; start: Date; end: Date }[] {
  const periods: { label: string; start: Date; end: Date }[] = [];

  if (granularity === "monthly") {
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= endDate) {
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59);
      periods.push({
        label: `${MONTH_NAMES_DE[cur.getMonth()]} ${cur.getFullYear()}`,
        start: new Date(cur),
        end: monthEnd > endDate ? endDate : monthEnd,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    // Weekly: start on Monday
    const cur = new Date(startDate);
    const dayOfWeek = cur.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    cur.setDate(cur.getDate() + diff);

    let weekNum = 1;
    while (cur <= endDate) {
      const weekEnd = new Date(cur);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59);

      periods.push({
        label: `KW ${weekNum} / ${cur.getFullYear()}`,
        start: new Date(cur),
        end: weekEnd > endDate ? endDate : weekEnd,
      });
      cur.setDate(cur.getDate() + 7);
      weekNum++;
    }
  }

  return periods;
}

function dateFallsInPeriod(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

export async function generateLiquidityForecast(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  granularity: "weekly" | "monthly" = "monthly",
  startingBalance: number = 0,
  budgetId?: string
): Promise<LiquidityForecastResult> {
  const periods = buildPeriods(startDate, endDate, granularity);

  // Load open outgoing invoices (receivables)
  const receivables = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "SENT",
      deletedAt: null,
      invoiceType: "INVOICE",
    },
    select: { dueDate: true, invoiceDate: true, grossAmount: true },
  });

  // Load unpaid incoming invoices (payables)
  const payables = await prisma.incomingInvoice.findMany({
    where: {
      tenantId,
      status: { in: ["INBOX", "REVIEW", "APPROVED"] },
      deletedAt: null,
    },
    select: { dueDate: true, invoiceDate: true, grossAmount: true },
  });

  // Load recurring invoices
  const recurring = await prisma.recurringInvoice.findMany({
    where: { tenantId, enabled: true },
    select: {
      positions: true,
      frequency: true,
      nextRunAt: true,
      endDate: true,
    },
  });

  // Load budget data if requested
  let budgetLines: { category: string; [key: string]: unknown }[] = [];
  let budgetYear = 0;
  if (budgetId) {
    const budget = await prisma.annualBudget.findFirst({
      where: { id: budgetId, tenantId },
      include: { lines: true },
    });
    if (budget) {
      budgetLines = budget.lines;
      budgetYear = budget.year;
    }
  }

  // Initialize period data
  const periodData = periods.map((p) => ({
    ...p,
    receivables: 0,
    payables: 0,
    recurringOut: 0,
    budgetRevenue: 0,
    budgetCosts: 0,
  }));

  // Bin receivables into periods
  for (const inv of receivables) {
    const date = inv.dueDate || new Date(inv.invoiceDate.getTime() + 30 * 86400000);
    const amount = toNum(inv.grossAmount);
    for (const p of periodData) {
      if (dateFallsInPeriod(date, p.start, p.end)) {
        p.receivables += amount;
        break;
      }
    }
  }

  // Bin payables into periods
  for (const inv of payables) {
    const date = inv.dueDate || (inv.invoiceDate ? new Date(inv.invoiceDate.getTime() + 30 * 86400000) : new Date());
    const amount = toNum(inv.grossAmount);
    for (const p of periodData) {
      if (dateFallsInPeriod(date, p.start, p.end)) {
        p.payables += amount;
        break;
      }
    }
  }

  // Project recurring invoices
  for (const rec of recurring) {
    const positions = rec.positions as { unitPrice?: number; quantity?: number }[];
    const totalAmount = Array.isArray(positions)
      ? positions.reduce((sum, pos) => sum + (pos.unitPrice || 0) * (pos.quantity || 1), 0)
      : 0;

    if (totalAmount <= 0) continue;

    let nextRun = new Date(rec.nextRunAt);
    const recEnd = rec.endDate ? new Date(rec.endDate) : endDate;

    while (nextRun <= endDate && nextRun <= recEnd) {
      for (const p of periodData) {
        if (dateFallsInPeriod(nextRun, p.start, p.end)) {
          p.recurringOut += totalAmount;
          break;
        }
      }

      // Advance to next occurrence
      switch (rec.frequency) {
        case "MONTHLY":
          nextRun = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, nextRun.getDate());
          break;
        case "QUARTERLY":
          nextRun = new Date(nextRun.getFullYear(), nextRun.getMonth() + 3, nextRun.getDate());
          break;
        case "YEARLY":
          nextRun = new Date(nextRun.getFullYear() + 1, nextRun.getMonth(), nextRun.getDate());
          break;
        default:
          nextRun = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, nextRun.getDate());
      }
    }
  }

  // Distribute budget data into periods
  if (budgetLines.length > 0 && budgetYear > 0) {
    for (const line of budgetLines) {
      const isRevenue = REVENUE_CATEGORIES.includes(line.category as string);

      for (const p of periodData) {
        // Check if period falls in the budget year
        if (p.start.getFullYear() !== budgetYear && p.end.getFullYear() !== budgetYear) continue;

        if (granularity === "monthly") {
          const month = p.start.getMonth(); // 0-based
          if (p.start.getFullYear() === budgetYear) {
            const amount = toNum((line as Record<string, unknown>)[MONTH_FIELDS[month]] as Decimal);
            if (isRevenue) {
              p.budgetRevenue += amount;
            } else {
              p.budgetCosts += amount;
            }
          }
        } else {
          // Weekly: distribute monthly amount by ~4.33
          const month = p.start.getMonth();
          if (p.start.getFullYear() === budgetYear) {
            const monthlyAmount = toNum((line as Record<string, unknown>)[MONTH_FIELDS[month]] as Decimal);
            const weeklyAmount = monthlyAmount / 4.33;
            if (isRevenue) {
              p.budgetRevenue += weeklyAmount;
            } else {
              p.budgetCosts += weeklyAmount;
            }
          }
        }
      }
    }
  }

  // Build result
  let cumulative = startingBalance;
  let totalInflows = 0;
  let totalOutflows = 0;

  const resultPeriods: LiquidityPeriod[] = periodData.map((p) => {
    const inflows = p.receivables + p.budgetRevenue;
    const outflows = p.payables + p.budgetCosts + p.recurringOut;
    const netCashFlow = inflows - outflows;
    cumulative += netCashFlow;
    totalInflows += inflows;
    totalOutflows += outflows;

    return {
      label: p.label,
      periodStart: p.start.toISOString(),
      periodEnd: p.end.toISOString(),
      inflows: Math.round(inflows * 100) / 100,
      outflows: Math.round(outflows * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      cumulativeBalance: Math.round(cumulative * 100) / 100,
      details: {
        receivables: Math.round(p.receivables * 100) / 100,
        budgetRevenue: Math.round(p.budgetRevenue * 100) / 100,
        payables: Math.round(p.payables * 100) / 100,
        budgetCosts: Math.round(p.budgetCosts * 100) / 100,
        recurringOut: Math.round(p.recurringOut * 100) / 100,
      },
    };
  });

  return {
    periods: resultPeriods,
    startingBalance,
    endingBalance: Math.round(cumulative * 100) / 100,
    totalInflows: Math.round(totalInflows * 100) / 100,
    totalOutflows: Math.round(totalOutflows * 100) / 100,
  };
}
