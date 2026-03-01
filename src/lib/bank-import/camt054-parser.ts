/**
 * CAMT.054 bank statement parser.
 * CAMT.054 is the modern ISO 20022 XML format used by German banks
 * for account notifications (Kontoauszüge). Uses fast-xml-parser.
 */

import { XMLParser } from "fast-xml-parser";
import type { ParsedTransaction } from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Ensure arrays even for single-element lists
  isArray: (name) =>
    ["Ntfctn", "Ntry", "TxDtls", "Ustrd"].includes(name),
});

/**
 * Parse a CAMT.054 XML string into a list of normalised transactions.
 */
export function parseCamt054(xmlText: string): ParsedTransaction[] {
  const doc = xmlParser.parse(xmlText);

  // Navigate to the notification entries
  // Path: Document → BkToCstmrDbtCdtNtfctn → Ntfctn → Ntry
  const root =
    doc?.Document?.BkToCstmrDbtCdtNtfctn ||
    doc?.["ns2:Document"]?.BkToCstmrDbtCdtNtfctn ||
    doc?.Document?.BkToCstmrStmt;  // CAMT.053 fallback

  if (!root) return [];

  const notifications: unknown[] = Array.isArray(root.Ntfctn)
    ? root.Ntfctn
    : root.Ntfctn
    ? [root.Ntfctn]
    : root.Stmt
    ? (Array.isArray(root.Stmt) ? root.Stmt : [root.Stmt])
    : [];

  const result: ParsedTransaction[] = [];

  for (const notif of notifications as Record<string, unknown>[]) {
    const currency =
      (notif?.Acct as Record<string, unknown>)?.Ccy as string | undefined;

    const entries = notif?.Ntry;
    if (!entries) continue;

    const entryList = Array.isArray(entries) ? entries : [entries];

    for (const entry of entryList as Record<string, unknown>[]) {
      const tx = parseEntry(entry, currency || "EUR");
      if (tx) result.push(tx);
    }
  }

  return result;
}

function parseEntry(
  entry: Record<string, unknown>,
  defaultCurrency: string
): ParsedTransaction | null {
  // Amount and currency
  const amtField = entry?.Amt as Record<string, unknown> | number | string | undefined;
  let rawAmount = 0;
  let currency = defaultCurrency;

  if (typeof amtField === "object" && amtField !== null) {
    rawAmount = parseFloat(String((amtField as Record<string, unknown>)["#text"] || "0"));
    currency = (amtField as Record<string, unknown>)["@_Ccy"] as string || defaultCurrency;
  } else if (amtField !== undefined) {
    rawAmount = parseFloat(String(amtField));
  }

  if (isNaN(rawAmount)) return null;

  // Direction: CRDT = credit (incoming), DBIT = debit (outgoing)
  const direction = String(entry?.CdtDbtInd || "CRDT");
  const amount = direction === "DBIT" ? -rawAmount : rawAmount;

  // Booking date
  const bookgDt = entry?.BookgDt as Record<string, unknown> | undefined;
  const valDt = entry?.ValDt as Record<string, unknown> | undefined;
  const dateStr =
    (bookgDt?.Dt as string) || (valDt?.Dt as string) || "";
  const date = dateStr ? new Date(dateStr) : new Date();

  // Reference text (Verwendungszweck)
  const ntryDtls = entry?.NtryDtls as Record<string, unknown> | undefined;
  const txDtlsList = ntryDtls?.TxDtls;
  const txDtls = Array.isArray(txDtlsList)
    ? (txDtlsList[0] as Record<string, unknown>)
    : (txDtlsList as Record<string, unknown> | undefined);

  const rmtInf = txDtls?.RmtInf as Record<string, unknown> | undefined;
  let reference = "";
  if (rmtInf?.Ustrd) {
    const ustrd = rmtInf.Ustrd;
    reference = Array.isArray(ustrd)
      ? (ustrd as string[]).join(" ")
      : String(ustrd);
  }

  // Counterpart
  const rltdPties = txDtls?.RltdPties as Record<string, unknown> | undefined;
  const counterpartName = extractPartyName(
    direction === "DBIT"
      ? (rltdPties?.Cdtr as Record<string, unknown>)
      : (rltdPties?.Dbtr as Record<string, unknown>)
  );
  const counterpartIban = extractIban(
    direction === "DBIT"
      ? (rltdPties?.CdtrAcct as Record<string, unknown>)
      : (rltdPties?.DbtrAcct as Record<string, unknown>)
  );

  // Bank reference
  const refs = txDtls?.Refs as Record<string, unknown> | undefined;
  const bankReference = (refs?.TxId as string) || (refs?.EndToEndId as string) || undefined;

  return {
    date,
    amount,
    currency,
    reference: reference.trim(),
    counterpartName,
    counterpartIban,
    bankReference,
  };
}

function extractPartyName(party: Record<string, unknown> | undefined): string | undefined {
  if (!party) return undefined;
  const nm = (party?.Nm as string) || ((party?.FinInstnId as Record<string, unknown>)?.Nm as string);
  return nm || undefined;
}

function extractIban(acct: Record<string, unknown> | undefined): string | undefined {
  if (!acct) return undefined;
  const id = acct?.Id as Record<string, unknown> | undefined;
  return (id?.IBAN as string) || undefined;
}
