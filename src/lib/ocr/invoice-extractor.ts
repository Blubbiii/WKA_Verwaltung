/**
 * Invoice Field Extractor
 *
 * Extracts structured invoice fields from raw OCR text using regex patterns
 * tuned for German invoice formats.
 */

export interface ExtractedInvoiceFields {
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  grossAmount: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  iban: string | null;
  bic: string | null;
  vendorName: string | null;
  paymentReference: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchFirst(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m ? (m[1] ?? m[0]).trim() : null;
}

/** Parse a German formatted amount string like "1.234,56" → 1234.56 */
function parseGermanAmount(raw: string | null): number | null {
  if (!raw) return null;
  // Remove thousands separators (dots) and replace decimal comma with dot
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/** Parse a German date string like "01.12.2024" → Date */
function parseGermanDate(raw: string | null): Date | null {
  if (!raw) return null;
  const parts = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!parts) return null;
  const [, day, month, year] = parts;
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return isNaN(d.getTime()) ? null : d;
}

/** Basic mod-97 IBAN validation */
function isValidIban(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55)
  );
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char)) % 97;
  }
  return remainder === 1;
}

// ---------------------------------------------------------------------------
// Extraction patterns
// ---------------------------------------------------------------------------

const PATTERNS = {
  invoiceNumber: [
    /Rechnungsnummer[:\s#]+([A-Z0-9\-\/_.]+)/i,
    /Re(?:chnungs)?[-.\s]?Nr\.?[:\s]+([A-Z0-9\-\/_.]+)/i,
    /Rechnung\s+Nr\.?[:\s]+([A-Z0-9\-\/_.]+)/i,
    /Invoice\s+No\.?[:\s]+([A-Z0-9\-\/_.]+)/i,
  ],

  invoiceDate: [
    /Rechnungsdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /Datum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /Ausgestellt(?:\s+am)?[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
  ],

  dueDate: [
    /F[äa]lligkeitsdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /F[äa]llig(?:\s+am)?[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /Zahlungsziel[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /zu zahlen bis[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
  ],

  grossAmount: [
    /Gesamtbetrag[:\s]+([\d.,]+)/i,
    /Bruttobetrag[:\s]+([\d.,]+)/i,
    /Gesamtsumme[:\s]+([\d.,]+)/i,
    /Rechnungsbetrag[:\s]+([\d.,]+)/i,
    /Zu zahlen(?:der Betrag)?[:\s]+([\d.,]+)/i,
    /Total[:\s]+([\d.,]+)/i,
  ],

  netAmount: [
    /Nettobetrag[:\s]+([\d.,]+)/i,
    /Netto[:\s]+([\d.,]+)/i,
    /Betrag ohne (?:MwSt|Steuer)[:\s]+([\d.,]+)/i,
  ],

  vatAmount: [
    /Mehrwertsteuer[:\s]+([\d.,]+)/i,
    /MwSt\.?[:\s]+([\d.,]+)/i,
    /USt\.?[:\s]+([\d.,]+)/i,
    /Umsatzsteuer[:\s]+([\d.,]+)/i,
  ],

  vatRate: [
    /(\d{1,2})\s*%\s*(?:MwSt|USt|Steuer)/i,
    /MwSt\.?\s+(\d{1,2})\s*%/i,
  ],

  iban: [/\b(DE\d{2}[\d\s]{18,22})/i],

  bic: [/BIC[:\s]+([A-Z]{6}[A-Z0-9]{2,5})/i, /\b([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/],

  paymentReference: [
    /Verwendungszweck[:\s]+(.+)/i,
    /Betreff[:\s]+(.+)/i,
    /Zahlungsreferenz[:\s]+(.+)/i,
  ],
};

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

export function extractInvoiceFields(text: string): ExtractedInvoiceFields {
  const result: ExtractedInvoiceFields = {
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    grossAmount: null,
    netAmount: null,
    vatAmount: null,
    vatRate: null,
    iban: null,
    bic: null,
    vendorName: null,
    paymentReference: null,
  };

  // Invoice number
  for (const pattern of PATTERNS.invoiceNumber) {
    const m = matchFirst(text, pattern);
    if (m && m.length >= 2) {
      result.invoiceNumber = m;
      break;
    }
  }

  // Invoice date
  for (const pattern of PATTERNS.invoiceDate) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.invoiceDate = parseGermanDate(m);
      if (result.invoiceDate) break;
    }
  }

  // Due date
  for (const pattern of PATTERNS.dueDate) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.dueDate = parseGermanDate(m);
      if (result.dueDate) break;
    }
  }

  // Gross amount
  for (const pattern of PATTERNS.grossAmount) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.grossAmount = parseGermanAmount(m);
      if (result.grossAmount !== null) break;
    }
  }

  // Net amount
  for (const pattern of PATTERNS.netAmount) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.netAmount = parseGermanAmount(m);
      if (result.netAmount !== null) break;
    }
  }

  // VAT amount
  for (const pattern of PATTERNS.vatAmount) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.vatAmount = parseGermanAmount(m);
      if (result.vatAmount !== null) break;
    }
  }

  // VAT rate
  for (const pattern of PATTERNS.vatRate) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.vatRate = parseFloat(m);
      if (!isNaN(result.vatRate)) break;
    }
  }

  // IBAN
  for (const pattern of PATTERNS.iban) {
    const raw = matchFirst(text, pattern);
    if (raw) {
      const cleaned = raw.replace(/\s/g, "");
      if (isValidIban(cleaned)) {
        result.iban = cleaned;
        break;
      }
    }
  }

  // BIC (only if IBAN found to avoid false positives)
  if (result.iban) {
    for (const pattern of PATTERNS.bic) {
      const m = matchFirst(text, pattern);
      if (m && /^[A-Z]{6}[A-Z0-9]{2,5}$/.test(m)) {
        result.bic = m;
        break;
      }
    }
  }

  // Payment reference (first 140 chars)
  for (const pattern of PATTERNS.paymentReference) {
    const m = matchFirst(text, pattern);
    if (m) {
      result.paymentReference = m.slice(0, 140).trim();
      break;
    }
  }

  // Derive missing amounts from known ones
  if (result.grossAmount && result.vatAmount && !result.netAmount) {
    result.netAmount = Math.round((result.grossAmount - result.vatAmount) * 100) / 100;
  }
  if (result.grossAmount && result.netAmount && !result.vatAmount) {
    result.vatAmount = Math.round((result.grossAmount - result.netAmount) * 100) / 100;
  }
  if (result.netAmount && result.vatAmount && !result.grossAmount) {
    result.grossAmount = Math.round((result.netAmount + result.vatAmount) * 100) / 100;
  }
  if (result.netAmount && result.grossAmount && !result.vatRate) {
    const rate = ((result.grossAmount - result.netAmount) / result.netAmount) * 100;
    // Round to nearest common rate: 7, 19
    if (Math.abs(rate - 7) < 2) result.vatRate = 7;
    else if (Math.abs(rate - 19) < 2) result.vatRate = 19;
    else result.vatRate = Math.round(rate * 100) / 100;
  }

  return result;
}
