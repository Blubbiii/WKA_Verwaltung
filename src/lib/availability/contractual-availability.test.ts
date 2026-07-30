/**
 * A2: Vertragliche Verfügbarkeit und Bonus/Malus.
 *
 * Bei einer 97-%-Garantie mit Pönale entscheidet die Definition über
 * fünfstellige Beträge. Diese Tests halten fest, welche Definition welches
 * Ergebnis liefert — und wo bewusst nichts gerechnet wird.
 */

import { describe, it, expect } from "vitest";
import {
  computeContractualAvailability,
  computeBonusMalus,
  DEFINITION_PRESETS,
  type TimeBuckets,
  type BonusMalusTier,
} from "./contractual-availability";

const HOUR = 3600;

/** Zeitkategorien in Stunden angeben — so steht es in jedem Vertrag. */
function hours(values: Partial<Record<keyof TimeBuckets, number>>): TimeBuckets {
  return {
    t1: (values.t1 ?? 0) * HOUR,
    t2: (values.t2 ?? 0) * HOUR,
    t3: (values.t3 ?? 0) * HOUR,
    t4: (values.t4 ?? 0) * HOUR,
    t5: (values.t5 ?? 0) * HOUR,
    t6: (values.t6 ?? 0) * HOUR,
    t5_1: (values.t5_1 ?? 0) * HOUR,
    t5_2: (values.t5_2 ?? 0) * HOUR,
    t5_3: (values.t5_3 ?? 0) * HOUR,
  };
}

// ---------------------------------------------------------------------------
// Die Definition entscheidet
// ---------------------------------------------------------------------------

describe("Dieselben Daten, verschiedene Vertragsdefinitionen", () => {
  // Das Zahlenbeispiel aus Finding F21 des Rechenkorrektheits-Audits.
  const buckets = hours({ t1: 8000, t2: 300, t3: 200, t4: 100, t5: 160 });

  it("technische Definition T1/(T1+T5) ergibt 98,04 %", () => {
    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t2", "t3", "t4", "t6"],
    });
    expect(result.availabilityPct).toBe(98.04);
  });

  it("IEC 61400-26-2 ((T1+T2+T3)/(T1+T2+T3+T5)) ergibt 98,15 %", () => {
    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1", "t2", "t3"],
      excludedCategories: ["t4", "t6"],
    });
    expect(result.availabilityPct).toBe(98.15);
  });

  it("Zeitverfügbarkeit inklusive Wartung ergibt 97,03 %", () => {
    // (Gesamt − T4 − T5) / Gesamt
    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1", "t2", "t3", "t6"],
      excludedCategories: [],
    });
    expect(result.availabilityPct).toBe(97.03);
  });

  it("die drei Zahlen liegen ueber einem Prozentpunkt auseinander", () => {
    // Genau darum geht es: bei einer 97-%-Garantie entscheidet die Definition
    // darueber, ob eine Poenale faellig wird.
    const technical = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t2", "t3", "t4", "t6"],
    });
    const timeBased = computeContractualAvailability(buckets, DEFINITION_PRESETS.IEC_TIME_BASED);
    expect(technical.availabilityPct).not.toBe(timeBased.availabilityPct);
    expect(Math.abs((technical.availabilityPct ?? 0) - (timeBased.availabilityPct ?? 0))).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Ausschlusstatbestände
// ---------------------------------------------------------------------------

describe("Ausschlusstatbestaende", () => {
  it("ausgeschlossene Zeiten fallen aus Zaehler UND Nenner", () => {
    // 100 h Netzausfall (T3) duerfen dem Hersteller weder angelastet noch
    // gutgeschrieben werden.
    const buckets = hours({ t1: 800, t3: 100, t5: 100 });

    const withT3 = computeContractualAvailability(buckets, {
      availableCategories: ["t1", "t3"],
      excludedCategories: [],
    });
    const withoutT3 = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t3"],
    });

    // Mit T3 als verfuegbar: 900/1000 = 90 %
    expect(withT3.availabilityPct).toBe(90);
    // T3 ausgeschlossen: 800/900 = 88,89 %
    expect(withoutT3.availabilityPct).toBe(88.89);
  });

  it("eine ausgeschlossene Unterkategorie mindert T5", () => {
    // Ohne Verrechnung zaehlte T5.1 doppelt: einmal in T5, einmal im Ausschluss.
    const buckets = hours({ t1: 900, t5: 100, t5_1: 40 });

    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t5_1"],
    });

    // Basis = 900 + (100 − 40) = 960, verfuegbar 900 → 93,75 %
    expect(result.availabilityPct).toBe(93.75);
    if (result.availabilityPct === null) throw new Error("unerwartet");
    expect(result.basisSeconds).toBe(960 * HOUR);
    expect(result.excludedSeconds).toBe(40 * HOUR);
  });

  it("mehrere ausgeschlossene Unterkategorien addieren sich", () => {
    const buckets = hours({ t1: 900, t5: 100, t5_1: 30, t5_3: 20 });
    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t5_1", "t5_3"],
    });
    // Basis = 900 + 50 = 950
    expect(result.availabilityPct).toBe(94.74);
  });

  it("Unterkategorien groesser als T5 werden begrenzt und gemeldet", () => {
    // Datenfehler. Eine negative Zeit in der Rechnung waere schlimmer.
    const buckets = hours({ t1: 900, t5: 50, t5_1: 80 });
    const result = computeContractualAvailability(buckets, {
      availableCategories: ["t1"],
      excludedCategories: ["t5_1"],
    });

    if (result.availabilityPct === null) throw new Error("unerwartet");
    expect(result.availabilityPct).toBe(100);
    expect(result.warnings.some((w) => w.includes("übersteigen T5"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wo bewusst nichts gerechnet wird
// ---------------------------------------------------------------------------

describe("Kein Ergebnis statt eines falschen", () => {
  it("widerspruechliche Definition ergibt null", () => {
    const result = computeContractualAvailability(hours({ t1: 100 }), {
      availableCategories: ["t1", "t2"],
      excludedCategories: ["t2"],
    });
    expect(result.availabilityPct).toBeNull();
    if (result.availabilityPct !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("zugleich als verfügbar und als ausgeschlossen");
  });

  it("ohne Bemessungsgrundlage ergibt null, NICHT 0 Prozent", () => {
    // 0 % wuerde die volle Poenale ausloesen. Das darf kein Ergebnis
    // fehlender SCADA-Daten sein.
    const result = computeContractualAvailability(hours({}), {
      availableCategories: ["t1"],
      excludedCategories: [],
    });
    expect(result.availabilityPct).toBeNull();
    if (result.availabilityPct !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Keine Bemessungsgrundlage");
  });

  it("ohne verfuegbare Kategorie ergibt null", () => {
    const result = computeContractualAvailability(hours({ t1: 100 }), {
      availableCategories: [],
      excludedCategories: [],
    });
    expect(result.availabilityPct).toBeNull();
  });

  it("negative Zeiten werden auf 0 gehoben statt durchgereicht", () => {
    const broken = { ...hours({ t1: 900, t5: 100 }), t2: -50 };
    const result = computeContractualAvailability(broken, {
      availableCategories: ["t1", "t2"],
      excludedCategories: [],
    });
    expect(result.availabilityPct).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Bonus / Malus
// ---------------------------------------------------------------------------

describe("Bonus und Malus", () => {
  const annualValueEur = 100_000;

  /** Typische Staffel: unter 97 % je Prozentpunkt 2 % der Jahresvergütung. */
  const tiers: BonusMalusTier[] = [
    { fromPct: 0, toPct: 97, kind: "MALUS", mode: "PERCENT_OF_ANNUAL_VALUE", amount: 2 },
    { fromPct: 99, toPct: 101, kind: "BONUS", mode: "FIXED_EUR", amount: 5_000 },
  ];

  const base = {
    tiers,
    annualValueEur,
    pointRounding: "UP" as const,
    maxMalusEur: null,
    maxBonusEur: null,
  };

  it("im vereinbarten Korridor gibt es weder Bonus noch Malus", () => {
    const result = computeBonusMalus({ ...base, availabilityPct: 98 });
    expect(result.kind).toBeNull();
    expect(result.amountEur).toBe(0);
  });

  it("unter der Zielmarke entsteht eine Poenale", () => {
    const result = computeBonusMalus({ ...base, availabilityPct: 95.4 });
    expect(result.kind).toBe("MALUS");
    expect(result.amountEur).toBe(2_000);
  });

  it("ueber der Bonusmarke entsteht ein Bonus mit umgekehrtem Vorzeichen", () => {
    // Aus Sicht des Betreibers: Malus positiv (Forderung), Bonus negativ
    // (Verbindlichkeit). So laesst sich der Wert direkt uebernehmen, ohne
    // dass unterwegs jemand das Vorzeichen dreht.
    const result = computeBonusMalus({ ...base, availabilityPct: 99.5 });
    expect(result.kind).toBe("BONUS");
    expect(result.amountEur).toBe(-5_000);
  });

  it("die angewandte Staffel wird ausgewiesen", () => {
    const result = computeBonusMalus({ ...base, availabilityPct: 95.4 });
    expect(result.appliedTier?.kind).toBe("MALUS");
  });
});

describe("Prozentpunkt-Staffel", () => {
  const perPoint: BonusMalusTier[] = [
    { fromPct: 0, toPct: 97, kind: "MALUS", mode: "PER_PERCENTAGE_POINT", amount: 1_500 },
  ];
  const base = {
    tiers: perPoint,
    annualValueEur: 100_000,
    maxMalusEur: null,
    maxBonusEur: null,
  };

  it('"je angefangenem Prozentpunkt" rundet auf', () => {
    // 97 − 95,4 = 1,6 Punkte → aufgerundet 2 → 3.000 EUR
    const result = computeBonusMalus({ ...base, availabilityPct: 95.4, pointRounding: "UP" });
    expect(result.points).toBe(2);
    expect(result.amountEur).toBe(3_000);
  });

  it('"je vollem Prozentpunkt" rundet ab', () => {
    const result = computeBonusMalus({ ...base, availabilityPct: 95.4, pointRounding: "DOWN" });
    expect(result.points).toBe(1);
    expect(result.amountEur).toBe(1_500);
  });

  it("pro rata rechnet mit dem genauen Wert", () => {
    const result = computeBonusMalus({ ...base, availabilityPct: 95.4, pointRounding: "EXACT" });
    expect(result.points).toBe(1.6);
    expect(result.amountEur).toBe(2_400);
  });

  it("die Rundungsart entscheidet ueber den doppelten Betrag", () => {
    // Genau deshalb ist sie ein eigenes Vertragsfeld und keine Annahme.
    const up = computeBonusMalus({ ...base, availabilityPct: 96.9, pointRounding: "UP" });
    const down = computeBonusMalus({ ...base, availabilityPct: 96.9, pointRounding: "DOWN" });
    expect(up.amountEur).toBe(1_500);
    expect(down.amountEur).toBe(0);
  });

  it("ein Bonus rechnet gegen die UNTERE Staffelgrenze", () => {
    const bonusTier: BonusMalusTier[] = [
      { fromPct: 98, toPct: 101, kind: "BONUS", mode: "PER_PERCENTAGE_POINT", amount: 1_000 },
    ];
    const result = computeBonusMalus({
      ...base,
      tiers: bonusTier,
      availabilityPct: 99.5,
      pointRounding: "EXACT",
    });
    expect(result.points).toBe(1.5);
    expect(result.amountEur).toBe(-1_500);
  });
});

describe("Obergrenzen", () => {
  const tiers: BonusMalusTier[] = [
    { fromPct: 0, toPct: 97, kind: "MALUS", mode: "PER_PERCENTAGE_POINT", amount: 5_000 },
  ];

  it("die Poenale wird gedeckelt und der Deckel ausgewiesen", () => {
    // "maximal 10 % der Jahresverguetung" steht in fast jedem Vertrag.
    const result = computeBonusMalus({
      tiers,
      annualValueEur: 100_000,
      availabilityPct: 90,
      pointRounding: "UP",
      maxMalusEur: 10_000,
      maxBonusEur: null,
    });
    expect(result.amountEur).toBe(10_000);
    expect(result.cappedAt).toBe(10_000);
  });

  it("ohne Deckel laeuft der Betrag durch", () => {
    const result = computeBonusMalus({
      tiers,
      annualValueEur: 100_000,
      availabilityPct: 90,
      pointRounding: "UP",
      maxMalusEur: null,
      maxBonusEur: null,
    });
    expect(result.amountEur).toBe(35_000);
    expect(result.cappedAt).toBeNull();
  });
});

describe("Fehlerhafte Staffelung", () => {
  it("ueberlappende Staffeln werden gemeldet, nicht still aufgeloest", () => {
    const overlapping: BonusMalusTier[] = [
      { fromPct: 0, toPct: 97, kind: "MALUS", mode: "FIXED_EUR", amount: 1_000 },
      { fromPct: 95, toPct: 98, kind: "MALUS", mode: "FIXED_EUR", amount: 9_000 },
    ];
    const result = computeBonusMalus({
      tiers: overlapping,
      annualValueEur: 100_000,
      availabilityPct: 96,
      pointRounding: "UP",
      maxMalusEur: null,
      maxBonusEur: null,
    });
    expect(result.amountEur).toBe(1_000);
    expect(result.warnings.some((w) => w.includes("Staffeln treffen"))).toBe(true);
  });

  it("die obere Grenze ist ausschliesslich", () => {
    // Sonst faellt genau die Zielmarke in die Poenalestaffel.
    const tiers: BonusMalusTier[] = [
      { fromPct: 0, toPct: 97, kind: "MALUS", mode: "FIXED_EUR", amount: 1_000 },
    ];
    const atTarget = computeBonusMalus({
      tiers,
      annualValueEur: 100_000,
      availabilityPct: 97,
      pointRounding: "UP",
      maxMalusEur: null,
      maxBonusEur: null,
    });
    expect(atTarget.kind).toBeNull();
    expect(atTarget.amountEur).toBe(0);
  });
});
