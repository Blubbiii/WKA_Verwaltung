/**
 * A4: Ausfallarbeit und Entschädigung bei Abregelung.
 *
 * Der Kern ist die Staffel aus § 15 Abs. 1 EEG: 95 % der entgangenen Einnahmen,
 * und ab dem Überschreiten von 1 % der Jahreseinnahmen 100 %. Genau die
 * Teilung eines Ereignisses an dieser Schwelle fällt bei einer Handrechnung
 * unter den Tisch.
 */

import { describe, it, expect } from "vitest";
import {
  computeCompensation,
  computeLostWorkFromSignal,
  type CompensationInput,
  type CurtailmentSample,
} from "./compensation";

function base(overrides: Partial<CompensationInput> = {}): CompensationInput {
  return {
    legalBasis: "EEG_15",
    lostWorkKwh: 10_000,
    ratePerKwh: 0.09,
    priorLostRevenueEurInYear: 0,
    annualRevenueEur: 1_000_000,
    ...overrides,
  };
}

describe("§ 15 EEG — Quote unterhalb der Schwelle", () => {
  it("entschaedigt mit 95 Prozent", () => {
    // 10.000 kWh x 0,09 = 900 EUR entgangene Einnahmen → 855 EUR Forderung.
    const result = computeCompensation(base());
    expect(result.lostRevenueEur).toBe(900);
    expect(result.portionAt95Eur).toBe(900);
    expect(result.portionAt100Eur).toBe(0);
    expect(result.claimEur).toBe(855);
  });

  it("die Schwelle liegt bei 1 Prozent der Jahreseinnahmen", () => {
    const result = computeCompensation(base());
    expect(result.thresholdEur).toBe(10_000);
  });
});

describe("§ 15 EEG — Ueberschreiten der Schwelle", () => {
  it("ab der Schwelle gilt 100 Prozent", () => {
    // Schwelle 10.000 EUR, bereits 12.000 EUR ausgefallen → alles darueber
    // voll entschaedigt.
    const result = computeCompensation(
      base({ priorLostRevenueEurInYear: 12_000, lostWorkKwh: 10_000 }),
    );
    expect(result.portionAt95Eur).toBe(0);
    expect(result.portionAt100Eur).toBe(900);
    expect(result.claimEur).toBe(900);
  });

  it("ein Ereignis, das die Schwelle ueberschreitet, wird GETEILT", () => {
    // Genau das faellt bei einer Handrechnung unter den Tisch.
    // Schwelle 10.000, bereits 9.500 → 500 EUR zu 95 %, der Rest zu 100 %.
    const result = computeCompensation(
      base({ priorLostRevenueEurInYear: 9_500, lostWorkKwh: 20_000 }),
    );
    expect(result.lostRevenueEur).toBe(1_800);
    expect(result.portionAt95Eur).toBe(500);
    expect(result.portionAt100Eur).toBe(1_300);
    // 500 x 0,95 + 1.300 = 1.775
    expect(result.claimEur).toBe(1_775);
    expect(result.thresholdCrossed).toBe(true);
  });

  it("die Teilung wird als Hinweis ausgewiesen", () => {
    const result = computeCompensation(
      base({ priorLostRevenueEurInYear: 9_500, lostWorkKwh: 20_000 }),
    );
    expect(result.warnings.some((w) => w.includes("1-%-Schwelle"))).toBe(true);
  });

  it("genau auf der Schwelle bleibt es bei 95 Prozent", () => {
    const result = computeCompensation(
      base({ priorLostRevenueEurInYear: 9_100, lostWorkKwh: 10_000 }),
    );
    expect(result.portionAt95Eur).toBe(900);
    expect(result.portionAt100Eur).toBe(0);
    expect(result.thresholdCrossed).toBe(false);
  });
});

describe("§ 15 EEG — unbekannte Jahreseinnahmen", () => {
  it("rechnet durchgehend mit 95 Prozent und sagt das", () => {
    // Die fuer den Betreiber unguenstigere Annahme — aber sie muss sichtbar
    // sein, damit nach Jahresabschluss nachgefordert wird.
    const result = computeCompensation(base({ annualRevenueEur: null }));
    expect(result.claimEur).toBe(855);
    expect(result.thresholdEur).toBeNull();
    expect(result.warnings.some((w) => w.includes("Nach Jahresabschluss neu bewerten"))).toBe(true);
  });

  it("auch bei Jahreseinnahmen von 0", () => {
    const result = computeCompensation(base({ annualRevenueEur: 0 }));
    expect(result.thresholdEur).toBeNull();
  });
});

describe("Zusaetzliche und ersparte Aufwendungen", () => {
  it("zusaetzliche Aufwendungen kommen hinzu", () => {
    const result = computeCompensation(base({ additionalExpensesEur: 100 }));
    expect(result.claimEur).toBe(955);
  });

  it("ersparte Aufwendungen werden abgezogen", () => {
    const result = computeCompensation(base({ savedExpensesEur: 50 }));
    expect(result.claimEur).toBe(805);
  });

  it("beide werden auf den vollen Betrag angewandt, nicht auf die Quote", () => {
    // § 15 Abs. 1 EEG: "95 Prozent der entgangenen Einnahmen zuzueglich der
    // zusaetzlichen Aufwendungen" — die Quote gilt fuer die Einnahmen.
    const result = computeCompensation(base({ additionalExpensesEur: 100, savedExpensesEur: 40 }));
    expect(result.claimEur).toBe(915);
  });
});

describe("§ 13a EnWG — bewusst nicht nachgerechnet", () => {
  it("weist die entgangene Einnahme als Vergleichsgroesse aus", () => {
    // Der finanzielle Ausgleich kommt vom Netzbetreiber; ihn ohne
    // Bilanzkreisdaten und Abrechnungsmodell nachzurechnen waere erfunden.
    const result = computeCompensation(base({ legalBasis: "ENWG_13A" }));
    expect(result.claimEur).toBe(900);
    expect(result.portionAt95Eur).toBe(0);
    expect(result.warnings.some((w) => w.includes("vom Netzbetreiber ermittelt"))).toBe(true);
  });

  it("ohne Anspruchsgrundlage ebenfalls nur eine Vergleichsgroesse", () => {
    const result = computeCompensation(base({ legalBasis: "OTHER" }));
    expect(result.warnings.some((w) => w.includes("Vergleichsgrösse"))).toBe(true);
  });
});

describe("Ausfallarbeit aus dem Abregelungssignal", () => {
  function samples(externalKw: (number | null)[], forcedKw: number[] = []): CurtailmentSample[] {
    return externalKw.map((value, i) => ({
      timestamp: new Date(2026, 0, 1, 0, i * 10),
      powerExternalKw: value,
      powerForcedKw: forcedKw[i] ?? null,
    }));
  }

  it("integriert die abgeregelte Leistung ueber die Intervalle", () => {
    // 6 Intervalle a 10 min = 1 h, 1.500 kW abgeregelt → 1.500 kWh.
    const result = computeLostWorkFromSignal(samples([1500, 1500, 1500, 1500, 1500, 1500]), {
      intervalMinutes: 10,
    });
    expect(result.lostWorkKwh).toBe(1500);
  });

  it("ohne Signal kommt null mit Begruendung", () => {
    const result = computeLostWorkFromSignal(samples([null, null]), { intervalMinutes: 10 });
    expect(result.lostWorkKwh).toBeNull();
    if (result.lostWorkKwh !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Kein Abregelungssignal");
  });

  it("negative Werte werden auf 0 gehoben", () => {
    // Sie wuerden die Ausfallarbeit mindern und die Forderung zu klein machen.
    const result = computeLostWorkFromSignal(samples([1500, -500, 1500, 1500, 1500, 1500]), {
      intervalMinutes: 10,
    });
    expect(result.lostWorkKwh).toBe(1250);
  });

  it("manuelle Abregelung zaehlt standardmaessig NICHT mit", () => {
    // Eine selbst veranlasste Abregelung begruendet keinen Anspruch gegen den
    // Netzbetreiber.
    const result = computeLostWorkFromSignal(
      samples([600, 600, 600, 600, 600, 600], [300, 300, 300, 300, 300, 300]),
      { intervalMinutes: 10 },
    );
    expect(result.lostWorkKwh).toBe(600);
  });

  it("auf Wunsch zaehlt sie mit — samt Hinweis", () => {
    const result = computeLostWorkFromSignal(
      samples([600, 600, 600, 600, 600, 600], [300, 300, 300, 300, 300, 300]),
      { intervalMinutes: 10, includeForced: true },
    );
    expect(result.lostWorkKwh).toBe(900);
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.warnings.some((w) => w.includes("Netzbetreiber veranlasst"))).toBe(true);
  });

  it("die Zahl der gemessenen Intervalle wird ausgewiesen", () => {
    const result = computeLostWorkFromSignal(samples([1500, null, 1500]), { intervalMinutes: 10 });
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.intervalCount).toBe(2);
  });
});

describe("Die ganze Kette", () => {
  it("Signal zu Ausfallarbeit zu Forderung", () => {
    // 3 Stunden Redispatch mit 2.000 kW Abregelung = 6.000 kWh.
    const eighteenIntervals = Array.from({ length: 18 }, () => 2000);
    const work = computeLostWorkFromSignal(
      eighteenIntervals.map((kw, i) => ({
        timestamp: new Date(2026, 5, 1, 0, i * 10),
        powerExternalKw: kw,
        powerForcedKw: null,
      })),
      { intervalMinutes: 10 },
    );
    if (work.lostWorkKwh === null) throw new Error("unerwartet");
    expect(work.lostWorkKwh).toBe(6000);

    const compensation = computeCompensation({
      legalBasis: "EEG_15",
      lostWorkKwh: work.lostWorkKwh,
      ratePerKwh: 0.0921,
      priorLostRevenueEurInYear: 0,
      annualRevenueEur: 2_000_000,
    });
    // 6.000 x 0,0921 = 552,60 → 95 % = 524,97
    expect(compensation.lostRevenueEur).toBe(552.6);
    expect(compensation.claimEur).toBe(524.97);
  });
});
