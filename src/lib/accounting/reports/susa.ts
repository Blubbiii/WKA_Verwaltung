/**
 * SuSa (Summen- und Saldenliste)
 * Aggregates JournalEntryLine data per account for a given period.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

export interface SuSaRow {
  accountNumber: string;
  accountName: string;
  category: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  balance: number;
}

export interface SuSaResult {
  rows: SuSaRow[];
  periodStart: string;
  periodEnd: string;
  totalDebit: number;
  totalCredit: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateSuSa(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<SuSaResult> {
  // P-1 Sprint 2: 2 SQL-groupBy statt JS-Aggregation aller Lines mit Join.
  const [openingBuckets, periodBuckets, accounts] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ["account"],
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { lt: periodStart },
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.journalEntryLine.groupBy({
      by: ["account"],
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { gte: periodStart, lte: periodEnd },
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.ledgerAccount.findMany({
      where: { tenantId, isActive: true },
      select: { accountNumber: true, name: true, category: true },
    }),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.accountNumber, a]));

  const aggregation = new Map<string, {
    name: string;
    category: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
  }>();

  function ensureEntry(acc: string) {
    if (!aggregation.has(acc)) {
      const ledger = accountMap.get(acc);
      aggregation.set(acc, {
        name: ledger?.name || acc,
        category: ledger?.category || "EXPENSE",
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
      });
    }
    return aggregation.get(acc)!;
  }

  for (const b of openingBuckets) {
    const entry = ensureEntry(b.account);
    entry.openingDebit += toNum(b._sum.debitAmount);
    entry.openingCredit += toNum(b._sum.creditAmount);
  }
  for (const b of periodBuckets) {
    const entry = ensureEntry(b.account);
    entry.periodDebit += toNum(b._sum.debitAmount);
    entry.periodCredit += toNum(b._sum.creditAmount);
  }

  // Build rows
  const rows: SuSaRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [accountNumber, data] of aggregation.entries()) {
    const closingDebit = data.openingDebit + data.periodDebit;
    const closingCredit = data.openingCredit + data.periodCredit;
    const balance = closingDebit - closingCredit;

    totalDebit += data.periodDebit;
    totalCredit += data.periodCredit;

    rows.push({
      accountNumber,
      accountName: data.name,
      category: data.category,
      openingDebit: data.openingDebit,
      openingCredit: data.openingCredit,
      periodDebit: data.periodDebit,
      periodCredit: data.periodCredit,
      closingDebit,
      closingCredit,
      balance,
    });
  }

  rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return {
    rows,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalDebit,
    totalCredit,
  };
}
