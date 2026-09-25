/**
 * Gespeicherte Mandanten-Einstellungen nur mit bekannten Feldern.
 *
 * Nach dem Ausbau der Buchhaltung lieferte die Einstellungs-API weiter
 * DATEV-Konten und den Kontenrahmen aus: sie standen im gespeicherten JSON,
 * und Lesen wie Schreiben übernahmen alles ungeprüft. Entfernte Felder
 * blieben so für immer im Mandanten stehen.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DEFAULT_TENANT_SETTINGS, nurBekannteEinstellungen } from "./tenant-settings";

describe("nurBekannteEinstellungen", () => {
  it("lässt entfernte Felder weg und behält bekannte", () => {
    const gespeichert = {
      paymentTermDays: 45,
      bankMatchToleranceEur: 0.05,
      datevAccountEinspeisung: "8400",
      chartOfAccountsVersion: "SKR03",
      bilanzToleranceEur: 0.01,
    };
    expect(nurBekannteEinstellungen(gespeichert)).toEqual({ paymentTermDays: 45, bankMatchToleranceEur: 0.05 });
  });

  it("kennt jedes Feld der Standardwerte", () => {
    const alle = { ...DEFAULT_TENANT_SETTINGS };
    expect(Object.keys(nurBekannteEinstellungen(alle)).sort()).toEqual(Object.keys(alle).sort());
  });
});
