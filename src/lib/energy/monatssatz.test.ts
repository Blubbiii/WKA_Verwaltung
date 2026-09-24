/**
 * Monatssätze pflegen.
 *
 * Die Abregelung bewertet ihre Verluste mit dem Monatssatz (EnergyMonthlyRate).
 * Eine Oberfläche dafür gab es nie, die Tabelle war leer — die Bewertung in
 * Euro blieb leer. Der neue Tab baut seine Rümpfe hier; der Test schickt sie
 * durch die echten Schemas der API.
 */

import { describe, expect, it } from "vitest";
import { leererMonatssatz, monatssatzFehler, monatssatzRumpf } from "./monatssatz";
import { createMonthlyRateSchema, updateMonthlyRateSchema } from "./monatssatz-schemas";

const TYP = "3f2b8c1e-0000-4000-8000-000000000001";

describe("Monatssatz-Formular", () => {
  it("baut einen Rumpf, den die API zum Anlegen annimmt", () => {
    const f = { ...leererMonatssatz(2026), month: 3, revenueTypeId: TYP, ratePerKwh: 0.0812 };
    const ergebnis = createMonthlyRateSchema.safeParse(monatssatzRumpf(f, "neu"));
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data).toMatchObject({ year: 2026, month: 3, ratePerKwh: 0.0812, marketValue: null });
  });

  it("schickt beim Bearbeiten nur die änderbaren Felder", () => {
    const f = { ...leererMonatssatz(2026), month: 3, revenueTypeId: TYP, ratePerKwh: 0.09, notes: "  " };
    const rumpf = monatssatzRumpf(f, "bearbeiten");
    expect(Object.keys(rumpf).sort()).toEqual(["managementFee", "marketValue", "notes", "ratePerKwh"]);
    const ergebnis = updateMonthlyRateSchema.strict().safeParse(rumpf);
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data?.notes).toBeNull();
  });

  it("meldet fehlende Pflichtangaben", () => {
    expect(monatssatzFehler(leererMonatssatz(2026), "neu")).toEqual(["month", "revenueTypeId", "ratePerKwh"]);
    expect(monatssatzFehler({ ...leererMonatssatz(2026), ratePerKwh: 0.08 }, "bearbeiten")).toEqual([]);
  });
});
