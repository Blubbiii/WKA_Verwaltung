/**
 * Invoice matching logic for bank import.
 * Matches ParsedTransactions against open (SENT) invoices for the tenant.
 */

import { prisma } from "@/lib/prisma";
import type { ParsedTransaction, MatchResult } from "./types";

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
}

/**
 * Match a list of parsed bank transactions against open invoices for the tenant.
 * Each transaction gets a confidence level: "high", "medium", or "none".
 */
export async function matchTransactions(
  transactions: ParsedTransaction[],
  tenantId: string
): Promise<MatchResult[]> {
  // Load all open (SENT) invoices once
  const openInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "SENT",
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      grossAmount: true,
      dueDate: true,
      currency: true,
    },
  });

  const invoices: OpenInvoice[] = openInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    grossAmount: Number(inv.grossAmount),
    dueDate: inv.dueDate,
    currency: inv.currency,
  }));

  // Track which invoices have already been matched (1:1 matching)
  const matchedInvoiceIds = new Set<string>();

  return transactions.map((tx) => {
    // Only try to match incoming payments (positive amounts)
    if (tx.amount <= 0) {
      return noMatch(tx);
    }

    // Priority 1: high-confidence match via invoice number in reference
    const highMatch = findByInvoiceNumber(tx, invoices, matchedInvoiceIds);
    if (highMatch) {
      matchedInvoiceIds.add(highMatch.id);
      return {
        transaction: tx,
        matchedInvoiceId: highMatch.id,
        matchedInvoiceNumber: highMatch.invoiceNumber,
        matchedAmount: highMatch.grossAmount,
        confidence: "high",
      };
    }

    // Priority 2: medium-confidence match via exact amount + date proximity
    const mediumMatch = findByAmountAndDate(tx, invoices, matchedInvoiceIds);
    if (mediumMatch) {
      matchedInvoiceIds.add(mediumMatch.id);
      return {
        transaction: tx,
        matchedInvoiceId: mediumMatch.id,
        matchedInvoiceNumber: mediumMatch.invoiceNumber,
        matchedAmount: mediumMatch.grossAmount,
        confidence: "medium",
      };
    }

    return noMatch(tx);
  });
}

// ============================================================================
// MATCHING STRATEGIES
// ============================================================================

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

  // Also try a direct substring search with the invoice number itself
  for (const inv of invoices) {
    if (excludeIds.has(inv.id)) continue;
    const normalised = normaliseInvoiceNumber(inv.invoiceNumber);
    if (normalised && ref.includes(normalised)) {
      return inv;
    }
  }

  return null;
}

function findByAmountAndDate(
  tx: ParsedTransaction,
  invoices: OpenInvoice[],
  excludeIds: Set<string>
): OpenInvoice | null {
  const txAmount = Math.abs(tx.amount);

  for (const inv of invoices) {
    if (excludeIds.has(inv.id)) continue;
    if (inv.currency !== tx.currency) continue;

    // Exact amount match (rounded to 2 decimal places)
    const amountMatches =
      Math.round(txAmount * 100) === Math.round(inv.grossAmount * 100);

    if (!amountMatches) continue;

    // Date proximity check
    if (inv.dueDate) {
      const daysDiff =
        Math.abs(tx.date.getTime() - inv.dueDate.getTime()) /
        (1000 * 60 * 60 * 24);

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
