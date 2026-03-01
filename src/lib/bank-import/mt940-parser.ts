/**
 * MT940 bank statement parser.
 * Uses the `mt940js` npm package which handles the full SWIFT MT940 spec.
 */

import { Parser } from "mt940js";
import type { ParsedTransaction } from "./types";

const parser = new Parser();

/**
 * Parse an MT940 text file into a list of normalised transactions.
 * The `mt940js` parser already returns signed amounts
 * (positive = credit/Eingang, negative = debit/Ausgang).
 */
export function parseMt940(text: string): ParsedTransaction[] {
  const statements = parser.parse(text);
  const result: ParsedTransaction[] = [];

  for (const statement of statements) {
    const currency = statement.currency || "EUR";

    for (const tx of statement.transactions) {
      // mt940js returns signed amount: positive = credit, negative = debit
      result.push({
        date: tx.date instanceof Date ? tx.date : new Date(tx.date),
        amount: tx.amount,
        currency,
        reference: cleanReference(tx.details || tx.extraDetails || ""),
        counterpartName: extractCounterpartName(tx.details || ""),
        bankReference: tx.bankReference || undefined,
      });
    }
  }

  return result;
}

/**
 * Normalise the details/Verwendungszweck text:
 * MT940 often encodes the reference in a structured :86: tag with sub-fields.
 * We extract just the human-readable parts (SVWZ+, EREF+, KREF+, etc.).
 */
function cleanReference(details: string): string {
  if (!details) return "";

  // SEPA structured reference: extract SVWZ+ (Verwendungszweck)
  const svwzMatch = details.match(/SVWZ\+([^+]+)/);
  if (svwzMatch) return svwzMatch[1].trim();

  // EREF (end-to-end reference)
  const erefMatch = details.match(/EREF\+([^+]+)/);
  if (erefMatch) return erefMatch[1].trim();

  // Return as-is, collapsed whitespace
  return details.replace(/\s+/g, " ").trim();
}

/**
 * Try to extract a counterpart name from SEPA-structured :86: details.
 * NAMA+ or ABWA+ sub-fields contain the name.
 */
function extractCounterpartName(details: string): string | undefined {
  const namaMatch = details.match(/NAMA\+([^+]+)/);
  if (namaMatch) return namaMatch[1].trim();

  const abwaMatch = details.match(/ABWA\+([^+]+)/);
  if (abwaMatch) return abwaMatch[1].trim();

  return undefined;
}
