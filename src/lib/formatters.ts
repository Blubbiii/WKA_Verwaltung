/**
 * Shared formatting utilities — eliminates duplication across
 * sepa-export, xrechnung-generator, zugferd-generator, csv, excel.
 */

/** Format amount with exactly 2 decimal places */
export function formatAmountFixed2(amount: number): string {
  return amount.toFixed(2);
}

/** Format date as ISO 8601 (YYYY-MM-DD) — used in XRechnung */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format date as CII format (YYYYMMDD) — used in ZUGFeRD */
export function formatDateCII(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Safely get a nested value from an object by dot-separated path */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
