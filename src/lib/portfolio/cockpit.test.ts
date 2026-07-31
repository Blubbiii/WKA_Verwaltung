/**
 * B5: Portfolio-Cockpit.
 *
 * Der Schwerpunkt liegt auf den LEEREN Zellen. Ein Cockpit wird von aussen
 * gelesen — von Banken und Beiräten. Eine Lücke, die als 0 erscheint, ist dort
 * schlimmer als gar keine Zahl.
 */

import { describe, it, expect } from "vitest";
import { buildCell, summarize, REASONS, type CockpitInputRow } from "./cockpit";
import type { TimeBuckets } from "@/lib/availability/contractual-availability";

const YEAR_SECONDS = 365 * 24 * 3600;

function buckets(partial: Partial<TimeBuckets>): TimeBuckets {
  return { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t5_1: 0, t5_2: 0, t5_3: 0, ...partial };
}

const FULL: CockpitInputRow = {
  parkId: "p1",
  parkName: "Windpark Nord",
  year: 2025,
  productionKwh: 24_000_000,
  forecastKwh: null,
  revenueEur: 1_800_000,
  operatingCostEur: 300_000,
  leaseCostEur: 200_000,
  availability: null,
  distributedEur: null,
  installedKw: 12_000,
};

describe("Fehlende Daten erscheinen NICHT als 0", () => {
  it("ohne Produktion bleibt die Zelle leer — mit Begruendung", () => {
    const cell = buildCell({ ...FULL, productionKwh: null });
    expect(cell.productionMwh.value).toBeNull();
    expect(cell.productionMwh.unavailable).toBe(REASONS.noProduction);
  });

  it("ohne Erloes bleibt der Erloes je MWh leer", () => {
    const cell = buildCell({ ...FULL, revenueEur: null });
    expect(cell.revenuePerMwh.value).toBeNull();
    expect(cell.revenuePerMwh.unavailable).toBe(REASONS.noRevenue);
  });

  it("ohne SCADA-Daten bleibt die Verfuegbarkeit leer", () => {
    // 0 % Verfuegbarkeit waere die Aussage "stand das ganze Jahr still".
    const cell = buildCell(FULL);
    expect(cell.technicalAvailability.value).toBeNull();
    expect(cell.contractualAvailability.value).toBeNull();
    expect(cell.technicalAvailability.unavailable).toBe(REASONS.noAvailability);
  });

  it("ohne installierte Leistung keine Volllaststunden", () => {
    const cell = buildCell({ ...FULL, installedKw: null });
    expect(cell.fullLoadHours.value).toBeNull();
    expect(cell.fullLoadHours.unavailable).toBe(REASONS.noInstalledPower);
  });
});

describe("Was gar nicht gerechnet wird", () => {
  it("die Schuldendienstdeckung bleibt IMMER leer", () => {
    // Es gibt kein Darlehensmodell im Schema — weder Tilgung noch Zins noch
    // Restschuld. Eine geschaetzte Zahl waere genau in dem Gespraech falsch,
    // fuer das sie gedacht ist.
    const cell = buildCell(FULL);
    expect(cell.debtServiceCoverage.value).toBeNull();
    expect(cell.debtServiceCoverage.unavailable).toContain("Keine Darlehensdaten");
  });

  it("die Prognoseerreichung bleibt ohne hinterlegte Prognose leer", () => {
    const cell = buildCell(FULL);
    expect(cell.forecastAchievement.value).toBeNull();
    expect(cell.forecastAchievement.unavailable).toContain("keine kWh");
  });

  it("mit hinterlegter Prognose wird sie gerechnet", () => {
    const cell = buildCell({ ...FULL, forecastKwh: 25_000_000 });
    expect(cell.forecastAchievement.value).toBe(96);
  });
});

describe("Die Kennzahlen", () => {
  it("Produktion in MWh", () => {
    expect(buildCell(FULL).productionMwh.value).toBe(24_000);
  });

  it("Volllaststunden", () => {
    // 24.000.000 kWh / 12.000 kW = 2.000 h
    expect(buildCell(FULL).fullLoadHours.value).toBe(2000);
  });

  it("Erloes je MWh", () => {
    expect(buildCell(FULL).revenuePerMwh.value).toBe(75);
  });

  it("Kosten je MWh — Pacht ZAEHLT mit", () => {
    // Pacht ist Betriebsaufwand. Sie wegzulassen ergaebe eine schoenere Zahl,
    // die niemandem hilft.
    // (300.000 + 200.000) / 24.000 = 20,83
    expect(buildCell(FULL).costPerMwh.value).toBeCloseTo(20.83, 2);
  });

  it("Betriebsergebnis", () => {
    expect(buildCell(FULL).operatingResultEur.value).toBe(1_300_000);
  });
});

describe("Verfuegbarkeit", () => {
  it("kommt aus derselben Rechnung wie der Garantieabgleich", () => {
    // Bei einer 97-%-Garantie faellt ein halber Prozentpunkt Unterschied
    // sofort auf — deshalb keine zweite Formel im Cockpit.
    const cell = buildCell({
      ...FULL,
      availability: buckets({ t1: YEAR_SECONDS * 0.95, t2: YEAR_SECONDS * 0.03, t5: YEAR_SECONDS * 0.02 }),
    });
    expect(cell.technicalAvailability.value).toBeCloseTo(98, 1);
  });

  it("die vertragliche liegt ueber der technischen, wenn Ausschluesse anfallen", () => {
    // T5.1-T5.3 fallen aus Zaehler UND Nenner — Netzausfall geht nicht zulasten
    // des Herstellers.
    const withOutage = buildCell({
      ...FULL,
      availability: buckets({
        t1: YEAR_SECONDS * 0.95,
        t2: YEAR_SECONDS * 0.02,
        t5: YEAR_SECONDS * 0.03,
        t5_1: YEAR_SECONDS * 0.02,
      }),
    });
    expect(withOutage.contractualAvailability.value!).toBeGreaterThan(
      withOutage.technicalAvailability.value!,
    );
  });
});

describe("Ausschuettungsquote", () => {
  it("wird gegen ein positives Ergebnis gerechnet", () => {
    const cell = buildCell({ ...FULL, distributedEur: 650_000 });
    expect(cell.payoutRatio.value).toBe(50);
  });

  it("wird gegen ein NEGATIVES Ergebnis NICHT gerechnet", () => {
    // Eine negative Quote liest niemand richtig.
    const cell = buildCell({
      ...FULL,
      revenueEur: 100_000,
      operatingCostEur: 300_000,
      leaseCostEur: 200_000,
      distributedEur: 50_000,
    });
    expect(cell.operatingResultEur.value!).toBeLessThan(0);
    expect(cell.payoutRatio.value).toBeNull();
    expect(cell.payoutRatio.unavailable).toBe(REASONS.negativeResult);
  });

  it("ohne Ausschuettung bleibt sie leer, nicht 0", () => {
    // "0 % ausgeschuettet" und "keine Ausschuettung erfasst" sind zwei
    // verschiedene Aussagen.
    const cell = buildCell(FULL);
    expect(cell.payoutRatio.value).toBeNull();
    expect(cell.payoutRatio.unavailable).toBe(REASONS.noDistribution);
  });
});

describe("Jahressumme", () => {
  const cells = [
    buildCell(FULL),
    buildCell({ ...FULL, parkId: "p2", parkName: "Windpark Süd", productionKwh: 12_000_000, revenueEur: 900_000 }),
    // Dritter Park ohne Daten.
    buildCell({
      ...FULL,
      parkId: "p3",
      parkName: "Windpark Ost",
      productionKwh: null,
      revenueEur: null,
      operatingCostEur: null,
      leaseCostEur: null,
    }),
  ];

  it("summiert nur die Zellen MIT Wert", () => {
    const summary = summarize(cells, 2025);
    expect(summary.productionMwh.value).toBe(36_000);
    expect(summary.revenueEur.value).toBe(2_700_000);
  });

  it("meldet, ueber wie viele Parks summiert wurde", () => {
    // Ohne diese Angabe saehe eine Summe ueber zwei von drei Parks aus wie das
    // Portfolio — und waere um ein Drittel zu klein.
    const summary = summarize(cells, 2025);
    expect(summary.parksWithData).toBe(2);
    expect(summary.parksTotal).toBe(3);
  });

  it("ein Jahr ganz ohne Daten ergibt leere Summen", () => {
    const summary = summarize(cells, 2019);
    expect(summary.productionMwh.value).toBeNull();
    expect(summary.parksTotal).toBe(0);
  });
});
