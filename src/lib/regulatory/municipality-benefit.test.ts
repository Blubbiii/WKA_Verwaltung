/**
 * Gemeindebeteiligung nach § 6 EEG.
 *
 * Die Rechnung selbst ist eine Multiplikation. Interessant ist, was passiert,
 * wenn etwas fehlt — und dass dann NICHT hochgerechnet wird: der fehlende
 * Anteil einer nicht erfassten Gemeinde darf nicht bei den erfassten landen.
 */

import { describe, it, expect } from "vitest";
import {
  computeMunicipalityBenefit,
  MAX_RATE_CT_PER_KWH,
  type TurbineBenefitInput,
} from "./municipality-benefit";

function turbine(over: Partial<TurbineBenefitInput> = {}): TurbineBenefitInput {
  return {
    turbineId: "t1",
    designation: "WEA 1",
    parkName: "Park A",
    producedKwh: 5_000_000,
    curtailedKwh: 0,
    hadCurtailment: false,
    agreements: [
      {
        municipalityId: "m1",
        municipalityName: "Musterdorf",
        areaShare: 1,
        rateCtPerKwh: 0.2,
      },
    ],
    ...over,
  };
}

describe("Grundrechnung", () => {
  it("0,2 ct/kWh auf 5 GWh ergibt 10.000 EUR", () => {
    const r = computeMunicipalityBenefit([turbine()]);
    expect(r.totalEur).toBe(10_000);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it("verteilt nach dem Anteil der Kreisflaeche", () => {
    // Nicht nach Einwohnerzahl und nicht nach Gemeindeflaeche — die
    // Kreisflaeche ist der gesetzliche Schluessel.
    const r = computeMunicipalityBenefit([
      turbine({
        agreements: [
          { municipalityId: "m1", municipalityName: "Nord", areaShare: 0.7, rateCtPerKwh: 0.2 },
          { municipalityId: "m2", municipalityName: "Sued", areaShare: 0.3, rateCtPerKwh: 0.2 },
        ],
      }),
    ]);
    expect(r.rows.find((x) => x.municipalityName === "Nord")!.amountEur).toBe(7000);
    expect(r.rows.find((x) => x.municipalityName === "Sued")!.amountEur).toBe(3000);
    expect(r.totalEur).toBe(10_000);
    expect(r.warnings).toEqual([]);
  });

  it("die fiktive Menge aus Abregelung zaehlt mit", () => {
    // § 6 Abs. 1 EEG: eine abgeregelte Anlage soll die Gemeinde nicht
    // schlechter stellen als eine laufende.
    const r = computeMunicipalityBenefit([
      turbine({ producedKwh: 4_000_000, curtailedKwh: 1_000_000, hadCurtailment: true }),
    ]);
    expect(r.totalEur).toBe(10_000);
    expect(r.warnings).toEqual([]);
  });

  it("summiert ueber mehrere Anlagen je Gemeinde", () => {
    const r = computeMunicipalityBenefit([
      turbine({ turbineId: "a", designation: "WEA 1" }),
      turbine({ turbineId: "b", designation: "WEA 2" }),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].turbines).toHaveLength(2);
    expect(r.totalEur).toBe(20_000);
  });
});

describe("Was fehlt, wird nicht ersetzt", () => {
  it("ohne Einspeisemenge wird nicht abgerechnet — statt 0 EUR auszuweisen", () => {
    const r = computeMunicipalityBenefit([turbine({ producedKwh: null })]);
    expect(r.rows).toEqual([]);
    expect(r.totalEur).toBe(0);
    expect(r.warnings.join(" ")).toContain("NICHT abgerechnet");
    expect(r.warnings.join(" ")).toContain("WEA 1");
  });

  it("unbewertete Abregelung macht die Zahlung zu niedrig — und sagt es", () => {
    const r = computeMunicipalityBenefit([
      turbine({ producedKwh: 4_000_000, curtailedKwh: null, hadCurtailment: true }),
    ]);
    expect(r.totalEur).toBe(8000); // nur die eingespeiste Menge
    expect(r.warnings.join(" ")).toContain("ZU NIEDRIG");
  });

  it("keine Abregelung ist kein fehlender Wert", () => {
    const r = computeMunicipalityBenefit([
      turbine({ curtailedKwh: null, hadCurtailment: false }),
    ]);
    expect(r.totalEur).toBe(10_000);
    expect(r.warnings).toEqual([]);
  });

  it("unvollstaendige Flaechenanteile werden NICHT hochgerechnet", () => {
    // Der Kern des Ganzen: die fehlenden 30 % gehoeren einer nicht erfassten
    // Gemeinde. Sie auf die erfasste zu legen waere eine Fehlzahlung.
    const r = computeMunicipalityBenefit([
      turbine({
        agreements: [
          { municipalityId: "m1", municipalityName: "Nord", areaShare: 0.7, rateCtPerKwh: 0.2 },
        ],
      }),
    ]);
    expect(r.totalEur).toBe(7000);
    expect(r.warnings.join(" ")).toContain("NICHT hochgerechnet");
    expect(r.warnings.join(" ")).toContain("70,00 %");
  });

  it("ein Satz ueber dem Hoechstsatz faellt auf", () => {
    const r = computeMunicipalityBenefit([
      turbine({
        agreements: [
          {
            municipalityId: "m1",
            municipalityName: "Nord",
            areaShare: 1,
            rateCtPerKwh: 0.3,
          },
        ],
      }),
    ]);
    expect(r.warnings.join(" ")).toContain("Höchstsatz");
    expect(MAX_RATE_CT_PER_KWH).toBe(0.2);
  });

  it("Rundungsreste in den Anteilen loesen keine Warnung aus", () => {
    // Drei Gemeinden zu je 33,33 % — bei vier Nachkommastellen erfasst.
    const r = computeMunicipalityBenefit([
      turbine({
        agreements: [
          { municipalityId: "m1", municipalityName: "A", areaShare: 0.3333, rateCtPerKwh: 0.2 },
          { municipalityId: "m2", municipalityName: "B", areaShare: 0.3333, rateCtPerKwh: 0.2 },
          { municipalityId: "m3", municipalityName: "C", areaShare: 0.3334, rateCtPerKwh: 0.2 },
        ],
      }),
    ]);
    expect(r.warnings).toEqual([]);
    expect(r.totalEur).toBe(10_000);
  });
});
