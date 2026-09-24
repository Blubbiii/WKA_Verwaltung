/**
 * Form state of the monthly rate dialog and the request bodies built from it.
 * year, month and revenue type form the unique key and cannot be changed.
 */

export interface MonatssatzFormular {
  year: number;
  month: number | null;
  revenueTypeId: string;
  ratePerKwh: number | null;
  marketValue: number | null;
  managementFee: number | null;
  notes: string;
}

export function leererMonatssatz(year: number): MonatssatzFormular {
  return { year, month: null, revenueTypeId: "", ratePerKwh: null, marketValue: null, managementFee: null, notes: "" };
}

export function monatssatzRumpf(f: MonatssatzFormular, modus: "neu" | "bearbeiten") {
  const werte = {
    ratePerKwh: f.ratePerKwh ?? 0,
    marketValue: f.marketValue,
    managementFee: f.managementFee,
    notes: f.notes.trim() || null,
  };
  return modus === "neu"
    ? { year: f.year, month: f.month ?? 0, revenueTypeId: f.revenueTypeId, ...werte }
    : werte;
}

export function monatssatzFehler(f: MonatssatzFormular, modus: "neu" | "bearbeiten"): string[] {
  const fehler: string[] = [];
  if (modus === "neu" && !f.month) fehler.push("month");
  if (modus === "neu" && !f.revenueTypeId) fehler.push("revenueTypeId");
  if (f.ratePerKwh === null) fehler.push("ratePerKwh");
  return fehler;
}
