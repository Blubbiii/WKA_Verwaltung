/**
 * UStVA (Umsatzsteuervoranmeldung) data preparation.
 * Aggregates tax-relevant JournalEntryLines for ELSTER reporting.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface UstvaLine {
  kennzahl: string; // ELSTER field number
  label: string;
  amount: number;
  taxAmount: number;
}

export interface UstvaResult {
  lines: UstvaLine[];
  periodStart: string;
  periodEnd: string;
  totalTaxPayable: number;
  totalInputTax: number;
  balance: number; // positive = pay, negative = refund
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateUstva(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UstvaResult> {
  const journalLines = await prisma.journalEntryLine.findMany({
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
    },
  });

  // Aggregate by tax-relevant accounts
  let revenue19 = 0;     // KZ 81: Steuerpflichtige Umsaetze 19%
  let revenue7 = 0;      // KZ 86: Steuerpflichtige Umsaetze 7%
  let revenueExempt = 0; // KZ 43: Steuerfreie Umsaetze
  let tax19 = 0;         // Output tax 19% (account 1776)
  let tax7 = 0;          // Output tax 7% (account 1771)
  let inputTax19 = 0;    // Input tax 19% (account 1576)
  let inputTax7 = 0;     // Input tax 7% (account 1571)

  for (const line of journalLines) {
    const credit = toNum(line.creditAmount);
    const debit = toNum(line.debitAmount);
    const acc = line.account;

    // Revenue accounts (8xxx)
    if (acc.startsWith("8")) {
      const net = credit - debit;
      // Simple heuristic: accounts ending with specific patterns
      if (acc === "8200" || acc === "8335" || acc === "8910") {
        revenueExempt += net;
      } else {
        revenue19 += net; // Default to 19%
      }
    }

    // Output tax accounts
    if (acc === "1776") tax19 += credit - debit;
    if (acc === "1771") tax7 += credit - debit;

    // Input tax accounts
    if (acc === "1576") inputTax19 += debit - credit;
    if (acc === "1571") inputTax7 += debit - credit;
  }

  const totalInputTax = inputTax19 + inputTax7;
  const totalTaxPayable = tax19 + tax7;
  const balance = totalTaxPayable - totalInputTax;

  const lines: UstvaLine[] = [
    { kennzahl: "81", label: "Steuerpflichtige Umsaetze 19%", amount: revenue19, taxAmount: tax19 },
    { kennzahl: "86", label: "Steuerpflichtige Umsaetze 7%", amount: revenue7, taxAmount: tax7 },
    { kennzahl: "43", label: "Steuerfreie Umsaetze", amount: revenueExempt, taxAmount: 0 },
    { kennzahl: "66", label: "Vorsteuer aus Rechnungen 19%", amount: 0, taxAmount: inputTax19 },
    { kennzahl: "61", label: "Vorsteuer aus Rechnungen 7%", amount: 0, taxAmount: inputTax7 },
  ];

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalTaxPayable,
    totalInputTax,
    balance,
  };
}
