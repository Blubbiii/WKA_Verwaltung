/**
 * A8: Stichtagsgenaue Ausschüttung.
 *
 * Der erste Test ist das Szenario aus Finding 4.1 — er zeigt, was heute falsch
 * gerechnet wird, und was stattdessen herauskommen muss.
 */

import { describe, it, expect } from "vitest";
import {
  splitDistribution,
  shareRegisterAt,
  type ShareholderShare,
} from "./distribution-split";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const YEAR_2026 = { periodStart: d("2026-01-01"), periodEnd: d("2026-12-31") };

describe("Finding 4.1 — das Szenario aus dem Audit", () => {
  // A haelt 10 % und tritt zum 31.03. aus. Der Anteil geht auf B ueber.
  const shares: ShareholderShare[] = [
    { shareholderId: "A", sharePercent: 10, validFrom: null, validTo: d("2026-03-31") },
    { shareholderId: "B", sharePercent: 60, validFrom: null, validTo: d("2026-03-31") },
    { shareholderId: "B", sharePercent: 70, validFrom: d("2026-04-01"), validTo: null },
    { shareholderId: "C", sharePercent: 30, validFrom: null, validTo: null },
  ];

  it("A bekommt seinen ZEITANTEIL, nicht null", () => {
    // Heute: A erhaelt 0 EUR. Richtig: 10 % fuer 90 von 365 Tagen.
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 365_000 });
    if (result.allocations === null) throw new Error(result.reason);

    const a = result.allocations.find((x) => x.shareholderId === "A")!;
    expect(a.days).toBe(90);
    // 365.000 x 10 % x 90/365 = 9.000
    expect(a.amountEur).toBe(9_000);
  });

  it("die uebrigen bekommen A's Anteil NICHT geschenkt", () => {
    // Heute normalisiert der Code die verbleibenden 90 % auf 100 %.
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 365_000 });
    if (result.allocations === null) throw new Error(result.reason);

    const c = result.allocations.find((x) => x.shareholderId === "C")!;
    // C haelt ganzjaehrig 30 % → 109.500 EUR. Mit Normalisierung bekaeme C
    // mehr, obwohl sich an C's Beteiligung nichts geaendert hat.
    expect(c.amountEur).toBe(109_500);
  });

  it("die Summe stimmt exakt", () => {
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 365_000 });
    if (result.allocations === null) throw new Error(result.reason);
    const sum = result.allocations.reduce((s, a) => s + a.amountEur, 0);
    expect(Math.round(sum * 100) / 100).toBe(365_000);
    expect(result.undistributedEur).toBe(0);
  });

  it("wer im November eintritt, bekommt NICHT den vollen Jahresanteil", () => {
    // Auch das nennt das Audit ausdruecklich.
    const late: ShareholderShare[] = [
      { shareholderId: "Alt", sharePercent: 100, validFrom: null, validTo: d("2026-10-31") },
      { shareholderId: "Alt", sharePercent: 80, validFrom: d("2026-11-01"), validTo: null },
      { shareholderId: "Neu", sharePercent: 20, validFrom: d("2026-11-01"), validTo: null },
    ];
    const result = splitDistribution({ ...YEAR_2026, shares: late, totalAmountEur: 365_000 });
    if (result.allocations === null) throw new Error(result.reason);

    const neu = result.allocations.find((x) => x.shareholderId === "Neu")!;
    expect(neu.days).toBe(61);
    // 365.000 x 20 % x 61/365 = 12.200 — nicht 73.000.
    expect(neu.amountEur).toBe(12_200);
  });
});

describe("Der eingezogene Anteil", () => {
  // A tritt aus, sein Anteil wird EINGEZOGEN statt uebertragen.
  const shares: ShareholderShare[] = [
    { shareholderId: "A", sharePercent: 10, validFrom: null, validTo: d("2026-06-30") },
    { shareholderId: "B", sharePercent: 90, validFrom: null, validTo: null },
  ];

  it("der Rest bleibt bei der Gesellschaft", () => {
    // Genau hier normalisiert der heutige Code — und verschenkt A's Anteil.
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 100_000 });
    if (result.allocations === null) throw new Error(result.reason);

    const b = result.allocations.find((x) => x.shareholderId === "B")!;
    expect(b.effectiveSharePercent).toBe(90);
    expect(b.amountEur).toBe(90_000);
  });

  it("der nicht verteilte Betrag wird ausgewiesen", () => {
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 100_000 });
    if (result.allocations === null) throw new Error(result.reason);
    // Ab dem 01.07. sind nur 90 % zugeordnet: 10 % von 184/365 des Betrags.
    expect(result.undistributedEur).toBeCloseTo((100_000 * (184 / 365) * 10) / 100, 2);
    expect(result.warnings.some((w) => w.includes("NICHT auf die übrigen verteilt"))).toBe(true);
  });

  it("verteilt plus nicht verteilt ergibt den Gesamtbetrag", () => {
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 100_000 });
    if (result.allocations === null) throw new Error(result.reason);
    expect(Math.round((result.distributedEur + result.undistributedEur) * 100) / 100).toBe(100_000);
  });

  it("der Rundungsausgleich greift NICHT in den nicht verteilten Rest", () => {
    // Sonst wuerde er heimlich doch ausgeschuettet.
    const result = splitDistribution({ ...YEAR_2026, shares, totalAmountEur: 100_000 });
    if (result.allocations === null) throw new Error(result.reason);
    const sum = result.allocations.reduce((s, a) => s + a.amountEur, 0);
    expect(Math.round(sum * 100) / 100).toBe(result.distributedEur);
  });
});

describe("Was NICHT durchgeht", () => {
  it("mehr als 100 Prozent wird abgewiesen", () => {
    // Anders als darunter gibt es dafuer keine zulaessige Auslegung.
    const result = splitDistribution({
      ...YEAR_2026,
      shares: [
        { shareholderId: "A", sharePercent: 60, validFrom: null, validTo: null },
        { shareholderId: "B", sharePercent: 60, validFrom: null, validTo: null },
      ],
      totalAmountEur: 100_000,
    });
    expect(result.allocations).toBeNull();
    if (result.allocations !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("mehr als 100");
  });

  it("ohne Gesellschafter im Zeitraum kommt null", () => {
    const result = splitDistribution({
      ...YEAR_2026,
      shares: [
        { shareholderId: "Alt", sharePercent: 100, validFrom: null, validTo: d("2025-12-31") },
      ],
      totalAmountEur: 100_000,
    });
    expect(result.allocations).toBeNull();
  });

  it("ein umgedrehter Zeitraum wird abgewiesen", () => {
    const result = splitDistribution({
      periodStart: d("2026-12-31"),
      periodEnd: d("2026-01-01"),
      shares: [{ shareholderId: "A", sharePercent: 100, validFrom: null, validTo: null }],
      totalAmountEur: 100_000,
    });
    expect(result.allocations).toBeNull();
  });
});

describe("Der Normalfall bleibt einfach", () => {
  it("ohne Wechsel wird nach Quote verteilt", () => {
    const result = splitDistribution({
      ...YEAR_2026,
      shares: [
        { shareholderId: "A", sharePercent: 50, validFrom: null, validTo: null },
        { shareholderId: "B", sharePercent: 50, validFrom: null, validTo: null },
      ],
      totalAmountEur: 100_000,
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.segmentCount).toBe(1);
    expect(result.allocations.map((a) => a.amountEur)).toEqual([50_000, 50_000]);
    expect(result.warnings).toEqual([]);
  });
});

describe("Gesellschafterliste zum Stichtag", () => {
  const shares: ShareholderShare[] = [
    { shareholderId: "A", sharePercent: 10, validFrom: null, validTo: d("2026-03-31") },
    { shareholderId: "B", sharePercent: 90, validFrom: null, validTo: d("2026-03-31") },
    { shareholderId: "B", sharePercent: 100, validFrom: d("2026-04-01"), validTo: null },
  ];

  it("vor dem Wechsel", () => {
    const register = shareRegisterAt(shares, d("2026-02-15"));
    expect(register).toEqual([
      { shareholderId: "A", sharePercent: 10 },
      { shareholderId: "B", sharePercent: 90 },
    ]);
  });

  it("nach dem Wechsel", () => {
    const register = shareRegisterAt(shares, d("2026-07-01"));
    expect(register).toEqual([{ shareholderId: "B", sharePercent: 100 }]);
  });

  it("am Wechseltag selbst gilt der neue Stand", () => {
    // validTo 31.03. heisst "bis einschliesslich" — am 01.04. gilt der neue.
    expect(shareRegisterAt(shares, d("2026-04-01"))).toEqual([
      { shareholderId: "B", sharePercent: 100 },
    ]);
    expect(shareRegisterAt(shares, d("2026-03-31"))).toHaveLength(2);
  });
});
