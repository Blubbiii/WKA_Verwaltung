/**
 * Der Zeitraum des Belegexports — eine Quelle für Seite, Route und Export.
 *
 * Vorher stand dieselbe Rechnung dreimal im Code (Tagesgrenze in der Route,
 * Tageszählung in der Route, Abfragefenster im Export), und der Dateiname
 * zweimal (Seite und Export). Drei Kopien einer Datumsrechnung sind drei
 * Gelegenheiten, dass eine davon anders rechnet.
 */

import { describe, expect, it } from "vitest";
import {
  belegExportDateiname,
  istKalendertag,
  tageImZeitraum,
  utcMitternacht,
} from "./beleg-zeitraum";

describe("istKalendertag", () => {
  it("nimmt echte Tage an", () => {
    expect(istKalendertag("2026-03-31")).toBe(true);
    expect(istKalendertag("2024-02-29")).toBe(true);
  });

  it("lehnt Tage ab, die es nicht gibt", () => {
    // JavaScript rechnet den 31. Februar klaglos in den 3. Maerz um. Der
    // Nutzer bekaeme dann einen anderen Zeitraum als angefordert.
    expect(istKalendertag("2026-02-31")).toBe(false);
    expect(istKalendertag("2025-02-29")).toBe(false);
    expect(istKalendertag("2026-13-01")).toBe(false);
  });

  it("lehnt andere Schreibweisen ab", () => {
    expect(istKalendertag("26-03-01")).toBe(false);
    expect(istKalendertag("2026-3-1")).toBe(false);
    expect(istKalendertag("01.03.2026")).toBe(false);
    expect(istKalendertag("")).toBe(false);
  });
});

describe("tageImZeitraum", () => {
  it("zaehlt beide Grenzen mit", () => {
    expect(tageImZeitraum({ von: "2026-03-01", bis: "2026-03-31" })).toBe(31);
    expect(tageImZeitraum({ von: "2026-03-15", bis: "2026-03-15" })).toBe(1);
  });

  it("bleibt ueber die Zeitumstellung ganzzahlig", () => {
    // Die Nacht zum 29.03.2026 hat 23 Stunden. Eine Rechnung in Ortszeit
    // kaeme auf 2,96 Tage und rundete je nach Richtung falsch.
    expect(tageImZeitraum({ von: "2026-03-28", bis: "2026-03-30" })).toBe(3);
    expect(tageImZeitraum({ von: "2026-10-24", bis: "2026-10-26" })).toBe(3);
  });
});

describe("utcMitternacht", () => {
  it("liefert den Tagesanfang in UTC, unabhaengig von der Zeitzone des Prozesses", () => {
    expect(utcMitternacht("2026-03-01").toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("belegExportDateiname", () => {
  it("nennt den Zeitraum im Namen", () => {
    expect(belegExportDateiname({ von: "2026-03-01", bis: "2026-03-31" })).toBe(
      "Belege_2026-03-01_bis_2026-03-31.zip",
    );
  });
});
