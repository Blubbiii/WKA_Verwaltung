/**
 * Shared types for the bank statement import (MT940 / CAMT.054) feature.
 */

// ============================================================================
// PARSED TRANSACTION
// ============================================================================

/**
 * A normalised transaction extracted from an MT940 or CAMT.054 file.
 * amount > 0 = incoming payment (credit), amount < 0 = outgoing (debit).
 */
export interface ParsedTransaction {
  /** Booking / value date */
  date: Date;
  /** Signed amount: positive = credit (Eingang), negative = debit (Ausgang) */
  amount: number;
  /** ISO-4217 currency code, e.g. "EUR" */
  currency: string;
  /** Verwendungszweck / remittance information (free text) */
  reference: string;
  /** Name of the other party */
  counterpartName?: string;
  /** IBAN of the other party */
  counterpartIban?: string;
  /** Bank-assigned transaction reference */
  bankReference?: string;
}

// ============================================================================
// MATCH RESULT
// ============================================================================

/**
 * The result of matching a single ParsedTransaction against open invoices.
 */
export interface MatchResult {
  transaction: ParsedTransaction;
  /** The matched invoice ID (null if no match) */
  matchedInvoiceId: string | null;
  /** The matched invoice number for display */
  matchedInvoiceNumber: string | null;
  /** The gross amount of the matched invoice */
  matchedAmount: number | null;
  /**
   * Match confidence:
   * - "high"   — invoice number found in reference text
   * - "medium" — exact amount match + due date within ±30 days
   * - "none"   — no match found
   */
  confidence: "high" | "medium" | "none";
}

// ============================================================================
// CONFIRM REQUEST / RESPONSE
// ============================================================================

export interface BankImportConfirmation {
  invoiceId: string;
  /** ISO date string of the transaction (used as paidAt) */
  paidAt: string;
  paymentReference?: string;
}

export interface BankImportConfirmResponse {
  confirmed: number;
  failed: number;
  errors: string[];
}
