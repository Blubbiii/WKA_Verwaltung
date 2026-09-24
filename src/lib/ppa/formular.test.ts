/**
 * PPA anlegen und bearbeiten.
 *
 * Die PPA-Seite hatte keinen Dialog — "Neuer PPA" und "Bearbeiten" taten
 * nichts. Der neue Dialog baut seine Rümpfe hier; der Test schickt sie durch
 * die echten Schemas der API.
 */

import { describe, expect, it } from "vitest";
import { leeresPpaFormular, ppaFehler, ppaFormularAus, ppaRumpf } from "./formular";
import { ppaCreateSchema, ppaUpdateSchema } from "./schemas";

const PARK = "3f2b8c1e-0000-4000-8000-000000000001";

const formular = {
  ...leeresPpaFormular(),
  title: "PPA Stadtwerke 2027",
  counterparty: "Stadtwerke Husum",
  parkId: PARK,
  startDate: "2027-01-01",
  endDate: "2031-12-31",
  fixedPriceCentKwh: 7.45,
  floorPriceCentKwh: 5, // belongs to COLLAR, must not travel with FIXED
};

describe("PPA-Formular", () => {
  it("baut einen Rumpf, den die API zum Anlegen annimmt", () => {
    const ergebnis = ppaCreateSchema.safeParse(ppaRumpf(formular, "neu"));
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data?.fixedPriceCentKwh).toBe(7.45);
    expect(ergebnis.data?.floorPriceCentKwh).toBeNull();
  });

  it("baut einen Rumpf, den die API zum Bearbeiten annimmt", () => {
    const rumpf = ppaRumpf({ ...formular, pricingMode: "COLLAR", capPriceCentKwh: 9 }, "bearbeiten");
    expect("parkId" in rumpf).toBe(false);
    const ergebnis = ppaUpdateSchema.strict().safeParse(rumpf);
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data?.fixedPriceCentKwh).toBeNull();
    expect(ergebnis.data?.capPriceCentKwh).toBe(9);
  });

  it("übernimmt einen gespeicherten PPA samt Dezimaltexten", () => {
    const f = ppaFormularAus({
      title: "A", counterparty: "B", contractNumber: null, startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2031-12-31T00:00:00.000Z", pricingMode: "FIXED", fixedPriceCentKwh: "7.45",
      floorPriceCentKwh: null, capPriceCentKwh: null, indexBase: null, indexMarkupCentKwh: null,
      minQuantityMwh: "1200", maxQuantityMwh: null, status: "ACTIVE", notes: null, park: { id: PARK },
    });
    expect(f.startDate).toBe("2027-01-01");
    expect(f.fixedPriceCentKwh).toBe(7.45);
    expect(f.minQuantityMwh).toBe(1200);
    expect(f.parkId).toBe(PARK);
  });

  it("meldet fehlende Pflichtfelder und ein Ende vor dem Beginn", () => {
    expect(ppaFehler(leeresPpaFormular(), "neu")).toEqual(["title", "counterparty", "parkId", "startDate", "endDate"]);
    expect(ppaFehler({ ...formular, endDate: "2026-01-01" }, "neu")).toEqual(["endBeforeStart"]);
  });
});
