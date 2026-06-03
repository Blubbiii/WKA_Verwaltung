/**
 * Formatierungsfunktionen für PDF-Dokumente
 *
 * Sprint 1: format/percent/number/date wurden nach src/lib/format.ts
 * konsolidiert. Diese Datei behält PDF-spezifische Helper (Adresse,
 * Sender, calculateTotals) und re-exportiert die generischen Formatter.
 */

// Re-export centralized formatters
export { formatCurrency, formatDate } from "@/lib/format";
import {
  formatDate,
  formatNumber as formatNumberBase,
  formatPercent as formatPercentBase,
} from "@/lib/format";

/**
 * PDF-Standard: formatNumber mit 2 Nachkommastellen als Default (anders als
 * das generische formatNumber das 0 Default hat).
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 2,
): string {
  return formatNumberBase(value, decimals);
}

/**
 * PDF-Standard: "X %" mit Leerzeichen, 0 Nachkommastellen.
 */
export function formatPercent(value: number | string | null | undefined): string {
  return formatPercentBase(value, { decimals: 0, withSpace: true });
}

/**
 * Formatiert einen Abrechnungszeitraum
 */
export function formatPeriod(startDate: Date | string, endDate: Date | string): string {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

/**
 * Formatiert eine Adresse aus strukturierten Feldern
 */
export function formatAddress(
  street?: string,
  houseNumber?: string,
  postalCode?: string,
  city?: string
): string {
  const parts: string[] = [];
  if (street) parts.push(street + (houseNumber ? ' ' + houseNumber : ''));
  if (postalCode && city) parts.push(`${postalCode} ${city}`);
  else if (postalCode) parts.push(postalCode);
  else if (city) parts.push(city);
  return parts.join('\n');
}

/**
 * Generiert die Absenderzeile für das Adressfenster
 */
export function formatSenderLine(
  companyName: string,
  street?: string,
  houseNumber?: string,
  postalCode?: string,
  city?: string
): string {
  const parts = [companyName];
  const streetLine = street ? street + (houseNumber ? ' ' + houseNumber : '') : undefined;
  if (streetLine) parts.push(streetLine);
  if (postalCode && city) parts.push(`${postalCode} ${city}`);
  return parts.join(" - ");
}

/**
 * Berechnet Netto, MwSt und Brutto aus Positionen
 */
export function calculateTotals(
  items: Array<{
    netAmount: number | string;
    taxRate: number | string;
  }>
): {
  netTotal: number;
  taxTotal: number;
  grossTotal: number;
  taxBreakdown: Array<{ rate: number; net: number; tax: number }>;
} {
  const taxMap = new Map<number, { net: number; tax: number }>();
  let netTotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const net = typeof item.netAmount === "string" ? parseFloat(item.netAmount) : item.netAmount;
    const rate = typeof item.taxRate === "string" ? parseFloat(item.taxRate) : item.taxRate;
    const tax = net * (rate / 100);

    netTotal += net;
    taxTotal += tax;

    const existing = taxMap.get(rate) || { net: 0, tax: 0 };
    taxMap.set(rate, {
      net: existing.net + net,
      tax: existing.tax + tax,
    });
  }

  const taxBreakdown = Array.from(taxMap.entries())
    .map(([rate, values]) => ({ rate, ...values }))
    .sort((a, b) => a.rate - b.rate);

  return {
    netTotal,
    taxTotal,
    grossTotal: netTotal + taxTotal,
    taxBreakdown,
  };
}
