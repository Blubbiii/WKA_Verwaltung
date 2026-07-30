/**
 * A1: Ertragsausfall einer Störung.
 *
 * Diese Zahl landet in einer Forderung gegen den Hersteller. Sie muss
 * nachrechenbar sein, und sie darf im Zweifel nicht erfunden werden — beides
 * halten diese Tests fest.
 */

import { describe, it, expect } from "vitest";
import {
  computeLostEnergy,
  valuateLostEnergy,
  type TurbineSeries,
  type PowerSample,
} from "./lost-energy";

/** n Intervalle mit konstanter Leistung. */
function constantSeries(
  turbineId: string,
  ratedPowerKw: number,
  powerW: number | null,
  count: number,
): TurbineSeries {
  const samples: PowerSample[] = Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(2026, 0, 1, 0, i * 10),
    powerW,
  }));
  return { turbineId, ratedPowerKw, samples };
}

describe("Referenzanlagen-Verfahren", () => {
  it("rechnet den Ausfall aus dem Parkmittel hoch", () => {
    // Gestörte Anlage: 6 Intervalle à 10 min = 1 h, Leistung 0 → 0 kWh.
    // Referenz: gleiche Nennleistung, 2000 kW über 1 h → 2000 kWh.
    // Erwartung für die gestörte Anlage also 2000 kWh, Ausfall 2000 kWh.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    expect(result.method).toBe("REFERENCE_TURBINE");
    if (result.method === null) throw new Error("unerwartet");
    expect(result.actualKwh).toBe(0);
    expect(result.expectedKwh).toBe(2000);
    expect(result.lostKwh).toBe(2000);
  });

  it("normiert auf die Nennleistung", () => {
    // Referenz hat 1000 kW und liefert 1000 kWh in der Stunde
    // → 1 kWh je kW. Die gestörte Anlage hat 3000 kW → Erwartung 3000 kWh.
    const result = computeLostEnergy({
      affected: constantSeries("A", 3000, 0, 6),
      references: [constantSeries("B", 1000, 1_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.expectedKwh).toBe(3000);
  });

  it("mittelt ueber die Referenzen, nicht ueber die Summe", () => {
    // Sonst bestimmte die groesste Anlage das Ergebnis fast allein.
    // Referenz B: 1000 kW, 1000 kWh/h → 1,0 kWh je kW
    // Referenz C: 3000 kW, 1500 kWh/h → 0,5 kWh je kW
    // Mittel der spezifischen Ertraege = 0,75 → bei 2000 kW: 1500 kWh.
    // Summenrechnung ergaebe (1000+1500)/(1000+3000) = 0,625 → 1250 kWh.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [
        constantSeries("B", 1000, 1_000_000, 6),
        constantSeries("C", 3000, 1_500_000, 6),
      ],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.expectedKwh).toBe(1500);
  });

  it("zieht die Restproduktion der gestoerten Anlage ab", () => {
    // Teilstoerung: die Anlage lief mit halber Leistung.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 1_000_000, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.actualKwh).toBe(1000);
    expect(result.lostKwh).toBe(1000);
  });

  it("nennt die verwendeten Referenzen", () => {
    // Ohne sie ist die Zahl gegenueber dem Hersteller nicht belegbar.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [
        constantSeries("B", 2000, 2_000_000, 6),
        constantSeries("C", 2000, 2_000_000, 6),
      ],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.referenceTurbineIds).toEqual(["B", "C"]);
    expect(result.intervalCount).toBe(6);
  });
});

describe("Was NICHT gerechnet wird", () => {
  it("ohne Referenz kommt null zurueck, keine Zahl", () => {
    // Ein erfundener Ausfall in einer Forderung ist schlimmer als gar keiner.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [],
      intervalMinutes: 10,
    });

    expect(result.method).toBeNull();
    if (result.method !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Keine verwendbare Referenzanlage");
  });

  it("ohne Nennleistung der gestoerten Anlage kommt null zurueck", () => {
    const result = computeLostEnergy({
      affected: constantSeries("A", 0, 0, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    expect(result.method).toBeNull();
    if (result.method !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Nennleistung");
  });

  it("zu wenige Messwerte ergeben null", () => {
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 2),
      references: [constantSeries("B", 2000, 2_000_000, 2)],
      intervalMinutes: 10,
    });

    expect(result.method).toBeNull();
    if (result.method !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Zu wenige Messwerte");
  });

  it("eine Referenz mit zu wenig Abdeckung wird verworfen, nicht gemittelt", () => {
    // Drei Messwerte in einem Ausfall von zwei Tagen verzerren den Mittelwert.
    const sparse = constantSeries("B", 2000, 2_000_000, 12);
    for (let i = 3; i < 12; i++) sparse.samples[i].powerW = null;

    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 12),
      references: [sparse],
      intervalMinutes: 10,
    });

    expect(result.method).toBeNull();
    if (result.method !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("Keine verwendbare Referenzanlage");
  });

  it("eine Referenz ohne Nennleistung wird verworfen und gemeldet", () => {
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [
        constantSeries("B", 0, 2_000_000, 6),
        constantSeries("C", 2000, 2_000_000, 6),
      ],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.referenceTurbineIds).toEqual(["C"]);
    expect(result.warnings.some((w) => w.includes("B"))).toBe(true);
  });
});

describe("Randfaelle, die still falsch waeren", () => {
  it("ein negativer Ausfall wird zu 0 und als Hinweis vermerkt", () => {
    // Die gestoerte Anlage lief besser als der Park — eine negative Forderung
    // waere Unsinn, aber stillschweigend zu runden verbirgt den Befund.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 2_000_000, 6),
      references: [constantSeries("B", 2000, 1_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.lostKwh).toBe(0);
    expect(result.warnings.some((w) => w.includes("über dem Parkmittel"))).toBe(true);
  });

  it("eine einzelne Referenz wird als unsicher gekennzeichnet", () => {
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.warnings.some((w) => w.includes("Nur eine Referenzanlage"))).toBe(true);
  });

  it("fehlende Messwerte der gestoerten Anlage zaehlen als kein Ertrag", () => {
    // Eine stehende Anlage liefert keine Messung — das IST der Ausfall und
    // darf nicht als "unbekannt, also uebersprungen" durchrutschen.
    const affected = constantSeries("A", 2000, 0, 6);
    affected.samples[0].powerW = null;
    affected.samples[1].powerW = null;
    affected.samples[2].powerW = null;

    const result = computeLostEnergy({
      affected,
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.actualKwh).toBe(0);
    expect(result.lostKwh).toBe(2000);
  });

  it("negative Leistung mindert den Ertrag", () => {
    // Eigenverbrauch im Stillstand ist real.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, -30_000, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 10,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.actualKwh).toBe(-30);
    expect(result.lostKwh).toBe(2030);
  });

  it("eine andere Intervalllaenge wird beruecksichtigt", () => {
    // 6 Intervalle a 5 min = 30 min → halbe Energie.
    const result = computeLostEnergy({
      affected: constantSeries("A", 2000, 0, 6),
      references: [constantSeries("B", 2000, 2_000_000, 6)],
      intervalMinutes: 5,
    });

    if (result.method === null) throw new Error("unerwartet");
    expect(result.expectedKwh).toBe(1000);
  });
});

describe("Bewertung in Euro", () => {
  it("multipliziert Menge mit Satz und rundet auf Cent", () => {
    expect(valuateLostEnergy(2000, 0.0921)).toBe(184.2);
    expect(valuateLostEnergy(1234.567, 0.0821)).toBe(101.36);
  });

  it("ein Ausfall von 0 ist 0 Euro", () => {
    expect(valuateLostEnergy(0, 0.09)).toBe(0);
  });

  it("die Bewertung ist von der Mengenfeststellung getrennt", () => {
    // Aendert sich der Satz, aendert sich nicht die technische Feststellung.
    const lostKwh = 1000;
    expect(valuateLostEnergy(lostKwh, 0.08)).toBe(80);
    expect(valuateLostEnergy(lostKwh, 0.12)).toBe(120);
  });
});
