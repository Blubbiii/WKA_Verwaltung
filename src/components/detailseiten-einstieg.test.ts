/**
 * Detailseiten beginnen mit dem Wichtigsten (UX-Durchsicht, Punkt 14).
 *
 * - Park: Der Reiter "Übersicht" zeigte Zählpunkte, Rückbau und Topologie,
 *   aber weder Standort noch Inbetriebnahme noch Betreiber.
 * - Gesellschaft: öffnete mit "Gesellschafter", "Übersicht" stand an zweiter
 *   Stelle; "Gesellschafter 1" und "Gesellschaften 0" standen nebeneinander.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Park-Übersicht", () => {
  const park = lies("app/(dashboard)/parks/[id]/page.tsx");
  const uebersicht = park.slice(park.indexOf('<TabsContent value="overview">'));

  it("beginnt mit den Stammdaten", () => {
    const stammdaten = uebersicht.indexOf("Stammdaten");
    expect(stammdaten).toBeGreaterThan(-1);
    expect(stammdaten).toBeLessThan(uebersicht.indexOf("<MeteringPointsCard"));
  });

  it("nennt Standort, Inbetriebnahme, Betreiber und Leistung", () => {
    const karte = uebersicht.slice(0, uebersicht.indexOf("<MeteringPointsCard"));
    for (const feld of ["park.city", "park.commissioningDate", "park.operatorFund", "totalCapacityKw"]) {
      expect(karte, feld).toContain(feld);
    }
  });
});

describe("Gesellschaft", () => {
  const fonds = lies("app/(dashboard)/funds/[id]/page.tsx");

  it("öffnet mit der Übersicht, die auch als erster Reiter steht", () => {
    expect(fonds).toContain('useState("overview")');
    expect(fonds.indexOf('<TabsTrigger value="overview">')).toBeLessThan(fonds.indexOf('<TabsTrigger value="shareholders">'));
  });

  it("die Kennzahlen sind unterscheidbar benannt", () => {
    const de = JSON.parse(lies("messages/de.json"));
    expect(de.funds.detail.statsCompanies).toBe("Verbundene Gesellschaften");
  });
});
