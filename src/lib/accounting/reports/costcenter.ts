/**
 * Kostenstellen-Report
 *
 * Aggregates JournalEntryLines by costCenter string for a given period.
 * Groups by CostCenter entity (if matched) or by raw costCenter string.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface CostCenterReportRow {
  costCenterCode: string;
  costCenterName: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  /** Revenue accounts (8xxx) */
  revenue: number;
  /** Expense accounts (3xxx-7xxx) */
  expense: number;
  /** Net result (revenue - expense) */
  result: number;
}

export interface CostCenterReportResult {
  rows: CostCenterReportRow[];
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpense: number;
  totalResult: number;
  /** Lines without costCenter assignment */
  unassigned: {
    debit: number;
    credit: number;
    revenue: number;
    expense: number;
    result: number;
  };
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateCostCenterReport(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CostCenterReportResult> {
  // Load journal lines for the period
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: periodStart, lte: periodEnd },
      },
    },
    select: {
      account: true,
      debitAmount: true,
      creditAmount: true,
      costCenter: true,
    },
  });

  // Load cost centers for name lookup
  const costCenters = await prisma.costCenter.findMany({
    where: { tenantId },
    select: { code: true, name: true, type: true },
  });
  const ccMap = new Map(costCenters.map((cc) => [cc.code, cc]));

  // Aggregate by costCenter
  const aggregation = new Map<string, {
    debit: number;
    credit: number;
    revenue: number;
    expense: number;
  }>();

  let unassignedDebit = 0;
  let unassignedCredit = 0;
  let unassignedRevenue = 0;
  let unassignedExpense = 0;

  for (const line of lines) {
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    const isRevenue = line.account.startsWith("8");
    const isExpense = line.account >= "3" && line.account < "8";

    if (!line.costCenter) {
      unassignedDebit += debit;
      unassignedCredit += credit;
      if (isRevenue) unassignedRevenue += credit - debit;
      if (isExpense) unassignedExpense += debit - credit;
      continue;
    }

    const cc = line.costCenter;
    if (!aggregation.has(cc)) {
      aggregation.set(cc, { debit: 0, credit: 0, revenue: 0, expense: 0 });
    }

    const entry = aggregation.get(cc)!;
    entry.debit += debit;
    entry.credit += credit;
    if (isRevenue) entry.revenue += credit - debit;
    if (isExpense) entry.expense += debit - credit;
  }

  // Build rows
  const rows: CostCenterReportRow[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const [code, data] of aggregation.entries()) {
    const ccInfo = ccMap.get(code);
    const result = data.revenue - data.expense;
    totalRevenue += data.revenue;
    totalExpense += data.expense;

    rows.push({
      costCenterCode: code,
      costCenterName: ccInfo?.name || code,
      type: ccInfo?.type || "CUSTOM",
      debit: data.debit,
      credit: data.credit,
      balance: data.debit - data.credit,
      revenue: data.revenue,
      expense: data.expense,
      result,
    });
  }

  rows.sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode));

  return {
    rows,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalRevenue,
    totalExpense,
    totalResult: totalRevenue - totalExpense,
    unassigned: {
      debit: unassignedDebit,
      credit: unassignedCredit,
      revenue: unassignedRevenue,
      expense: unassignedExpense,
      result: unassignedRevenue - unassignedExpense,
    },
  };
}
