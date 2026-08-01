/**
 * Toleranz der Anteilssumme.
 *
 * Der Befund war nicht die Doppelung an sich, sondern dass die drei Kopien
 * unterschiedlich streng waren: 0,011 in Ausschuettung und Pachtverteilung,
 * 0,01 in der Abrechnungsregel. Eine Drittelung wurde dort abgelehnt und hier
 * angenommen — dieselbe Eingabe, zwei Ergebnisse.
 *
 * Diese Tests halten beides fest: dass gleichmaessige Aufteilungen durchgehen,
 * und dass echte Luecken weiterhin auffallen.
 */

import { describe, it, expect } from "vitest";
import {
  shareSumTolerance,
  shareSumIsComplete,
  SHARE_ROUNDING_STEP,
} from "./share-tolerance";

describe("Gleichmaessige Aufteilungen gehen durch", () => {
  // Genau die Faelle, an denen die alten Werte scheiterten. Jeder ist die
  // bestmoegliche Eingabe bei zwei Nachkommastellen — sie MUESSEN gelten.
  const cases: { label: string; count: number; sum: number }[] = [
    { label: "Haelfte", count: 2, sum: 50 + 50 },
    { label: "Drittel (99,99 — scheiterte an 0,01)", count: 3, sum: 33.33 * 3 },
    { label: "Viertel", count: 4, sum: 25 * 4 },
    { label: "Fuenftel", count: 5, sum: 20 * 5 },
    { label: "Sechstel (100,02 — scheiterte an ALLEN drei)", count: 6, sum: 16.67 * 6 },
    { label: "Siebtel (100,03 — scheiterte an ALLEN drei)", count: 7, sum: 14.29 * 7 },
    { label: "Neuntel", count: 9, sum: 11.11 * 9 },
    { label: "Elftel", count: 11, sum: 9.09 * 11 },
  ];

  for (const { label, count, sum } of cases) {
    it(`${label}`, () => {
      expect(
        shareSumIsComplete(sum, count),
        `Summe ${sum} bei ${count} Anteilen (Abweichung ${Math.abs(sum - 100)})`,
      ).toBe(true);
    });
  }

  it("die Drittelung scheiterte tatsaechlich an der alten Schranke", () => {
    // Beweist, dass der Befund echt war und nicht bloss theoretisch:
    // in Fliesskomma liegt die Abweichung knapp UEBER 0,01.
    const sum = 33.33 * 3;
    expect(Math.abs(sum - 100) > 0.01).toBe(true);
    expect(shareSumIsComplete(sum, 3)).toBe(true);
  });
});

describe("Echte Luecken fallen weiterhin durch", () => {
  it("ein fehlender Anteil von 5 Prozentpunkten", () => {
    expect(shareSumIsComplete(95, 3)).toBe(false);
  });

  it("eine Ueberbelegung auf 150 %", () => {
    // Der Fall aus dem Kommentar in distribution.ts: bei 150 % wuerden
    // 150.000 EUR ausgeschuettet, waehrend 100.000 EUR gebucht sind.
    expect(shareSumIsComplete(150, 4)).toBe(false);
  });

  it("ein vergessener Gesellschafter mit 0,1 %", () => {
    // Zehnmal die Rundungsbreite eines einzelnen Anteils — das ist keine
    // Rundung mehr, auch nicht bei vielen Beteiligten.
    expect(shareSumIsComplete(99.9, 5)).toBe(false);
  });

  it("die Toleranz waechst nicht ins Uferlose", () => {
    // Bei 100 Gesellschaftern sind 0,5 Prozentpunkte zulaessig — das ist die
    // tatsaechliche Rundungsbreite, aber ein fehlender Anteil von 1 % faellt
    // weiterhin auf.
    expect(shareSumIsComplete(99.5, 100)).toBe(true);
    expect(shareSumIsComplete(99, 100)).toBe(false);
  });
});

describe("Die Toleranz selbst", () => {
  it("waechst linear mit der Zahl der Anteile", () => {
    // Als Differenz geprueft, damit die Fliesskomma-Zugabe sich herauskuerzt —
    // sie ist Teil des Werts, aber nicht Teil der Aussage.
    const step = shareSumTolerance(10) - shareSumTolerance(1);
    expect(step).toBeCloseTo(9 * SHARE_ROUNDING_STEP, 12);
  });

  it("liegt minimal ueber dem reinen Rundungsbetrag", () => {
    // Die Zugabe verhindert, dass eine Abweichung exakt auf der Grenze je nach
    // Bitmuster mal durchgeht und mal nicht — genau der Effekt, der den
    // Unterschied zwischen 0,01 und 0,011 ausgemacht hat.
    const pure = 3 * SHARE_ROUNDING_STEP;
    expect(shareSumTolerance(3)).toBeGreaterThan(pure);
    expect(shareSumTolerance(3) - pure).toBeLessThan(1e-6);
  });

  it("faellt nie unter einen einzelnen Anteil", () => {
    // 0 oder negative Anzahl darf keine Toleranz von 0 ergeben — sonst wuerde
    // ein leerer Aufruf jede Summe ausser exakt 100,000000 zurueckweisen.
    expect(shareSumTolerance(0)).toBeGreaterThan(0);
    expect(shareSumTolerance(-5)).toBeGreaterThan(0);
  });

  it("entspricht dem Rundungsbegriff, der in allocateByPercentage schon galt", () => {
    // Dort stand `0.005 * amounts.length` fuer denselben Gedanken — nur eben
    // nicht in der Pruefung der Quotensumme.
    expect(SHARE_ROUNDING_STEP).toBe(0.005);
  });
});
