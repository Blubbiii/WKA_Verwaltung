/**
 * Leistung je Gemeinde — Grundlage der Zerlegung nach § 29 GewStG.
 *
 * Der entscheidende Punkt dieser Auswertung ist nicht die Summe, sondern der
 * Umgang mit dem, was fehlt. Eine Anlage ohne Standortgemeinde einfach
 * wegzulassen ergäbe eine Verteilung, die auf 100 % aufgeht und trotzdem
 * falsch ist — die Anteile der übrigen Gemeinden wären zu hoch, und das Blatt
 * ginge als Zerlegungsgrundlage zum Finanzamt.
 */

import { describe, it, expect } from "vitest";
import {
  capacityByMunicipality,
  wasOperatingInYear,
  type TurbineForSplit,
} from "./capacity-by-municipality";

function turbine(over: Partial<TurbineForSplit> = {}): TurbineForSplit {
  return {
    id: "t1",
    designation: "WEA 1",
    parkName: "Park A",
    ratedPowerKw: 3000,
    municipalityId: "m1",
    municipalityName: "Musterdorf",
    officialKey: "03456001",
    commissioningDate: new Date("2015-06-01"),
    isActive: true,
    ...over,
  };
}

describe("Verteilung auf die Standortgemeinden", () => {
  it("summiert je Gemeinde und weist die Anteile aus", () => {
    const result = capacityByMunicipality(
      [
        turbine({ id: "a", municipalityId: "m1", municipalityName: "Nord", ratedPowerKw: 3000 }),
        turbine({ id: "b", municipalityId: "m1", municipalityName: "Nord", ratedPowerKw: 3000 }),
        turbine({ id: "c", municipalityId: "m2", municipalityName: "Sued", ratedPowerKw: 2000 }),
      ],
      2025,
    );

    expect(result.assignedRatedPowerKw).toBe(8000);
    expect(result.rows).toHaveLength(2);
    // Absteigend nach Leistung — die groesste Gemeinde zuerst.
    expect(result.rows[0].municipalityName).toBe("Nord");
    expect(result.rows[0].turbineCount).toBe(2);
    expect(result.rows[0].shareOfAssigned).toBeCloseTo(0.75, 10);
    expect(result.rows[1].shareOfAssigned).toBeCloseTo(0.25, 10);
    expect(result.warnings).toEqual([]);
  });

  it("ein Park in zwei Gemeinden wird getrennt ausgewiesen", () => {
    // Genau der Fall, wegen dem § 29 GewStG die Zerlegung ueberhaupt vorsieht —
    // und der Grund, warum die Gemeinde an der ANLAGE haengt und nicht am Park.
    const result = capacityByMunicipality(
      [
        turbine({ id: "a", parkName: "Park A", municipalityId: "m1", municipalityName: "Nord" }),
        turbine({ id: "b", parkName: "Park A", municipalityId: "m2", municipalityName: "Sued" }),
      ],
      2025,
    );
    expect(result.rows.map((r) => r.municipalityName).sort()).toEqual(["Nord", "Sued"]);
  });
});

describe("Was fehlt, wird ausgewiesen statt uebergangen", () => {
  it("eine Anlage ohne Gemeinde macht die Anteile unbrauchbar — und sagt es", () => {
    const result = capacityByMunicipality(
      [
        turbine({ id: "a", municipalityId: "m1", municipalityName: "Nord", ratedPowerKw: 3000 }),
        turbine({ id: "b", municipalityId: null, municipalityName: null, ratedPowerKw: 3000 }),
      ],
      2025,
    );

    // Der Anteil von Nord ist rechnerisch 100 % — aber nur, weil die Haelfte
    // der Leistung nirgends zugeordnet ist.
    expect(result.rows[0].shareOfAssigned).toBe(1);
    expect(result.withoutMunicipality).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("ZU HOCH");
    expect(result.warnings.join(" ")).toContain("WEA 1");
  });

  it("eine Anlage ohne Nennleistung zaehlt mit 0 kW und wird benannt", () => {
    const result = capacityByMunicipality(
      [
        turbine({ id: "a", ratedPowerKw: 3000 }),
        turbine({ id: "b", designation: "WEA 2", ratedPowerKw: null }),
      ],
      2025,
    );
    expect(result.assignedRatedPowerKw).toBe(3000);
    expect(result.rows[0].turbineCount).toBe(2);
    expect(result.withoutRatedPower).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("WEA 2");
  });

  it("kein Datenbestand ist kein Ergebnis von null", () => {
    const result = capacityByMunicipality(
      [turbine({ municipalityId: null, municipalityName: null })],
      2025,
    );
    expect(result.rows).toEqual([]);
    expect(result.warnings.join(" ")).toContain("fehlender Datenbestand");
  });

  it("eine stillgelegte Anlage ohne Datum bleibt drin — mit Hinweis", () => {
    // Ein Stilllegungsdatum fuehrt das Datenmodell nicht. Sie wegzulassen
    // waere eine Annahme ueber den Zeitpunkt.
    const result = capacityByMunicipality(
      [turbine({ id: "a", designation: "WEA alt", isActive: false })],
      2020,
    );
    expect(result.rows[0].turbineCount).toBe(1);
    expect(result.inactiveWithoutDate).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("Stilllegungsdatum");
  });
});

describe("Zeitliche Abgrenzung", () => {
  it("eine spaeter errichtete Anlage zaehlt nicht", () => {
    expect(
      wasOperatingInYear(turbine({ commissioningDate: new Date("2026-03-01") }), 2025),
    ).toBe(false);
  });

  it("eine im Dezember errichtete Anlage begruendet die Betriebsstaette", () => {
    expect(
      wasOperatingInYear(turbine({ commissioningDate: new Date("2025-12-20") }), 2025),
    ).toBe(true);
  });

  it("ohne Inbetriebnahmedatum wird nichts ausgeschlossen", () => {
    // Ausschliessen hiesse annehmen. Die Anlage bleibt drin und faellt
    // stattdessen ueber die uebrigen Pruefungen auf.
    expect(wasOperatingInYear(turbine({ commissioningDate: null }), 2000)).toBe(true);
  });
});
