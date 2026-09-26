import { describe, expect, it } from "vitest";
import { leseSmardCsv } from "./smard-csv";

const KOPF_VIERTEL =
  "Datum von;Datum bis;Deutschland/Luxemburg [€/MWh] Originalauflösungen;Belgien [€/MWh] Originalauflösungen";

describe("SMARD-Großhandelspreise einlesen", () => {
  it("Viertelstunden werden je Stunde gemittelt, Ortszeit wird UTC", () => {
    const csv = [
      KOPF_VIERTEL,
      "01.09.2026 00:00;01.09.2026 00:15;10,00;99,00",
      "01.09.2026 00:15;01.09.2026 00:30;20,00;99,00",
      "01.09.2026 00:30;01.09.2026 00:45;-30,00;99,00",
      "01.09.2026 00:45;01.09.2026 01:00;40,00;99,00",
      "01.09.2026 01:00;01.09.2026 01:15;-1.234,50;99,00",
    ].join("\n");
    const ergebnis = leseSmardCsv(csv);
    expect(ergebnis.viertelstunden).toBe(true);
    expect(ergebnis.preise).toEqual([
      // 00:00 CEST = 22:00 UTC the day before; mean of 10, 20, -30, 40
      { hour: "2026-08-31T22:00:00.000Z", priceEurMwh: 10 },
      { hour: "2026-08-31T23:00:00.000Z", priceEurMwh: -1234.5 },
    ]);
  });

  it("das alte Stundenformat mit getrenntem Datum und Anfang", () => {
    const csv = [
      "Datum;Anfang;Ende;Deutschland/Luxemburg [€/MWh] Originalauflösungen",
      "15.01.2024;00:00;01:00;39,01",
      "15.01.2024;01:00;02:00;-",
    ].join("\n");
    const ergebnis = leseSmardCsv(csv);
    expect(ergebnis.viertelstunden).toBe(false);
    // CET = UTC+1; "-" is a gap, not zero.
    expect(ergebnis.preise).toEqual([{ hour: "2024-01-14T23:00:00.000Z", priceEurMwh: 39.01 }]);
    expect(ergebnis.luecken).toBe(1);
  });

  it("die doppelte Stunde bei der Umstellung auf Winterzeit bleibt zwei Stunden", () => {
    const csv = [
      "Datum;Anfang;Ende;Deutschland/Luxemburg [€/MWh] Originalauflösungen",
      "25.10.2026;02:00;03:00;5,00",
      "25.10.2026;02:00;03:00;-7,00",
      "25.10.2026;03:00;04:00;8,00",
    ].join("\n");
    expect(leseSmardCsv(csv).preise.map((p) => p.hour)).toEqual([
      "2026-10-25T00:00:00.000Z", // 02:00 CEST
      "2026-10-25T01:00:00.000Z", // 02:00 CET
      "2026-10-25T02:00:00.000Z", // 03:00 CET
    ]);
  });

  it("ohne Spalte für Deutschland/Luxemburg ein verständlicher Fehler", () => {
    expect(() => leseSmardCsv("Datum;Anfang;Ende;Frankreich [€/MWh]\n01.01.2024;00:00;01:00;1,0")).toThrow(
      /Deutschland\/Luxemburg/,
    );
  });
});
