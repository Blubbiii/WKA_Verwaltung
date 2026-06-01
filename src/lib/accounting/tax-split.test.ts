/**
 * Goldmaster-Tests für tax-split (P11).
 *
 * Diese Tests sind das Sicherheitsnetz gegen falsche USt-Splits — wenn
 * irgendjemand die Rundungslogik anfasst, müssen diese Fälle weiterhin
 * exakt passen. Werte stammen aus DATEV/Steuerberater-Referenz für
 * deutsche USt-Berechnung.
 *
 * Edge-Cases:
 *  - Brutto = exakt durch (1+rate) teilbar → glatte Centbeträge
 *  - Brutto mit Rundungsverlust → Summe net+tax muss exakt gross sein
 *  - 0% Sätze (EXEMPT, IGL, EXPORT, KLEINUNTERNEHMER, NOT_TAXABLE)
 *  - Reverse-Charge (net=gross, tax=0, isReverseCharge=true)
 *  - Sehr kleine Beträge (1 Cent, 1 Euro)
 *  - Sehr große Beträge (1 Mio €)
 */

import { describe, it, expect } from "vitest";
import { TaxCategory } from "@prisma/client";
import { splitGrossAmount, splitNetAmount } from "./tax-split";

const SPEC_19 = { rate: 0.19, reverseCharge: false, category: TaxCategory.STANDARD_19 };
const SPEC_7 = { rate: 0.07, reverseCharge: false, category: TaxCategory.REDUCED_7 };
const SPEC_0_EXEMPT = { rate: 0, reverseCharge: false, category: TaxCategory.EXEMPT };
const SPEC_RC = { rate: 0.19, reverseCharge: true, category: TaxCategory.REVERSE_CHARGE_13B };

describe("splitGrossAmount — Goldmaster", () => {
  it("119€ @ 19% → 100€ + 19€", () => {
    const r = splitGrossAmount({ gross: 119 }, SPEC_19);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(19);
    expect(r.effectiveGross).toBe(119);
    expect(r.isReverseCharge).toBe(false);
  });

  it("107€ @ 7% → 100€ + 7€", () => {
    const r = splitGrossAmount({ gross: 107 }, SPEC_7);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(7);
    expect(r.effectiveGross).toBe(107);
  });

  it("100€ @ 19% → 84,03€ + 15,97€ (Summe exakt)", () => {
    const r = splitGrossAmount({ gross: 100 }, SPEC_19);
    expect(r.net).toBe(84.03);
    expect(r.tax).toBe(15.97);
    expect(r.net + r.tax).toBeCloseTo(100, 2);
  });

  it("1000€ @ 19% → 840,34€ + 159,66€ (Rundung)", () => {
    const r = splitGrossAmount({ gross: 1000 }, SPEC_19);
    expect(r.net).toBe(840.34);
    expect(r.tax).toBe(159.66);
    expect(r.net + r.tax).toBeCloseTo(1000, 2);
  });

  it("123,45€ @ 19% → konsistente Summe", () => {
    const r = splitGrossAmount({ gross: 123.45 }, SPEC_19);
    expect(r.net + r.tax).toBeCloseTo(123.45, 2);
  });

  it("1.000.000€ @ 19% (Mio-Betrag)", () => {
    const r = splitGrossAmount({ gross: 1_000_000 }, SPEC_19);
    expect(r.net).toBeCloseTo(840_336.13, 2);
    expect(r.tax).toBeCloseTo(159_663.87, 2);
    expect(r.net + r.tax).toBeCloseTo(1_000_000, 2);
  });

  it("0,01€ @ 19% (Mini-Betrag)", () => {
    const r = splitGrossAmount({ gross: 0.01 }, SPEC_19);
    expect(r.net + r.tax).toBeCloseTo(0.01, 2);
  });
});

describe("splitGrossAmount — rate=0 Fälle", () => {
  it("EXEMPT: 100€ → 100€ net + 0€ tax", () => {
    const r = splitGrossAmount({ gross: 100 }, SPEC_0_EXEMPT);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(0);
    expect(r.isReverseCharge).toBe(false);
  });

  it("IGL (rate=0): 5000€ → 5000€ net + 0€", () => {
    const r = splitGrossAmount(
      { gross: 5000 },
      { rate: 0, reverseCharge: false, category: TaxCategory.IGL_INTRA_EU },
    );
    expect(r.net).toBe(5000);
    expect(r.tax).toBe(0);
  });

  it("EXPORT: 250€ → 250€ + 0€", () => {
    const r = splitGrossAmount(
      { gross: 250 },
      { rate: 0, reverseCharge: false, category: TaxCategory.EXPORT },
    );
    expect(r.net).toBe(250);
    expect(r.tax).toBe(0);
  });

  it("KLEINUNTERNEHMER: 119€ → 119€ + 0€ (Brutto = Netto)", () => {
    const r = splitGrossAmount(
      { gross: 119 },
      { rate: 0, reverseCharge: false, category: TaxCategory.KLEINUNTERNEHMER_19 },
    );
    expect(r.net).toBe(119);
    expect(r.tax).toBe(0);
  });
});

describe("splitGrossAmount — Reverse-Charge", () => {
  it("§13b 19%: net=gross, tax=0, isReverseCharge=true", () => {
    const r = splitGrossAmount({ gross: 1000 }, SPEC_RC);
    expect(r.net).toBe(1000);
    expect(r.tax).toBe(0);
    expect(r.isReverseCharge).toBe(true);
  });

  it("§13b mit Decimal-Brutto", () => {
    const r = splitGrossAmount({ gross: 123.45 }, SPEC_RC);
    expect(r.net).toBe(123.45);
    expect(r.isReverseCharge).toBe(true);
  });

  it("IGE_INTRA_EU 19% reverse-charge", () => {
    const r = splitGrossAmount(
      { gross: 500 },
      { rate: 0.19, reverseCharge: true, category: TaxCategory.IGE_INTRA_EU },
    );
    expect(r.net).toBe(500);
    expect(r.tax).toBe(0);
    expect(r.isReverseCharge).toBe(true);
  });
});

describe("splitNetAmount — Netto → Brutto+USt", () => {
  it("100€ netto @ 19% → 119€ brutto", () => {
    const r = splitNetAmount(100, SPEC_19);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(19);
    expect(r.effectiveGross).toBe(119);
  });

  it("100€ netto @ 7% → 107€ brutto", () => {
    const r = splitNetAmount(100, SPEC_7);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(7);
    expect(r.effectiveGross).toBe(107);
  });

  it("EXEMPT: 100€ netto → 100€ brutto (tax=0)", () => {
    const r = splitNetAmount(100, SPEC_0_EXEMPT);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(0);
    expect(r.effectiveGross).toBe(100);
  });

  it("Reverse-Charge: net=net, tax=0", () => {
    const r = splitNetAmount(100, SPEC_RC);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(0);
    expect(r.isReverseCharge).toBe(true);
  });
});

describe("Rundungs-Invariante: net + tax === gross für alle Sätze", () => {
  const samples = [1, 9.99, 50, 100, 123.45, 999.99, 1234.56, 50_000, 999_999.99];

  // Hinweis: net+tax via Float-Addition kann minimal abweichen
  // (z.B. 103.74 + 19.71 = 123.45000000000002). Wir vergleichen daher
  // Cent-genau über Math.round, was die fachliche Realität trifft.
  function centsOf(x: number): number {
    return Math.round(x * 100);
  }

  it.each(samples)("gross=%s @ 19% summiert exakt", (gross) => {
    const r = splitGrossAmount({ gross }, SPEC_19);
    expect(centsOf(r.net) + centsOf(r.tax)).toBe(centsOf(r.effectiveGross));
  });

  it.each(samples)("gross=%s @ 7% summiert exakt", (gross) => {
    const r = splitGrossAmount({ gross }, SPEC_7);
    expect(centsOf(r.net) + centsOf(r.tax)).toBe(centsOf(r.effectiveGross));
  });
});
