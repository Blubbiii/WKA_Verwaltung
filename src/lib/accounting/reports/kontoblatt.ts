/**
 * Kontoblatt / Kontoausdruck — Pro Konto chronologisch alle Buchungen + OPOS.
 *
 * Der Steuerberater-Klassiker: für ein einzelnes Konto alle Buchungen
 * mit Gegenkonto, Belegnummer, Datum und Saldo-Verlauf.
 *
 * Saldo-Logik:
 *   - Anfangssaldo wird aus OpeningBalance + allen Buchungen vor
 *     periodStart abgeleitet
 *   - Pro Buchungszeile wird der Running-Saldo aktualisiert
 *   - Endsaldo ist der Wert nach der letzten Buchung
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { getCachedReport } from "@/lib/cache/reports";

export interface KontoblattLine {
  /** Belegnummer / Reference. */
  reference: string | null;
  /** Buchungsdatum. */
  entryDate: Date;
  /** Beschreibung der Buchung. */
  description: string;
  /** Gegenkonto (erstes anderes Konto im selben JournalEntry). */
  gegenkonto: string | null;
  /** Soll-Bewegung dieser Zeile (positiv). */
  debit: number;
  /** Haben-Bewegung dieser Zeile (positiv). */
  credit: number;
  /** Saldo NACH dieser Buchung. */
  runningBalance: number;
  /** Status der zugehörigen JournalEntry (für Filter UI). */
  status: "DRAFT" | "POSTED";
  /** ID der JournalEntry für Detail-Drill-Down. */
  journalEntryId: string;
}

export interface KontoblattResult {
  accountNumber: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: KontoblattLine[];
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateKontoblatt(
  tenantId: string,
  accountNumber: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<KontoblattResult> {
  // Redis-Cache. POSTED-Journale unveränderlich → safe to cache.
  const cacheKey = `${accountNumber}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
  return getCachedReport("kontoblatt", tenantId, cacheKey, () =>
    generateKontoblattUncached(tenantId, accountNumber, periodStart, periodEnd),
  );
}

async function generateKontoblattUncached(
  tenantId: string,
  accountNumber: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<KontoblattResult> {
  // Konto-Stamm laden
  const account = await prisma.ledgerAccount.findFirst({
    where: { tenantId, accountNumber },
    select: { id: true, accountNumber: true, name: true },
  });

  if (!account) {
    return {
      accountNumber,
      accountName: accountNumber,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      openingBalance: 0,
      closingBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      lines: [],
    };
  }

  const fiscalYear = periodStart.getUTCFullYear();

  // Schritt 1: Anfangssaldo = Saldenvortrag + alle Bewegungen vor periodStart
  const opening = await prisma.openingBalance.findFirst({
    where: { tenantId, fiscalYear, ledgerAccountId: account.id },
    select: { debitAmount: true, creditAmount: true },
  });

  const openingDebit = toNum(opening?.debitAmount);
  const openingCredit = toNum(opening?.creditAmount);

  // Bewegungen vor periodStart aggregieren (im gleichen Wirtschaftsjahr).
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1));
  const movementsBefore = await prisma.journalEntryLine.aggregate({
    where: {
      account: accountNumber,
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: yearStart, lt: periodStart },
      },
    },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const beforeDebit = toNum(movementsBefore._sum.debitAmount);
  const beforeCredit = toNum(movementsBefore._sum.creditAmount);
  const startBalance = openingDebit - openingCredit + beforeDebit - beforeCredit;

  // Schritt 2: Bewegungen im Zeitraum (mit JournalEntry für Gegenkonto)
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      account: accountNumber,
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: periodStart, lte: periodEnd },
      },
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryDate: true,
          description: true,
          reference: true,
          status: true,
          lines: {
            select: { account: true },
          },
        },
      },
    },
    orderBy: [
      { journalEntry: { entryDate: "asc" } },
      { lineNumber: "asc" },
    ],
  });

  let running = startBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const reportLines: KontoblattLine[] = [];

  for (const l of lines) {
    const debit = toNum(l.debitAmount);
    const credit = toNum(l.creditAmount);
    totalDebit += debit;
    totalCredit += credit;
    running += debit - credit;

    // Gegenkonto: erstes anderes Konto im selben Journal Entry
    const gegenkonto =
      l.journalEntry.lines.find((line) => line.account !== accountNumber)?.account ?? null;

    reportLines.push({
      reference: l.journalEntry.reference,
      entryDate: l.journalEntry.entryDate,
      description: l.journalEntry.description,
      gegenkonto,
      debit,
      credit,
      runningBalance: Math.round(running * 100) / 100,
      status: l.journalEntry.status,
      journalEntryId: l.journalEntry.id,
    });
  }

  return {
    accountNumber: account.accountNumber,
    accountName: account.name,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    openingBalance: Math.round(startBalance * 100) / 100,
    closingBalance: Math.round(running * 100) / 100,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    lines: reportLines,
  };
}
