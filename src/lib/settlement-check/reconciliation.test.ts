/**
 * A3: Dreiecksabgleich der Netzbetreiber-Abrechnung.
 *
 * Heute werden die Zahlen abgetippt und geglaubt. Diese Tests halten vor allem
 * fest, was NICHT als „in Ordnung" durchgeht.
 */

import { describe, it, expect } from "vitest";
import {
  reconcile,
  DEFAULT_TOLERANCES,
  type ReconciliationInput,
  type ReconciliationFinding,
} from "./reconciliation";

function base(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    settled: { productionKwh: 1_000_000, revenueEur: 90_000 },
    scadaKwh: 1_000_000,
    reportedKwh: 1_000_000,
    expectedRatePerKwh: 0.09,
    tolerances: DEFAULT_TOLERANCES,
    ...overrides,
  };
}

function find(findings: ReconciliationFinding[], code: string): ReconciliationFinding {
  const hit = findings.find((f) => f.code === code);
  if (!hit) throw new Error(`Befund ${code} fehlt`);
  return hit;
}

describe("Alles stimmt", () => {
  it("meldet keinen Befund", () => {
    const result = reconcile(base());
    expect(result.worstSeverity).toBe("OK");
    expect(result.availableSources).toBe(3);
  });

  it("kleine Rundungsunterschiede bleiben in der Toleranz", () => {
    const result = reconcile(base({ scadaKwh: 1_002_000 }));
    expect(find(result.findings, "quantity.settled_vs_scada").severity).toBe("OK");
  });
});

describe("Mengenabweichung", () => {
  it("eine zu niedrig abgerechnete Menge wird gemeldet", () => {
    // 970.000 statt 1.000.000 — 30.000 kWh, bei 9 ct sind das 2.700 EUR.
    const result = reconcile(base({ settled: { productionKwh: 970_000, revenueEur: 87_300 } }));
    const finding = find(result.findings, "quantity.settled_vs_scada");
    expect(finding.severity).toBe("WARNING");
    expect(finding.deviationAbs).toBe(-30_000);
    expect(finding.message).toContain("niedriger");
  });

  it("eine grobe Abweichung gilt als kritisch", () => {
    // Faktor 1000 — der klassische kWh/MWh-Dreher.
    const result = reconcile(base({ settled: { productionKwh: 1_000, revenueEur: 90 } }));
    expect(find(result.findings, "quantity.settled_vs_scada").severity).toBe("CRITICAL");
  });

  it("die Richtung der Abweichung steht im Befund", () => {
    const result = reconcile(base({ settled: { productionKwh: 1_050_000, revenueEur: 94_500 } }));
    expect(find(result.findings, "quantity.settled_vs_scada").message).toContain("höher");
  });
});

describe("Preisabweichung", () => {
  it("ein zu niedriger Satz wird gemeldet", () => {
    // 8,5 statt 9 ct — bei 1 Mio. kWh sind das 5.000 EUR.
    const result = reconcile(base({ settled: { productionKwh: 1_000_000, revenueEur: 85_000 } }));
    const finding = find(result.findings, "price.settled_vs_expected");
    expect(finding.severity).not.toBe("OK");
    expect(finding.left.value).toBeCloseTo(0.085, 4);
  });

  it("der Erlösvergleich beziffert dieselbe Abweichung in Euro", () => {
    // Der Satzvergleich sagt "0,5 ct zu wenig", der Erlösvergleich "5.000 EUR"
    // — letzteres ist die Zahl, ueber die diskutiert wird.
    const result = reconcile(base({ settled: { productionKwh: 1_000_000, revenueEur: 85_000 } }));
    const finding = find(result.findings, "revenue.settled_vs_expected");
    expect(finding.deviationAbs).toBe(-5_000);
  });

  it("beim Satz gibt es keine absolute Untergrenze", () => {
    // 0,001 EUR/kWh Abweichung ist bei 2 Mio. kWh bereits 2.000 EUR — eine
    // absolute Schwelle wuerde das verschlucken.
    const result = reconcile(
      base({
        settled: { productionKwh: 2_000_000, revenueEur: 178_000 },
        scadaKwh: 2_000_000,
        reportedKwh: 2_000_000,
        expectedRatePerKwh: 0.09,
      }),
    );
    expect(find(result.findings, "price.settled_vs_expected").severity).not.toBe("OK");
  });
});

describe("Fehlende Quellen sind KEIN bestandener Abgleich", () => {
  it("ohne SCADA-Daten kommt INFO statt OK", () => {
    // Genau der stille Durchlauf ist das, was A3 verhindern soll.
    const result = reconcile(base({ scadaKwh: null }));
    const finding = find(result.findings, "quantity.settled_vs_scada");
    expect(finding.severity).toBe("INFO");
    expect(finding.message).toContain("nicht möglich");
    expect(result.worstSeverity).not.toBe("OK");
  });

  it("ohne hinterlegten Satz wird der Preis nicht als richtig gewertet", () => {
    const result = reconcile(base({ expectedRatePerKwh: null }));
    const finding = find(result.findings, "price.settled_vs_expected");
    expect(finding.severity).toBe("INFO");
    expect(finding.message).toContain("Kein hinterlegter Vergütungssatz");
  });

  it("die Zahl der vorhandenen Quellen wird ausgewiesen", () => {
    expect(reconcile(base({ scadaKwh: null, reportedKwh: null })).availableSources).toBe(1);
  });

  it("ohne abgerechnete Menge laesst sich kein Satz bilden", () => {
    const result = reconcile(base({ settled: { productionKwh: null, revenueEur: 90_000 } }));
    expect(find(result.findings, "price.settled_vs_expected").message).toContain(
      "nicht ermittelbar",
    );
  });

  it("eine abgerechnete Menge von 0 fuehrt nicht zur Division durch null", () => {
    const result = reconcile(base({ settled: { productionKwh: 0, revenueEur: 90_000 } }));
    expect(find(result.findings, "price.settled_vs_expected").left.value).toBeNull();
  });
});

describe("Einordnung: welche Quelle weicht ab", () => {
  it("SCADA und Produktion einig, Abrechnung weicht ab", () => {
    const result = reconcile(base({ settled: { productionKwh: 900_000, revenueEur: 81_000 } }));
    expect(result.interpretation).toContain("die Abweichung liegt bei der Abrechnung");
  });

  it("Abrechnung und Produktion einig, SCADA weicht ab", () => {
    const result = reconcile(base({ scadaKwh: 800_000 }));
    expect(result.interpretation).toContain("SCADA-Daten weichen ab");
  });

  it("Abrechnung und SCADA einig, erfasste Produktion weicht ab", () => {
    const result = reconcile(base({ reportedKwh: 800_000 }));
    expect(result.interpretation).toContain("erfasste Produktion weicht ab");
  });

  it("alle drei verschieden — einzeln pruefen", () => {
    const result = reconcile(
      base({
        settled: { productionKwh: 900_000, revenueEur: 81_000 },
        scadaKwh: 1_000_000,
        reportedKwh: 1_100_000,
      }),
    );
    expect(result.interpretation).toContain("einzeln prüfen");
  });

  it("ohne Abweichung gibt es keine Einordnung", () => {
    expect(reconcile(base()).interpretation).toBeNull();
  });
});

describe("Toleranzen", () => {
  it("die absolute Untergrenze faengt kleine Mengen ab", () => {
    // 0,5 % von 200 kWh ist 1 kWh — jede Rundung schluege an.
    const result = reconcile(
      base({
        settled: { productionKwh: 200, revenueEur: 18 },
        scadaKwh: 260,
        reportedKwh: 260,
        expectedRatePerKwh: 0.09,
      }),
    );
    expect(find(result.findings, "quantity.settled_vs_scada").severity).toBe("OK");
  });

  it("eigene Toleranzen werden beachtet", () => {
    const strict = reconcile(
      base({
        scadaKwh: 1_003_000,
        tolerances: { ...DEFAULT_TOLERANCES, quantityPct: 0.1, quantityFloorKwh: 0 },
      }),
    );
    expect(find(strict.findings, "quantity.settled_vs_scada").severity).toBe("WARNING");
  });
});
