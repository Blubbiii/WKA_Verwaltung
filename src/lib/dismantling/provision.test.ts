/**
 * A7: Rückbaurückstellung.
 *
 * Der Kern: Handels- und Steuerbilanz kommen bei derselben Verpflichtung zu
 * verschiedenen Beträgen, und beide sind richtig. Genau diese Doppelrechnung
 * macht heute der Steuerberater in Excel.
 */

import { describe, it, expect } from "vitest";
import {
  computeProvision,
  checkSecurity,
  TAX_DISCOUNT_RATE_PERCENT,
  type ProvisionInput,
} from "./provision";

function base(overrides: Partial<ProvisionInput> = {}): ProvisionInput {
  return {
    estimatedCostTodayEur: 500_000,
    balanceSheetYear: 2026,
    commissioningYear: 2016,
    dismantlingYear: 2046,
    costInflationPercent: 2,
    hgbDiscountRatePercent: 1.8,
    ...overrides,
  };
}

describe("Ansammlung", () => {
  it("verteilt linear ueber den Betriebszeitraum", () => {
    // 2016 bis 2046 = 30 Jahre, davon 10 vergangen → ein Drittel.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.accrualRatio).toBeCloseTo(1 / 3, 4);
    expect(result.hgb.remainingYears).toBe(20);
  });

  it("im Jahr der Inbetriebnahme ist noch nichts angesammelt", () => {
    const result = computeProvision(base({ balanceSheetYear: 2016 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.accrualRatio).toBe(0);
    expect(result.hgb.provisionEur).toBe(0);
  });

  it("nach dem Rueckbaujahr waechst sie nicht weiter", () => {
    // Sie wird nicht groesser, nur weil der Rueckbau sich verzoegert.
    const result = computeProvision(base({ balanceSheetYear: 2050 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.accrualRatio).toBe(1);
    expect(result.warnings.some((w) => w.includes("voll angesammelt"))).toBe(true);
  });
});

describe("Handelsbilanz — § 253 HGB", () => {
  it("rechnet mit dem Erfuellungsbetrag, also MIT Kostensteigerung", () => {
    // § 253 Abs. 1 S. 2 HGB. Das wird bei einer Handrechnung am haeufigsten
    // vergessen: 500.000 EUR bei 2 % ueber 20 Jahre sind rund 743.000 EUR.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.settlementAmountEur).toBeCloseTo(500_000 * Math.pow(1.02, 20), 0);
    expect(result.hgb.settlementAmountEur).toBeGreaterThan(740_000);
  });

  it("zinst mit dem hinterlegten Satz ab", () => {
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    const expected = (500_000 * Math.pow(1.02, 20) * (1 / 3)) / Math.pow(1.018, 20);
    expect(result.hgb.provisionEur).toBeCloseTo(expected, 0);
  });

  it("zinst bei einer Restlaufzeit bis zu einem Jahr NICHT ab", () => {
    // § 253 Abs. 2 S. 1 HGB: nur bei mehr als einem Jahr Restlaufzeit.
    const result = computeProvision(base({ balanceSheetYear: 2045 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.remainingYears).toBe(1);
    expect(result.hgb.provisionEur).toBe(result.hgb.accruedAmountEur);
  });

  it("ohne Abzinsungssatz wird NICHT abgezinst und gewarnt", () => {
    // Ihn zu schaetzen waere eine erfundene Bilanzgroesse. Die Bundesbank
    // veroeffentlicht ihn laufzeitabhaengig.
    const result = computeProvision(base({ hgbDiscountRatePercent: null }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.provisionEur).toBe(result.hgb.accruedAmountEur);
    expect(result.warnings.some((w) => w.includes("NICHT abgezinst"))).toBe(true);
  });
});

describe("Steuerbilanz — § 6 Abs. 1 Nr. 3a EStG", () => {
  it("rechnet OHNE Kostensteigerung", () => {
    // lit. f: Wertverhaeltnisse am Bilanzstichtag.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.tax.settlementAmountEur).toBe(500_000);
  });

  it("zinst fest mit 5,5 Prozent ab", () => {
    // lit. e.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.tax.discountRatePercent).toBe(TAX_DISCOUNT_RATE_PERCENT);
    const expected = (500_000 * (1 / 3)) / Math.pow(1.055, 20);
    expect(result.tax.provisionEur).toBeCloseTo(expected, 0);
  });

  it("der steuerliche Satz aendert sich nicht mit der Eingabe", () => {
    // Er ist gesetzlich fest — ein Eingabefeld dafuer waere falsch.
    const result = computeProvision(base({ hgbDiscountRatePercent: 4 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.tax.discountRatePercent).toBe(5.5);
  });
});

describe("Die Differenz", () => {
  it("wird ausgewiesen und begruendet", () => {
    // Sie ist Grundlage der latenten Steuern und der haeufigste Punkt, an dem
    // eine Handrechnung auseinanderfaellt.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.differenceEur).toBe(
      Math.round((result.hgb.provisionEur - result.tax.provisionEur) * 100) / 100,
    );
    expect(result.warnings.some((w) => w.includes("latente Steuern"))).toBe(true);
  });

  it("die Handelsbilanz liegt hier deutlich hoeher", () => {
    // Hoehere Kosten durch Inflation, geringere Abzinsung durch den
    // niedrigeren Satz — beides wirkt in dieselbe Richtung.
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.provisionEur).toBeGreaterThan(result.tax.provisionEur);
  });
});

describe("Zufuehrung", () => {
  it("ergibt sich aus dem Vorjahresbetrag", () => {
    const result = computeProvision(base({ previousYearHgbEur: 100_000, previousYearTaxEur: 50_000 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.additionEur).toBe(round2(result.hgb.provisionEur - 100_000));
    expect(result.tax.additionEur).toBe(round2(result.tax.provisionEur - 50_000));
  });

  it("ohne Vorjahr bleibt sie null, nicht 0", () => {
    // "Kein Vorjahr" ist etwas anderes als "keine Zufuehrung".
    const result = computeProvision(base());
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.additionEur).toBeNull();
  });

  it("eine Aufloesung wird negativ ausgewiesen", () => {
    const result = computeProvision(base({ previousYearHgbEur: 9_999_999 }));
    if (result.hgb === null) throw new Error(result.reason);
    expect(result.hgb.additionEur).toBeLessThan(0);
  });
});

describe("Kein Ergebnis statt eines falschen", () => {
  it("Rueckbaujahr vor der Inbetriebnahme", () => {
    const result = computeProvision(base({ dismantlingYear: 2010 }));
    expect(result.hgb).toBeNull();
  });

  it("ohne Kostenschaetzung", () => {
    const result = computeProvision(base({ estimatedCostTodayEur: 0 }));
    expect(result.hgb).toBeNull();
    if (result.hgb !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Rückbaukosten");
  });

  it("Bilanzstichtag vor der Inbetriebnahme", () => {
    // Vor der Inbetriebnahme besteht noch keine Verpflichtung.
    const result = computeProvision(base({ balanceSheetYear: 2015 }));
    expect(result.hgb).toBeNull();
  });
});

describe("Rueckbausicherheit", () => {
  const today = new Date("2026-07-31T00:00:00.000Z");

  it("erkennt einen Fehlbetrag", () => {
    const result = checkSecurity({
      requiredSecurityEur: 500_000,
      providedSecurityEur: 400_000,
      securityValidTo: new Date("2030-01-01T00:00:00.000Z"),
      referenceDate: today,
      warnDays: 90,
    });
    expect(result.shortfallEur).toBe(100_000);
    expect(result.problems.some((p) => p.includes("unter der behördlich"))).toBe(true);
  });

  it("erkennt eine abgelaufene Buergschaft", () => {
    // Sie laeuft still ab, weil niemand den Aktenordner liest — das ist der
    // eigentliche Grund fuer diese Funktion.
    const result = checkSecurity({
      requiredSecurityEur: 500_000,
      providedSecurityEur: 500_000,
      securityValidTo: new Date("2026-06-30T00:00:00.000Z"),
      referenceDate: today,
      warnDays: 90,
    });
    expect(result.isExpired).toBe(true);
    expect(result.problems.some((p) => p.includes("Genehmigungsauflage"))).toBe(true);
  });

  it("warnt vor dem Ablauf", () => {
    const result = checkSecurity({
      requiredSecurityEur: 500_000,
      providedSecurityEur: 500_000,
      securityValidTo: new Date("2026-09-15T00:00:00.000Z"),
      referenceDate: today,
      warnDays: 90,
    });
    expect(result.expiresSoon).toBe(true);
    expect(result.isExpired).toBe(false);
  });

  it("eine fehlende Frist gilt nicht als unbefristet", () => {
    // "Nicht erfasst" heisst "ungeprueft".
    const result = checkSecurity({
      requiredSecurityEur: 500_000,
      providedSecurityEur: 500_000,
      securityValidTo: null,
      referenceDate: today,
      warnDays: 90,
    });
    expect(result.problems.some((p) => p.includes("nicht überwacht"))).toBe(true);
  });

  it("meldet nichts, wenn alles stimmt", () => {
    const result = checkSecurity({
      requiredSecurityEur: 500_000,
      providedSecurityEur: 500_000,
      securityValidTo: new Date("2030-01-01T00:00:00.000Z"),
      referenceDate: today,
      warnDays: 90,
    });
    expect(result.problems).toEqual([]);
    expect(result.shortfallEur).toBe(0);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
