/**
 * Form state of the PPA dialog and the request bodies built from it.
 */

export type PpaPreismodell = "FIXED" | "INDEXED" | "COLLAR";
export type PpaStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";
export type PpaAbrechnung = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface PpaFormular {
  title: string;
  counterparty: string;
  parkId: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  pricingMode: PpaPreismodell;
  fixedPriceCentKwh: number | null;
  floorPriceCentKwh: number | null;
  capPriceCentKwh: number | null;
  indexBase: string;
  indexMarkupCentKwh: number | null;
  minQuantityMwh: number | null;
  maxQuantityMwh: number | null;
  billingPeriod: PpaAbrechnung;
  status: PpaStatus;
  notes: string;
}

/** Shape of a PPA as the list API returns it (Decimal columns may be strings). */
export interface PpaDatensatz {
  title: string;
  counterparty: string;
  contractNumber: string | null;
  startDate: string;
  endDate: string;
  pricingMode: PpaPreismodell;
  fixedPriceCentKwh: number | string | null;
  floorPriceCentKwh: number | string | null;
  capPriceCentKwh: number | string | null;
  indexBase: string | null;
  indexMarkupCentKwh: number | string | null;
  minQuantityMwh: number | string | null;
  maxQuantityMwh: number | string | null;
  billingPeriod?: PpaAbrechnung;
  status: PpaStatus;
  notes: string | null;
  park: { id: string } | null;
}

export function leeresPpaFormular(): PpaFormular {
  return {
    title: "", counterparty: "", parkId: "", contractNumber: "", startDate: "", endDate: "",
    pricingMode: "FIXED", fixedPriceCentKwh: null, floorPriceCentKwh: null, capPriceCentKwh: null,
    indexBase: "", indexMarkupCentKwh: null, minQuantityMwh: null, maxQuantityMwh: null,
    billingPeriod: "MONTHLY", status: "DRAFT", notes: "",
  };
}

const zahl = (wert: number | string | null) => (wert === null || wert === "" ? null : Number(wert));

export function ppaFormularAus(ppa: PpaDatensatz): PpaFormular {
  return {
    title: ppa.title,
    counterparty: ppa.counterparty,
    parkId: ppa.park?.id ?? "",
    contractNumber: ppa.contractNumber ?? "",
    startDate: ppa.startDate.slice(0, 10),
    endDate: ppa.endDate.slice(0, 10),
    pricingMode: ppa.pricingMode,
    fixedPriceCentKwh: zahl(ppa.fixedPriceCentKwh),
    floorPriceCentKwh: zahl(ppa.floorPriceCentKwh),
    capPriceCentKwh: zahl(ppa.capPriceCentKwh),
    indexBase: ppa.indexBase ?? "",
    indexMarkupCentKwh: zahl(ppa.indexMarkupCentKwh),
    minQuantityMwh: zahl(ppa.minQuantityMwh),
    maxQuantityMwh: zahl(ppa.maxQuantityMwh),
    billingPeriod: ppa.billingPeriod ?? "MONTHLY",
    status: ppa.status,
    notes: ppa.notes ?? "",
  };
}

/** Fields of the other pricing modes are cleared, not sent along stale. */
export function ppaRumpf(f: PpaFormular, modus: "neu" | "bearbeiten") {
  const rumpf = {
    title: f.title.trim(),
    counterparty: f.counterparty.trim(),
    contractNumber: f.contractNumber.trim() || null,
    startDate: f.startDate,
    endDate: f.endDate,
    pricingMode: f.pricingMode,
    fixedPriceCentKwh: f.pricingMode === "FIXED" ? f.fixedPriceCentKwh : null,
    floorPriceCentKwh: f.pricingMode === "COLLAR" ? f.floorPriceCentKwh : null,
    capPriceCentKwh: f.pricingMode === "COLLAR" ? f.capPriceCentKwh : null,
    indexBase: f.pricingMode === "INDEXED" ? f.indexBase.trim() || null : null,
    indexMarkupCentKwh: f.pricingMode === "INDEXED" ? f.indexMarkupCentKwh : null,
    minQuantityMwh: f.minQuantityMwh,
    maxQuantityMwh: f.maxQuantityMwh,
    billingPeriod: f.billingPeriod,
    status: f.status,
    notes: f.notes.trim() || null,
  };
  // The park is fixed once the PPA exists (the update API has no parkId).
  return modus === "neu" ? { ...rumpf, parkId: f.parkId } : rumpf;
}

/** Client-side checks the API would otherwise answer with a bare 400. */
export function ppaFehler(f: PpaFormular, modus: "neu" | "bearbeiten"): string[] {
  const fehler: string[] = [];
  if (!f.title.trim()) fehler.push("title");
  if (!f.counterparty.trim()) fehler.push("counterparty");
  if (modus === "neu" && !f.parkId) fehler.push("parkId");
  if (!f.startDate) fehler.push("startDate");
  if (!f.endDate) fehler.push("endDate");
  if (f.startDate && f.endDate && f.endDate < f.startDate) fehler.push("endBeforeStart");
  return fehler;
}
