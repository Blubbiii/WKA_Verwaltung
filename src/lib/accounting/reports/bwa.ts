/**
 * BWA (Betriebswirtschaftliche Auswertung) — German P&L report (BWA-Form 01)
 * Aggregates JournalEntryLines by account category for a given period.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { getTenantSettings } from "@/lib/tenant-settings";

export interface BwaLine {
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  ytd: number;
  previousYtd: number;
}

export interface BwaResult {
  lines: BwaLine[];
  periodStart: string;
  periodEnd: string;
  netIncome: number;
  previousNetIncome: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

interface AccountAggregation {
  revenue: number;
  expense: number;
  interest: number;
  depreciation: number;
  other: number;
}

async function aggregateByPeriod(
  tenantId: string,
  start: Date,
  end: Date
): Promise<AccountAggregation> {
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: start, lte: end },
      },
    },
    select: {
      account: true,
      debitAmount: true,
      creditAmount: true,
    },
  });

  let revenue = 0;
  let expense = 0;
  let interest = 0;
  let depreciation = 0;
  let other = 0;

  for (const line of lines) {
    const net = toNum(line.creditAmount) - toNum(line.debitAmount);
    const acc = line.account;

    if (acc.startsWith("8")) {
      revenue += net;
    } else if (acc.startsWith("480") || acc.startsWith("481") || acc.startsWith("482") || acc.startsWith("483") || acc.startsWith("485") || acc.startsWith("488")) {
      // SKR03: 48xx = AfA (Abschreibungen auf Sachanlagen)
      depreciation += toNum(line.debitAmount) - toNum(line.creditAmount);
    } else if (acc.startsWith("7")) {
      interest += toNum(line.debitAmount) - toNum(line.creditAmount);
    } else if (acc.startsWith("4") || acc.startsWith("3")) {
      // SKR03: 4xxx = Betriebliche Aufwendungen, 3xxx = Wareneingang/Material
      expense += toNum(line.debitAmount) - toNum(line.creditAmount);
    } else {
      other += net;
    }
  }

  return { revenue, expense, interest, depreciation, other };
}

export async function generateBwa(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BwaResult> {
  const settings = await getTenantSettings(tenantId);
  const fyMonth = (settings.fiscalYearStartMonth || 1) - 1; // 0-based month

  // Calculate previous period (same length, shifted back)
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const prevEnd = new Date(periodStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  // YTD: from fiscal year start (configurable, default Jan 1)
  const fyYear = periodStart.getMonth() >= fyMonth
    ? periodStart.getFullYear()
    : periodStart.getFullYear() - 1;
  const ytdStart = new Date(fyYear, fyMonth, 1);
  const prevYtdStart = new Date(fyYear - 1, fyMonth, 1);
  const prevYtdEnd = new Date(periodStart.getFullYear() - 1, periodEnd.getMonth(), periodEnd.getDate());

  const [current, previous, ytd, prevYtd] = await Promise.all([
    aggregateByPeriod(tenantId, periodStart, periodEnd),
    aggregateByPeriod(tenantId, prevStart, prevEnd),
    aggregateByPeriod(tenantId, ytdStart, periodEnd),
    aggregateByPeriod(tenantId, prevYtdStart, prevYtdEnd),
  ]);

  const lines: BwaLine[] = [
    { label: "Umsatzerloese", currentPeriod: current.revenue, previousPeriod: previous.revenue, ytd: ytd.revenue, previousYtd: prevYtd.revenue },
    { label: "Materialaufwand", currentPeriod: 0, previousPeriod: 0, ytd: 0, previousYtd: 0 },
    { label: "Rohertrag", currentPeriod: current.revenue, previousPeriod: previous.revenue, ytd: ytd.revenue, previousYtd: prevYtd.revenue },
    { label: "Betriebliche Aufwendungen", currentPeriod: current.expense, previousPeriod: previous.expense, ytd: ytd.expense, previousYtd: prevYtd.expense },
    { label: "Abschreibungen", currentPeriod: current.depreciation, previousPeriod: previous.depreciation, ytd: ytd.depreciation, previousYtd: prevYtd.depreciation },
    { label: "Betriebsergebnis", currentPeriod: current.revenue - current.expense - current.depreciation, previousPeriod: previous.revenue - previous.expense - previous.depreciation, ytd: ytd.revenue - ytd.expense - ytd.depreciation, previousYtd: prevYtd.revenue - prevYtd.expense - prevYtd.depreciation },
    { label: "Zinsen und Finanzierungskosten", currentPeriod: current.interest, previousPeriod: previous.interest, ytd: ytd.interest, previousYtd: prevYtd.interest },
    { label: "Sonstige Ertraege/Aufwendungen", currentPeriod: current.other, previousPeriod: previous.other, ytd: ytd.other, previousYtd: prevYtd.other },
  ];

  const netIncome = current.revenue - current.expense - current.depreciation - current.interest + current.other;
  const previousNetIncome = previous.revenue - previous.expense - previous.depreciation - previous.interest + previous.other;

  lines.push({ label: "Ergebnis vor Steuern", currentPeriod: netIncome, previousPeriod: previousNetIncome, ytd: ytd.revenue - ytd.expense - ytd.depreciation - ytd.interest + ytd.other, previousYtd: prevYtd.revenue - prevYtd.expense - prevYtd.depreciation - prevYtd.interest + prevYtd.other });

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    netIncome,
    previousNetIncome,
  };
}
