/**
 * Invoice matching logic for bank import.
 * Matches ParsedTransactions against open (SENT) invoices for the tenant.
 *
 * P18 (D10): Skonto-Toleranz im Amount-Match. Statt nur exakter Cent-
 * Übereinstimmung akzeptieren wir auch Zahlungen, deren Differenz dem
 * Skonto-Betrag entspricht UND die innerhalb der Skonto-Frist eingingen.
 */

import { prisma } from "@/lib/prisma";
import type { ParsedTransaction, MatchResult } from "./types";
import { MS_PER_DAY } from "@/lib/constants/time";
import { evaluateSkontoMatch } from "@/lib/banking/skonto-matcher";
import { getTenantSettings } from "@/lib/tenant-settings";

/** Maximum days between transaction date and invoice due date for a medium match */
const MEDIUM_MATCH_MAX_DAYS = 30;

/** Regex patterns to find invoice numbers in reference text */
const INVOICE_NUMBER_PATTERNS = [
  /\b(\d{4}\/\d+)\b/,           // "2024/001"
  /\bR[Ee]-?\d{4}-?\d+\b/,      // "RE2024001", "RE-2024-001"
  /\bRE\s*\d{4}\/\d+\b/i,       // "RE 2024/001"
  /\bRG-?\d{6,}\b/,             // "RG-202400123"
];

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  grossAmount: number;
  dueDate: Date | null;
  currency: string;
  /** P18: für Skonto-Match. */
  skontoDeadline: Date | null;
  skontoAmount: number | null;
  skontoPercent: number | null;
}

/**
 * Match a list of parsed bank transactions against open invoices for the tenant.
 * Each transaction gets a confidence level: "high", "medium", or "none".
 */
export async function matchTransactions(
  transactions: ParsedTransaction[],
  tenantId: string
): Promise<MatchResult[]> {
  // Bank-Match-Toleranz aus Tenant-Setting (Default 0,02 €).
  const settings = await getTenantSettings(tenantId);
  const toleranceEur = settings.bankMatchToleranceEur;

  // Load all open (SENT/PARTIALLY_PAID) invoices once.
  // P16: PARTIALLY_PAID gehört auch in den Match-Pool — eine Folgezahlung
  // könnte sie auf PAID bringen.
  const openInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["SENT", "PARTIALLY_PAID"] },
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      grossAmount: true,
      dueDate: true,
      currency: true,
      skontoDeadline: true,
      skontoAmount: true,
      skontoPercent: true,
    },
  });

  const invoices: OpenInvoice[] = openInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    grossAmount: Number(inv.grossAmount),
    dueDate: inv.dueDate,
    currency: inv.currency,
    skontoDeadline: inv.skontoDeadline,
    skontoAmount: inv.skontoAmount === null ? null : Number(inv.skontoAmount),
    skontoPercent: inv.skontoPercent === null ? null : Number(inv.skontoPercent),
  }));

  // Track which invoices have already been matched (1:1 matching)
  const matchedInvoiceIds = new Set<string>();

  return transactions.map((tx) => {
    // Only try to match incoming payments (positive amounts)
    if (tx.amount <= 0) {
      return noMatch(tx);
    }

    // Priority 1: match via invoice number in reference.
    // Randfall 8: die Confidence hängt jetzt zusätzlich am Betrag — eine
    // Rechnungsnummer allein macht eine Teilzahlung nicht zum sicheren Treffer.
    const numberMatch = findByInvoiceNumber(tx, invoices, matchedInvoiceIds);
    if (numberMatch) {
      matchedInvoiceIds.add(numberMatch.id);
      const amountFits = evaluateSkontoMatch({
        txAmount: Math.abs(tx.amount),
        txDate: tx.date,
        grossAmount: numberMatch.grossAmount,
        skontoDeadline: numberMatch.skontoDeadline,
        skontoAmount: numberMatch.skontoAmount,
        skontoPercent: numberMatch.skontoPercent,
        toleranceEur,
      }).matches;

      return {
        transaction: tx,
        matchedInvoiceId: numberMatch.id,
        matchedInvoiceNumber: numberMatch.invoiceNumber,
        // Randfall 8: der GEFLOSSENE Betrag, nicht die Rechnungssumme.
        matchedAmount: Math.abs(tx.amount),
        confidence: amountFits ? "high" : "medium",
      };
    }

    // Priority 2: medium-confidence match via exact amount + date proximity
    const mediumMatch = findByAmountAndDate(tx, invoices, matchedInvoiceIds, toleranceEur);
    if (mediumMatch) {
      matchedInvoiceIds.add(mediumMatch.id);
      return {
        transaction: tx,
        matchedInvoiceId: mediumMatch.id,
        matchedInvoiceNumber: mediumMatch.invoiceNumber,
        matchedAmount: Math.abs(tx.amount),
        confidence: "medium",
      };
    }

    return noMatch(tx);
  });
}

// ============================================================================
// MATCHING STRATEGIES
// ============================================================================

/**
 * Randfall 8: Mindestlänge für den Substring-Match.
 *
 * `ref.includes(normalised)` ohne Untergrenze ließ eine Rechnungsnummer "100"
 * auf den Verwendungszweck "Rechnung 1002" passen — und weil das ein
 * high-confidence-Treffer ist, war der falsche Beleg im UI vorausgewählt.
 * Unter 6 Zeichen ist ein freier Substring-Treffer nicht aussagekräftig
 * genug; kürzere Nummern müssen über die Regex-Patterns laufen, die auf
 * Wortgrenzen ankern.
 */
const MIN_SUBSTRING_MATCH_LENGTH = 6;

/**
 * Randfall 8: Betragsprüfung auch beim Nummern-Match.
 *
 * findByInvoiceNumber() prüfte den Betrag ÜBERHAUPT NICHT. Eine Abschlags-
 * oder Teilzahlung mit korrekter Rechnungsnummer im Verwendungszweck wurde
 * als "high" gemeldet und `matchedAmount` war die volle Rechnungssumme statt
 * des tatsächlichen Zahlbetrags — im Confirm-Flow wurde damit zu viel als
 * bezahlt verbucht.
 *
 * Jetzt entscheidet der Betrag über die Confidence:
 *   passt (inkl. Toleranz/Skonto) → "high"
 *   passt nicht                   → "medium", damit der Anwender hinschaut
 * `matchedAmount` ist in beiden Fällen der GEFLOSSENE Betrag.
 */
function findByInvoiceNumber(
  tx: ParsedTransaction,
  invoices: OpenInvoice[],
  excludeIds: Set<string>
): OpenInvoice | null {
  const ref = tx.reference.toUpperCase();

  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    const match = ref.match(pattern);
    if (!match) continue;

    const candidate = invoices.find(
      (inv) =>
        !excludeIds.has(inv.id) &&
        normaliseInvoiceNumber(inv.invoiceNumber) === normaliseInvoiceNumber(match[0])
    );
    if (candidate) return candidate;
  }

  // Also try a direct substring search with the invoice number itself.
  // Längste Nummer zuerst prüfen, damit "2024/1002" nicht von "2024/100"
  // verdrängt wird, wenn beide offen sind.
  const bySpecificity = invoices
    .filter((inv) => !excludeIds.has(inv.id))
    .map((inv) => ({ inv, key: normaliseInvoiceNumber(inv.invoiceNumber) }))
    .filter(({ key }) => key.length >= MIN_SUBSTRING_MATCH_LENGTH)
    .sort((a, b) => b.key.length - a.key.length);

  for (const { inv, key } of bySpecificity) {
    if (ref.includes(key)) return inv;
  }

  return null;
}

function findByAmountAndDate(
  tx: ParsedTransaction,
  invoices: OpenInvoice[],
  excludeIds: Set<string>,
  toleranceEur: number,
): OpenInvoice | null {
  const txAmount = Math.abs(tx.amount);

  for (const inv of invoices) {
    if (excludeIds.has(inv.id)) continue;
    if (inv.currency !== tx.currency) continue;

    // P18 (D10): toleranter Match — exakter Cent ODER Rundungs-Toleranz ODER
    // valider Skonto-Abzug innerhalb der Frist.
    // Toleranz aus TenantSettings statt hardcoded 0,02 €.
    const skontoResult = evaluateSkontoMatch({
      txAmount,
      txDate: tx.date,
      grossAmount: inv.grossAmount,
      skontoDeadline: inv.skontoDeadline,
      skontoAmount: inv.skontoAmount,
      skontoPercent: inv.skontoPercent,
      toleranceEur,
    });

    if (!skontoResult.matches) continue;

    // Date proximity check (für Toleranz-/Skonto-Matches besonders wichtig).
    if (inv.dueDate) {
      const daysDiff =
        Math.abs(tx.date.getTime() - inv.dueDate.getTime()) / MS_PER_DAY;

      if (daysDiff <= MEDIUM_MATCH_MAX_DAYS) return inv;
    } else {
      // No due date — accept amount-only match as medium confidence
      return inv;
    }
  }

  return null;
}

function normaliseInvoiceNumber(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_]/g, "");
}

function noMatch(tx: ParsedTransaction): MatchResult {
  return {
    transaction: tx,
    matchedInvoiceId: null,
    matchedInvoiceNumber: null,
    matchedAmount: null,
    confidence: "none",
  };
}
