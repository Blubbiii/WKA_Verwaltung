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
  /*
    Die Werte stammen aus echten Zehnminutenzeilen der Enercon-Dateien
    (Loc_3196 und Loc_5842, 2023). Entscheidend ist die Bedeutung der Felder:
    mrwSmpPwin/Pte/Pfm/Pext sind NICHT die ausgefallene Leistung, sondern die
    unter dem jeweiligen Gesichtspunkt noch zulaessige. Im ungestoerten
    Betrieb stehen alle vier ungefaehr auf der tatsaechlichen Leistung — in
    210.272 gemessenen Intervallen lag P in 93,5 % der Faelle auf dem Minimum
    der vier Werte, der Median der Abweichung betrug 0,0 kW.
  */
  function probe(over: Partial<CurtailmentSample> = {}): CurtailmentSample {
    return {
      timestamp: new Date(2026, 0, 1, 0, 0),
      powerKw: 670,
      powerWindKw: 667,
      powerTechnicalKw: 667,
      powerForcedKw: 667,
      powerExternalKw: 667,
      ...over,
    };
  }

  function reihe(vorlage: Partial<CurtailmentSample>, anzahl = 6): CurtailmentSample[] {
    return Array.from({ length: anzahl }, (_, i) =>
      probe({ ...vorlage, timestamp: new Date(2026, 0, 1, 0, i * 10) }),
    );
  }

  it("ungestoerter Teillastbetrieb ist keine Abregelung", () => {
    /*
      Der Kern des Fehlers: Wer die vier Felder aufsummiert, erhaelt hier
      4 x 667 kW als "Verlust" — mehr als die Anlage ueberhaupt erzeugt.
      Ueber ein ganzes Jahr gerechnet waren das 430 % der Produktion.
    */
    const result = computeLostWorkFromSignal(reihe({}), { intervalMinutes: 10 });
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.lostWorkKwh).toBe(0);
    expect(result.byCause).toEqual({ technical: 0, forced: 0, external: 0 });
  });

  it("externe Begrenzung im Volllastbereich ergibt die Differenz zur Windleistung", () => {
    // Echte Zeile vom 12.01.2023: 15,1 m/s, der Wind traegt 2.060 kW, die
    // externe Vorgabe deckelt auf 1.855 kW, eingespeist werden 1.874 kW.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 1874,
        powerWindKw: 2060,
        powerTechnicalKw: 2060,
        powerForcedKw: 2060,
        powerExternalKw: 1855,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    // (2060 - 1874) kW x 1 h = 186 kWh
    expect(result.lostWorkKwh).toBe(186);
    expect(result.byCause.external).toBe(186);
    expect(result.byCause.technical).toBe(0);
  });

  it("eine technische Abschaltung ist kein Redispatch", () => {
    /*
      Echte Zeile: 12,5 m/s, der Wind traegt 2.054 kW, die Anlage steht.
      Bindend ist Pte = 0. Wer das dem Netzbetreiber in Rechnung stellt,
      erhebt eine Forderung ohne Grundlage.
    */
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 0,
        powerWindKw: 2054,
        powerTechnicalKw: 0,
        powerForcedKw: 2054,
        powerExternalKw: 3,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.byCause.technical).toBe(2054);
    expect(result.byCause.external).toBe(0);
  });

  it("eine erzwungene Abschaltung wird als solche gefuehrt", () => {
    // Echte Zeile: 5,3 m/s, der Wind traegt 516 kW, Pfm = 0.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 0,
        powerWindKw: 516,
        powerTechnicalKw: 516,
        powerForcedKw: 0,
        powerExternalKw: 516,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.byCause.forced).toBe(516);
    expect(result.byCause.external).toBe(0);
  });

  it("bei Gleichstand gewinnt die Ursache, die KEINEN Anspruch begruendet", () => {
    // Stehen zwei Grenzen gleich tief, ist nicht belegt, dass der
    // Netzbetreiber sie veranlasst hat. Die Forderung waere eine Behauptung.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 0,
        powerWindKw: 1200,
        powerTechnicalKw: 1200,
        powerForcedKw: 0,
        powerExternalKw: 0,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.byCause.forced).toBe(1200);
    expect(result.byCause.external).toBe(0);
  });

  it("Flaute ist kein Verlust", () => {
    // 2,0 m/s: alle vier Werte stehen auf 3 kW, die Anlage traegt sich gerade.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 3,
        powerWindKw: 3,
        powerTechnicalKw: 3,
        powerForcedKw: 3,
        powerExternalKw: 3,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.lostWorkKwh).toBe(0);
  });

  it("was unterhalb der Grenze fehlt, wird der Abregelung nicht angelastet", () => {
    /*
      Die Anlage darf 1.000 kW, der Wind traegt 2.000 kW, eingespeist werden
      nur 500 kW. Die Abregelung kostet 1.000 kW; die fehlenden 500 kW haben
      einen anderen Grund und gehoeren nicht in die Forderung.
    */
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 500,
        powerWindKw: 2000,
        powerTechnicalKw: 2000,
        powerForcedKw: 2000,
        powerExternalKw: 1000,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.lostWorkKwh).toBe(1000);
  });

  it("ein Zappeln der Grenze um wenige Kilowatt ist keine Abregelung", () => {
    // Im Normalbetrieb schwanken die Grenzen um einige kW um die Leistung.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: 1200,
        powerWindKw: 1210,
        powerTechnicalKw: 1210,
        powerForcedKw: 1210,
        powerExternalKw: 1195,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.lostWorkKwh).toBe(0);
  });

  it("ohne Windleistung laesst sich nichts berechnen", () => {
    const result = computeLostWorkFromSignal(
      reihe({
        powerWindKw: null,
        powerKw: null,
        powerTechnicalKw: null,
        powerForcedKw: null,
        powerExternalKw: null,
      }),
      { intervalMinutes: 10 },
    );
    expect(result.lostWorkKwh).toBeNull();
    if (result.lostWorkKwh !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Kein Abregelungssignal");
  });

  it("nur die verwertbaren Intervalle werden gezaehlt", () => {
    const brauchbar = reihe(
      {
        powerKw: 0,
        powerWindKw: 1000,
        powerTechnicalKw: 1000,
        powerForcedKw: 1000,
        powerExternalKw: 0,
      },
      2,
    );
    const unbrauchbar = reihe({ powerWindKw: null }, 1);
    const result = computeLostWorkFromSignal([...brauchbar, ...unbrauchbar], {
      intervalMinutes: 10,
    });
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.intervalCount).toBe(2);
  });

  it("negative Leistung wird wie Stillstand behandelt", () => {
    // Eigenverbrauch im Stillstand darf die Ausfallarbeit nicht vergroessern.
    const result = computeLostWorkFromSignal(
      reihe({
        powerKw: -20,
        powerWindKw: 1000,
        powerTechnicalKw: 1000,
        powerForcedKw: 1000,
        powerExternalKw: 0,
      }),
      { intervalMinutes: 10 },
    );
    if (result.lostWorkKwh === null) throw new Error("unerwartet");
    expect(result.lostWorkKwh).toBe(1000);
  });
});

describe("Die ganze Kette", () => {
  it("Signal zu Ausfallarbeit zu Forderung", () => {
    // 3 Stunden externe Abregelung: Der Wind traegt 2.000 kW, erlaubt sind 0.
    const achtzehn = Array.from({ length: 18 }, (_, i) => ({
      timestamp: new Date(2026, 5, 1, 0, i * 10),
      powerKw: 0,
      powerWindKw: 2000,
      powerTechnicalKw: 2000,
      powerForcedKw: 2000,
      powerExternalKw: 0,
    }));
    const work = computeLostWorkFromSignal(achtzehn, { intervalMinutes: 10 });
    if (work.lostWorkKwh === null) throw new Error("unerwartet");
    expect(work.lostWorkKwh).toBe(6000);
    expect(work.byCause.external).toBe(6000);

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
