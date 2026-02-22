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
