/**
 * B1: Marktpraemie, anzulegender Wert, negative Preise.
 *
 * Die beiden Tests, auf die es ankommt: der Anspruch entfaellt fuer die GANZE
 * Dauer eines qualifizierenden Zeitraums (nicht erst ab der Schwellenstunde),
 * und eine fehlende Preisreihe ergibt NICHT null Stunden.
 */

import { describe, it, expect } from "vitest";
import { findNegativePriceHours, computePremium, type HourlyPrice } from "./premium";

function hours(prices: number[], startIso = "2026-03-01T00:00:00.000Z"): HourlyPrice[] {
  const start = new Date(startIso).getTime();
  return prices.map((priceEurMwh, index) => ({
    hour: new Date(start + index * 3_600_000),
    priceEurMwh,
  }));
}

describe("§ 51 EEG — zusammenhaengende negative Stunden", () => {
  it("ein Zeitraum unter der Schwelle zaehlt NICHT", () => {
    const result = findNegativePriceHours(hours([10, -5, -5, -5, 10]), 4);
    expect(result.negativeHours).toBe(3);
    expect(result.affectedHours).toBe(0);
    expect(result.qualifyingRuns).toHaveLength(0);
  });

  it("bei Erreichen der Schwelle entfaellt der Anspruch fuer die GANZE Dauer", () => {
    // Der Fehler, den eine naive Umsetzung macht: nur die Stunden ab der
    // Schwelle abziehen. Hier sind es sechs, nicht drei.
    const result = findNegativePriceHours(hours([10, -1, -2, -3, -4, -5, -6, 10]), 4);
    expect(result.affectedHours).toBe(6);
    expect(result.qualifyingRuns).toHaveLength(1);
    expect(result.qualifyingRuns[0].hours).toBe(6);
  });

  it("die Schwelle ist ein Parameter, kein fester Wert", () => {
    // Sie hat sich mehrfach geaendert: EEG 2017 sechs, EEG 2021 vier,
    // EEG 2023 eine Stunde fuer neue Anlagen.
    const series = hours([10, -1, -2, 10]);
    expect(findNegativePriceHours(series, 1).affectedHours).toBe(2);
    expect(findNegativePriceHours(series, 4).affectedHours).toBe(0);
  });

  it("zwei getrennte Zeitraeume werden getrennt bewertet", () => {
    const result = findNegativePriceHours(
      hours([-1, -1, -1, -1, 5, -1, -1, 5, -1, -1, -1, -1, -1]),
      4,
    );
    // Erster Lauf 4 Stunden (zaehlt), zweiter 2 (nicht), dritter 5 (zaehlt).
    expect(result.negativeHours).toBe(11);
    expect(result.affectedHours).toBe(9);
    expect(result.qualifyingRuns).toHaveLength(2);
  });

  it("ein Preis von genau 0 ist NICHT negativ", () => {
    const result = findNegativePriceHours(hours([-1, 0, -1, -1]), 2);
    // Der Lauf wird bei 0 unterbrochen.
    expect(result.affectedHours).toBe(2);
  });

  it("eine Luecke unterbricht den Zusammenhang und wird gemeldet", () => {
    // Ueber eine Luecke hinweg zu zaehlen wuerde einen Zeitraum erfinden,
    // dessen Preise niemand kennt.
    const withGap: HourlyPrice[] = [
      ...hours([-1, -1], "2026-03-01T00:00:00.000Z"),
      ...hours([-1, -1], "2026-03-01T05:00:00.000Z"),
    ];
    const result = findNegativePriceHours(withGap, 4);
    expect(result.affectedHours).toBe(0);
    expect(result.warnings.some((w) => w.includes("Lücke"))).toBe(true);
  });

  it("eine unsortierte Reihe wird sortiert", () => {
    const shuffled = [...hours([-1, -1, -1, -1])].reverse();
    expect(findNegativePriceHours(shuffled, 4).affectedHours).toBe(4);
  });
});

const BASE = {
  awardValueCtPerKwh: 7.35,
  correctionFactor: 1.29,
  marketValueCtPerKwh: 6.2,
  productionKwh: 2_000_000,
  negativeHoursResult: null,
  productionInNegativeHoursKwh: null,
};

describe("Anzulegender Wert", () => {
  it("ist Zuschlagswert mal Korrekturfaktor", () => {
    const result = computePremium(BASE);
    // 7,35 x 1,29 = 9,4815
    expect(result.appliedValueCtPerKwh.value).toBeCloseTo(9.4815, 4);
  });

  it("OHNE Korrekturfaktor gibt es keinen — und NICHT den ungekuerzten Zuschlagswert", () => {
    // Der waere fuer jede Anlage ausser einer mit Faktor 1,0 falsch.
    const result = computePremium({ ...BASE, correctionFactor: null });
    expect(result.appliedValueCtPerKwh.value).toBeNull();
    expect(result.appliedValueCtPerKwh.unavailable).toContain("Anlage 2 EEG");
    expect(result.appliedValueCtPerKwh.value).not.toBe(7.35);
  });

  it("ohne Zuschlagswert auch nicht", () => {
    const result = computePremium({ ...BASE, awardValueCtPerKwh: null });
    expect(result.appliedValueCtPerKwh.value).toBeNull();
  });
});

describe("Marktpraemie", () => {
  it("ist anzulegender Wert minus Monatsmarktwert", () => {
    const result = computePremium(BASE);
    // 9,4815 - 6,20 = 3,2815
    expect(result.premiumCtPerKwh.value).toBeCloseTo(3.2815, 4);
    // x 2.000.000 kWh / 100 = 65.630 EUR
    expect(result.premiumEur.value).toBeCloseTo(65_630, 0);
  });

  it("wird NICHT negativ", () => {
    // § 20 EEG: liegt der Marktwert darueber, ist sie null — kein Abzug.
    const result = computePremium({ ...BASE, marketValueCtPerKwh: 12 });
    expect(result.premiumCtPerKwh.value).toBe(0);
    expect(result.premiumEur.value).toBe(0);
    expect(result.warnings.some((w) => w.includes("§ 20 EEG"))).toBe(true);
  });

  it("ohne Marktwert bleibt sie leer", () => {
    const result = computePremium({ ...BASE, marketValueCtPerKwh: null });
    expect(result.premiumCtPerKwh.value).toBeNull();
  });

  it("ohne Erzeugung gibt es keinen Betrag, aber einen Satz je kWh", () => {
    const result = computePremium({ ...BASE, productionKwh: null });
    expect(result.premiumCtPerKwh.value).toBeCloseTo(3.2815, 4);
    expect(result.premiumEur.value).toBeNull();
  });
});

describe("Fehlende Preisreihe ist NICHT null Stunden", () => {
  it("ohne Reihe bleibt die Stundenzahl leer", () => {
    // "Keine Reihe geladen" ist nicht "keine negativen Preise" — und der
    // Unterschied ist bares Geld.
    const result = computePremium(BASE);
    expect(result.affectedHours.value).toBeNull();
    expect(result.affectedHours.unavailable).toContain("NICHT null");
    expect(result.forfeitedEur.value).toBeNull();
  });

  it("mit Reihe und ohne negative Stunden ist der Abzug 0", () => {
    const result = computePremium({
      ...BASE,
      negativeHoursResult: findNegativePriceHours(hours([10, 20, 30]), 4),
    });
    expect(result.affectedHours.value).toBe(0);
    expect(result.forfeitedEur.value).toBe(0);
  });
});

describe("Entfallener Anspruch", () => {
  const negative = findNegativePriceHours(hours([-1, -2, -3, -4, -5, 10]), 4);

  it("wird aus der Erzeugung IN diesen Stunden gerechnet", () => {
    const result = computePremium({
      ...BASE,
      negativeHoursResult: negative,
      productionInNegativeHoursKwh: 40_000,
    });
    expect(result.affectedHours.value).toBe(5);
    // 9,4815 ct x 40.000 kWh / 100 = 3.792,60 EUR
    expect(result.forfeitedEur.value).toBeCloseTo(3_792.6, 2);
  });

  it("ohne diese Erzeugung bleibt der Betrag leer — die Stunden nicht", () => {
    // Die Stundenzahl allein sagt nichts ueber die Menge: in einer
    // Flautestunde entfaellt nichts.
    const result = computePremium({ ...BASE, negativeHoursResult: negative });
    expect(result.affectedHours.value).toBe(5);
    expect(result.forfeitedEur.value).toBeNull();
    expect(result.warnings.some((w) => w.includes("§ 51 EEG"))).toBe(true);
  });
});

describe("Der Herleitungssatz", () => {
  it("nennt alle Bestandteile", () => {
    const result = computePremium({
      ...BASE,
      negativeHoursResult: findNegativePriceHours(hours([-1, -2, -3, -4]), 4),
      productionInNegativeHoursKwh: 30_000,
    });
    expect(result.statement).toContain("Anzulegender Wert");
    expect(result.statement).toContain("Marktprämie");
    expect(result.statement).toContain("§ 51 EEG");
  });

  it("sagt es, wenn nichts berechenbar ist", () => {
    const result = computePremium({
      awardValueCtPerKwh: null,
      correctionFactor: null,
      marketValueCtPerKwh: null,
      productionKwh: null,
      negativeHoursResult: null,
      productionInNegativeHoursKwh: null,
    });
    expect(result.statement).toContain("Nicht berechenbar");
  });
});
