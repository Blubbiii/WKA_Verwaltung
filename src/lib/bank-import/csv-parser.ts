/**
 * CSV Bank Statement Parser
 *
 * Parses common German bank CSV formats (Sparkasse, Volksbank, etc.).
 * Auto-detects delimiter and column mapping.
 */

import type { ParsedTransaction } from "./types";

interface ColumnMap {
  date: number;
  amount: number;
  reference: number;
  counterpartName?: number;
  counterpartIban?: number;
  currency?: number;
}

// Known CSV column header patterns for German banks
const COLUMN_PATTERNS: Record<string, RegExp> = {
  date: /buchungstag|buchungsdatum|valuta|datum|date|wertstellung/i,
  amount: /betrag|umsatz|amount|soll\/haben/i,
  reference: /verwendungszweck|buchungstext|beschreibung|reference|vorgang\/verwendungszweck/i,
  counterpartName: /beg[üu]nstigter|auftraggeber|empf[äa]nger|name|kontoinhaber/i,
  counterpartIban: /kontonummer.*iban|iban|konto/i,
  currency: /w[äa]hrung|currency/i,
};

function detectDelimiter(lines: string[]): string {
  // Check first few lines for delimiter
  const sample = lines.slice(0, 5).join("\n");
  const semicolonCount = (sample.match(/;/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;

  if (tabCount > semicolonCount && tabCount > commaCount) return "\t";
  if (semicolonCount >= commaCount) return ";";
  return ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectColumns(headers: string[], delimiter: string): ColumnMap | null {
  const cols = splitCsvLine(headers.join(delimiter), delimiter);

  let dateIdx = -1;
  let amountIdx = -1;
  let refIdx = -1;
  let nameIdx: number | undefined;
  let ibanIdx: number | undefined;
  let currIdx: number | undefined;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i].replace(/"/g, "").trim();
    if (dateIdx === -1 && COLUMN_PATTERNS.date.test(col)) dateIdx = i;
    if (amountIdx === -1 && COLUMN_PATTERNS.amount.test(col)) amountIdx = i;
    if (refIdx === -1 && COLUMN_PATTERNS.reference.test(col)) refIdx = i;
    if (nameIdx === undefined && COLUMN_PATTERNS.counterpartName.test(col)) nameIdx = i;
    if (ibanIdx === undefined && COLUMN_PATTERNS.counterpartIban.test(col)) ibanIdx = i;
    if (currIdx === undefined && COLUMN_PATTERNS.currency.test(col)) currIdx = i;
  }

  if (dateIdx === -1 || amountIdx === -1) return null;
  if (refIdx === -1) refIdx = amountIdx; // fallback

  return {
    date: dateIdx,
    amount: amountIdx,
    reference: refIdx,
    counterpartName: nameIdx,
    counterpartIban: ibanIdx,
    currency: currIdx,
  };
}

function parseGermanDate(dateStr: string): Date | null {
  // Try DD.MM.YYYY
  const deMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (deMatch) {
    const year = deMatch[3].length === 2 ? 2000 + parseInt(deMatch[3]) : parseInt(deMatch[3]);
    return new Date(year, parseInt(deMatch[2]) - 1, parseInt(deMatch[1]));
  }
  // Try YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Fallback
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseGermanAmount(amountStr: string): number {
  // German: "1.234,56" or "-1.234,56" or "1234,56"
  // English: "1,234.56"
  let clean = amountStr.replace(/["\s]/g, "");

  // Detect format: if last separator is comma → German
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  if (lastComma > lastDot) {
    // German format
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // English format
    clean = clean.replace(/,/g, "");
  }

  return parseFloat(clean) || 0;
}

export function parseCsvBankStatement(text: string): ParsedTransaction[] {
  // Handle BOM
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines);

  // Find header row (skip metadata lines some banks add)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    // Header row has multiple columns and matches known patterns
    if (cols.length >= 3) {
      const matchCount = cols.filter((c) =>
        Object.values(COLUMN_PATTERNS).some((p) => p.test(c.replace(/"/g, "")))
      ).length;
      if (matchCount >= 2) {
        headerIdx = i;
        break;
      }
    }
  }

  const headerCols = splitCsvLine(lines[headerIdx], delimiter);
  const colMap = detectColumns(headerCols, delimiter);
  if (!colMap) return [];

  const result: ParsedTransaction[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.length <= colMap.amount) continue;

    const dateStr = cols[colMap.date]?.replace(/"/g, "").trim();
    const amountStr = cols[colMap.amount]?.replace(/"/g, "").trim();

    if (!dateStr || !amountStr) continue;

    const date = parseGermanDate(dateStr);
    if (!date) continue;

    const amount = parseGermanAmount(amountStr);
    if (amount === 0) continue;

    const reference = cols[colMap.reference]?.replace(/"/g, "").trim() || "";
    const counterpartName = colMap.counterpartName !== undefined
      ? cols[colMap.counterpartName]?.replace(/"/g, "").trim()
      : undefined;
    const counterpartIban = colMap.counterpartIban !== undefined
      ? cols[colMap.counterpartIban]?.replace(/"/g, "").trim()
      : undefined;
    const currency = colMap.currency !== undefined
      ? cols[colMap.currency]?.replace(/"/g, "").trim() || "EUR"
      : "EUR";

    result.push({
      date,
      amount,
      currency,
      reference,
      counterpartName: counterpartName || undefined,
      counterpartIban: counterpartIban || undefined,
    });
  }

  return result;
}
