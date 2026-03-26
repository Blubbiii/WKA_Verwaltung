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
  // Get all posted journal entry lines for this tenant up to periodEnd
  const allLines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { lte: periodEnd },
      },
    },
    select: {
      account: true,
      accountName: true,
      debitAmount: true,
      creditAmount: true,
      journalEntry: {
        select: { entryDate: true },
      },
    },
  });

  // Load ledger accounts for category info
  const accounts = await prisma.ledgerAccount.findMany({
    where: { tenantId, isActive: true },
    select: { accountNumber: true, name: true, category: true },
  });

  const accountMap = new Map(accounts.map((a) => [a.accountNumber, a]));

  // Aggregate per account
  const aggregation = new Map<string, {
    name: string;
    category: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
  }>();

  for (const line of allLines) {
    const acc = line.account;
    if (!aggregation.has(acc)) {
      const ledger = accountMap.get(acc);
      aggregation.set(acc, {
        name: ledger?.name || line.accountName || acc,
        category: ledger?.category || "EXPENSE",
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
      });
    }

    const entry = aggregation.get(acc)!;
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    const entryDate = line.journalEntry.entryDate;

    if (entryDate < periodStart) {
      // Opening balance (before period)
      entry.openingDebit += debit;
      entry.openingCredit += credit;
    } else {
      // Period movement
      entry.periodDebit += debit;
      entry.periodCredit += credit;
    }
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
