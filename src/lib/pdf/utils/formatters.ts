/**
 * Formatierungsfunktionen für PDF-Dokumente
 */

// Re-export centralized formatCurrency
export { formatCurrency } from "@/lib/format";

/**
 * Formatiert eine Zahl mit Dezimalstellen
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 2
): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Formatiert ein Datum im deutschen Format
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formatiert eine Prozentangabe
 */
export function formatPercent(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return `${formatNumber(num, 0)} %`;
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
