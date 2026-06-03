/**
 * Format date as dd.MM.yyyy (German standard)
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Format date and time as dd.MM.yyyy HH:mm
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Format a number as EUR currency string (German locale)
 * Example: 1234.56 → "1.234,56 €"
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

/**
 * Format a number as compact EUR currency (e.g., "1,2 Mio. €", "500 Tsd. €")
 */
export function formatCurrencyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
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
  return new Intl.NumberFormat("de-DE", {
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
