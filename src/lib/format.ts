/**
 * Audit 6F: Zentrale Locale-Konstanten gegen LOCALE_DE-Hardcoding-Verteilung.
 *
 * `LOCALE_DE` ist der Default für Formatierungs-Calls in WPM. Für die
 * Mehrsprachigkeit (EN-Anteile in CRM-Aktivitäten etc.) gibt es zusätzlich
 * `LOCALE_EN`. UI-Komponenten sollen NICHT mehr LOCALE_DE inline schreiben —
 * stattdessen aus diesem Modul importieren.
 */
export const LOCALE_DE = "de-DE";
export const LOCALE_EN = "en-US";
export const CURRENCY_EUR = "EUR";

/**
 * Format date as dd.MM.yyyy (German standard)
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "–";
  return d.toLocaleDateString(LOCALE_DE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Format date and time as dd.MM.yyyy HH:mm
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "–";
  return d.toLocaleDateString(LOCALE_DE, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Format a number as EUR currency string (German locale)
 * Example: 1234.56 → "1.234,56 €"
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat(LOCALE_DE, {
    style: "currency",
    currency: CURRENCY_EUR,
  }).format(num);
}

/**
 * Format a number as compact EUR currency (e.g., "1,2 Mio. €", "500 Tsd. €")
 */
export function formatCurrencyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat(LOCALE_DE, {
    style: "currency",
    currency: CURRENCY_EUR,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
}

/**
 * Format a number with German thousands separator + decimal places.
 * Sprint 1: Konsolidiert die 2 Duplikate aus pdf/utils/formatters und analytics/kpis.
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 0,
): string {
  if (value === null || value === undefined) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat(LOCALE_DE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format a percentage.
 * - `decimals`: Nachkommastellen (default 0)
 * - `withSign`: prefix "+" for positive (default false)
 * - `withSpace`: " %" statt "%" (default false — kompakt für KPI)
 */
export function formatPercent(
  value: number | string | null | undefined,
  opts: { decimals?: number; withSign?: boolean; withSpace?: boolean } = {},
): string {
  if (value === null || value === undefined) return "0%";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0%";
  const decimals = opts.decimals ?? 0;
  const sign = opts.withSign && num > 0 ? "+" : "";
  const space = opts.withSpace ? " " : "";
  return `${sign}${num.toFixed(decimals)}${space}%`;
}

/**
 * Round to N decimals (default 2 — Geldbeträge).
 * Sprint 1: Konsolidiert round + round2 aus analytics/query-helpers + invoice-generator.
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format turbine capacity (kW → MW above 1000).
 * Examples: 800 → "800 kW", 3500 → "3.5 MW"
 */
export function formatCapacity(kw: number): string {
  if (kw >= 1000) {
    return `${(kw / 1000).toFixed(1)} MW`;
  }
  return `${kw.toFixed(0)} kW`;
}

/**
 * Format a duration in milliseconds as human-readable string.
 * Examples: 45000 → "45s", 125000 → "2m 5s"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// =============================================================================
// XML / SEPA / e-Invoice Helper — konsolidiert aus dem entfallenen
// lib/formatters.ts. Fest-formatierte 2-Nachkommastellen bzw. ISO/CII-Datum.
// =============================================================================

/** Format amount with exactly 2 decimal places (Punkt als Dezimaltrenner). */
export function formatAmountFixed2(amount: number): string {
  return amount.toFixed(2);
}

/** Format date as ISO 8601 (YYYY-MM-DD) — used in XRechnung / UBL. */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format date as CII format (YYYYMMDD) — used in ZUGFeRD. */
export function formatDateCII(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
