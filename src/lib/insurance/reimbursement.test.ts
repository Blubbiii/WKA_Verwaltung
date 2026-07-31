/**
 * A6: Erwartete Entschädigung aus einer Versicherungspolice.
 *
 * Der Kern ist die Reihenfolge: erst anteilige Kürzung wegen
 * Unterversicherung (§ 75 VVG), dann Selbstbehalt, dann Deckelung auf die
 * Versicherungssumme. Wer den Selbstbehalt zuerst abzieht, rechnet sich reich.
 */

import { describe, it, expect } from "vitest";
import { computeReimbursement, checkCoverageGap, type PolicyTerms } from "./reimbursement";

function terms(overrides: Partial<PolicyTerms> = {}): PolicyTerms {
  return {
    sumInsuredEur: 1_000_000,
    insuredValueEur: 1_000_000,
    waivesUnderinsurance: false,
    deductibleType: "FIXED_EUR",
    deductibleValue: 5_000,
    deductibleMinEur: null,
    deductibleMaxEur: null,
    ...overrides,
  };
}

describe("Voll versichert", () => {
  it("zieht nur den Selbstbehalt ab", () => {
    const result = computeReimbursement({ lossEur: 50_000, terms: terms() });
    expect(result.expectedReimbursementEur).toBe(45_000);
    expect(result.deductibleEur).toBe(5_000);
    expect(result.ownShareEur).toBe(5_000);
  });

  it("ein Schaden unter dem Selbstbehalt ergibt nichts — mit Hinweis", () => {
    const result = computeReimbursement({ lossEur: 3_000, terms: terms() });
    expect(result.expectedReimbursementEur).toBe(0);
    expect(result.warnings.some((w) => w.includes("unterhalb des Selbstbehalts"))).toBe(true);
  });
});

describe("Unterversicherung nach § 75 VVG", () => {
  it("kuerzt anteilig", () => {
    // Summe 600.000 zu Wert 1.000.000 → 60 % Quote.
    // Schaden 100.000 → 60.000 → minus 5.000 SB = 55.000.
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ sumInsuredEur: 600_000 }),
    });
    expect(result.underinsuranceFactor).toBe(0.6);
    expect(result.afterUnderinsuranceEur).toBe(60_000);
    expect(result.expectedReimbursementEur).toBe(55_000);
  });

  it("DIE REIHENFOLGE: erst kuerzen, dann Selbstbehalt", () => {
    // Falsche Reihenfolge (erst SB, dann kuerzen):
    //   (100.000 − 5.000) × 0,6 = 57.000 — also 2.000 EUR zu viel erwartet.
    // Richtige Reihenfolge: 55.000.
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ sumInsuredEur: 600_000 }),
    });
    expect(result.expectedReimbursementEur).toBe(55_000);
    expect(result.expectedReimbursementEur).not.toBe(57_000);
  });

  it("weist die Kuerzung als Hinweis aus", () => {
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ sumInsuredEur: 600_000 }),
    });
    expect(result.warnings.some((w) => w.includes("§ 75 VVG"))).toBe(true);
  });

  it("ein Verzicht verhindert die Kuerzung", () => {
    // In der Praxis enthalten viele Policen einen solchen Verzicht — deshalb
    // ein eigenes Feld und keine Annahme.
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ sumInsuredEur: 600_000, waivesUnderinsurance: true }),
    });
    expect(result.expectedReimbursementEur).toBe(95_000);
    expect(result.warnings.some((w) => w.includes("Verzicht"))).toBe(true);
  });

  it("ohne Versicherungswert wird NICHT gekuerzt, aber gewarnt", () => {
    // "Nicht erfasst" heisst nicht "keine Unterversicherung" — es heisst
    // "ungeprueft". Der Unterschied ist bei einem Grossschaden existenziell.
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ insuredValueEur: null }),
    });
    expect(result.underinsuranceFactor).toBeNull();
    expect(result.expectedReimbursementEur).toBe(95_000);
    expect(result.warnings.some((w) => w.includes("NICHT geprüft"))).toBe(true);
  });

  it("eine Ueberversicherung kuerzt nicht", () => {
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({ sumInsuredEur: 2_000_000 }),
    });
    expect(result.underinsuranceFactor).toBe(1);
    expect(result.expectedReimbursementEur).toBe(95_000);
  });
});

describe("Selbstbehalt-Formen", () => {
  it("fester Betrag", () => {
    const result = computeReimbursement({
      lossEur: 50_000,
      terms: terms({ deductibleType: "FIXED_EUR", deductibleValue: 2_500 }),
    });
    expect(result.deductibleEur).toBe(2_500);
  });

  it("Prozent des Schadens", () => {
    const result = computeReimbursement({
      lossEur: 50_000,
      terms: terms({ deductibleType: "PERCENT_OF_LOSS", deductibleValue: 10 }),
    });
    expect(result.deductibleEur).toBe(5_000);
  });

  it("Prozent des Schadens mit Mindestbetrag", () => {
    // 10 % von 20.000 = 2.000, Mindestbetrag 5.000 greift.
    const result = computeReimbursement({
      lossEur: 20_000,
      terms: terms({
        deductibleType: "PERCENT_OF_LOSS",
        deductibleValue: 10,
        deductibleMinEur: 5_000,
      }),
    });
    expect(result.deductibleEur).toBe(5_000);
  });

  it("Prozent des Schadens mit Hoechstbetrag", () => {
    const result = computeReimbursement({
      lossEur: 500_000,
      terms: terms({
        deductibleType: "PERCENT_OF_LOSS",
        deductibleValue: 10,
        deductibleMaxEur: 25_000,
      }),
    });
    expect(result.deductibleEur).toBe(25_000);
  });

  it("Prozent der Versicherungssumme", () => {
    const result = computeReimbursement({
      lossEur: 500_000,
      terms: terms({ deductibleType: "PERCENT_OF_SUM_INSURED", deductibleValue: 1 }),
    });
    expect(result.deductibleEur).toBe(10_000);
  });

  it("Mindest- und Hoechstbetrag gelten NICHT beim festen Betrag", () => {
    // Sonst waeren sie widerspruechlich zum ausdruecklich vereinbarten Betrag.
    const result = computeReimbursement({
      lossEur: 50_000,
      terms: terms({
        deductibleType: "FIXED_EUR",
        deductibleValue: 2_000,
        deductibleMinEur: 10_000,
      }),
    });
    expect(result.deductibleEur).toBe(2_000);
  });

  it("der Prozentsatz greift auf den GEKUERZTEN Betrag", () => {
    // Unterversicherung 60 %: 10 % von 60.000 = 6.000, nicht 10.000.
    const result = computeReimbursement({
      lossEur: 100_000,
      terms: terms({
        sumInsuredEur: 600_000,
        deductibleType: "PERCENT_OF_LOSS",
        deductibleValue: 10,
      }),
    });
    expect(result.deductibleEur).toBe(6_000);
    expect(result.expectedReimbursementEur).toBe(54_000);
  });
});

describe("Entschaedigungsgrenze", () => {
  it("die Versicherungssumme ist die Obergrenze", () => {
    const result = computeReimbursement({
      lossEur: 2_000_000,
      terms: terms({ sumInsuredEur: 1_000_000, insuredValueEur: null, deductibleValue: 0 }),
    });
    expect(result.expectedReimbursementEur).toBe(1_000_000);
    expect(result.cappedAtSumInsured).toBe(true);
  });

  it("der uebersteigende Schaden bleibt beim Betreiber", () => {
    const result = computeReimbursement({
      lossEur: 2_000_000,
      terms: terms({ sumInsuredEur: 1_000_000, insuredValueEur: null, deductibleValue: 0 }),
    });
    expect(result.ownShareEur).toBe(1_000_000);
    expect(result.warnings.some((w) => w.includes("begrenzt"))).toBe(true);
  });
});

describe("checkCoverageGap — vor dem Schaden", () => {
  it("erkennt die Luecke", () => {
    const gap = checkCoverageGap({
      sumInsuredEur: 600_000,
      insuredValueEur: 1_000_000,
      waivesUnderinsurance: false,
    });
    expect(gap.gapEur).toBe(400_000);
    expect(gap.gapPercent).toBe(40);
    expect(gap.message).toContain("Unterversicherung");
  });

  it("meldet auch bei Verzicht die wirtschaftliche Luecke", () => {
    // Der Verzicht nimmt der Luecke die rechtliche Folge, nicht die
    // wirtschaftliche: ueber der Versicherungssumme zahlt trotzdem niemand.
    const gap = checkCoverageGap({
      sumInsuredEur: 600_000,
      insuredValueEur: 1_000_000,
      waivesUnderinsurance: true,
    });
    expect(gap.gapEur).toBe(400_000);
    expect(gap.message).toContain("Entschädigungsgrenze bleibt aber die Versicherungssumme");
  });

  it("keine Luecke bei voller Deckung", () => {
    const gap = checkCoverageGap({
      sumInsuredEur: 1_000_000,
      insuredValueEur: 1_000_000,
      waivesUnderinsurance: false,
    });
    expect(gap.gapEur).toBe(0);
    expect(gap.message).toBeNull();
  });

  it("ohne Versicherungswert nicht beurteilbar", () => {
    const gap = checkCoverageGap({
      sumInsuredEur: 1_000_000,
      insuredValueEur: null,
      waivesUnderinsurance: false,
    });
    expect(gap.gapEur).toBeNull();
    expect(gap.message).toContain("nicht beurteilbar");
  });
});

describe("Der Betriebsunterbrechungsfall", () => {
  it("rechnet auf dem bewerteten Ertragsausfall aus A1", () => {
    // Die BU-Entschaedigung ist ohne A1 gar nicht berechenbar — der Schaden
    // IST der entgangene Ertrag.
    const lostRevenueFromFaultCase = 84_500;
    const result = computeReimbursement({
      lossEur: lostRevenueFromFaultCase,
      terms: terms({
        sumInsuredEur: 500_000,
        insuredValueEur: 500_000,
        deductibleType: "FIXED_EUR",
        deductibleValue: 10_000,
      }),
    });
    expect(result.expectedReimbursementEur).toBe(74_500);
  });
});
