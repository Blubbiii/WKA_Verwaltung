/**
 * Die Prüfung, die den Fehler unmöglich macht statt ihn nur zu beheben.
 *
 * Der erste Test ist der eigentliche: die Beispieldatei, die die Oberfläche
 * anbietet, muss die Pflichtfelder desselben Assistenten abdecken. Wer künftig
 * ein Pflichtfeld ergänzt und die Kopfzeile vergisst — oder umgekehrt —,
 * bekommt hier einen roten Test statt eines Nutzers, der in Schritt 2
 * feststeckt.
 */

import { describe, it, expect } from "vitest";
import {
  autoDetectGridMapping,
  GRID_REQUIRED_FIELDS,
  GRID_SAMPLE_HEADER,
  REMUNERATION_CODES,
} from "./grid-import-mapping";

describe("Beispieldatei und Assistent passen zusammen", () => {
  it("deckt jedes Pflichtfeld ab", () => {
    const mapping = autoDetectGridMapping(GRID_SAMPLE_HEADER.split(";"));

    const fehlend = GRID_REQUIRED_FIELDS.filter((feld) => !mapping[feld]);

    expect(
      fehlend,
      `Der Beispieldatei fehlen Spalten fuer: ${fehlend.join(", ")}. ` +
        `Wer sie herunterlaedt und wieder hochlaedt, kommt in Schritt 2 des ` +
        `Assistenten nicht weiter — und hat keinen Grund, den Fehler bei sich ` +
        `zu suchen. Genau so ist "Verguetungsart" einmal untergegangen.`,
    ).toEqual([]);
  });

  it("ordnet die Verguetungsart der richtigen Spalte zu", () => {
    // Die Gegenprobe zum Test darueber: „abgedeckt" darf nicht heissen, dass
    // irgendeine Spalte zufaellig getroffen hat.
    const mapping = autoDetectGridMapping(GRID_SAMPLE_HEADER.split(";"));
    expect(mapping.remunerationType).toBe("Vergütungsart");
    expect(mapping.production).toBe("Produktion_kWh");
    expect(mapping.year).toBe("Jahr");
    expect(mapping.month).toBe("Monat");
  });

  it("trennt Anlagennummer und Anlagenbezeichnung", () => {
    // Die Reihenfolge der Abfragen entscheidet das: "WKA-Nr" enthaelt "wka"
    // und muss trotzdem vor der Bezeichnung greifen.
    const mapping = autoDetectGridMapping(GRID_SAMPLE_HEADER.split(";"));
    expect(mapping.turbineId).toBe("WKA-Nr");
    expect(mapping.turbineName).toBe("Anlage");
  });

  it("laesst nicht zugeordnete Spalten in Ruhe", () => {
    // Betriebsstunden, Verfuegbarkeit und Bemerkungen kennt dieser Assistent
    // nicht. Wuerde eine davon versehentlich auf ein Pflichtfeld fallen,
    // liefe der Import mit falschen Werten durch — schlimmer als ein Abbruch.
    const mapping = autoDetectGridMapping(GRID_SAMPLE_HEADER.split(";"));
    const zugeordnet = Object.values(mapping).filter(Boolean);
    expect(zugeordnet).not.toContain("Betriebsstunden");
    expect(zugeordnet).not.toContain("Verfügbarkeit_Pct");
    expect(zugeordnet).not.toContain("Bemerkungen");
  });

  it("der Beispielwert ist einer, den der Assistent annimmt", () => {
    // Ein Wert ausserhalb dieser Liste wuerde den Fehlschlag nur von der
    // Zuordnung in die Validierung verschieben.
    expect(REMUNERATION_CODES).toContain("EEG");
  });
});

describe("autoDetectGridMapping", () => {
  it("erkennt englische Kopfzeilen", () => {
    const mapping = autoDetectGridMapping([
      "Turbine ID",
      "Year",
      "Month",
      "Type",
      "Production kWh",
      "Revenue EUR",
    ]);
    expect(mapping.year).toBe("Year");
    expect(mapping.month).toBe("Month");
    expect(mapping.remunerationType).toBe("Type");
    expect(mapping.production).toBe("Production kWh");
    expect(mapping.revenue).toBe("Revenue EUR");
  });

  it("laesst Felder leer, fuer die es keine Spalte gibt", () => {
    // Wichtig fuer die Aussagekraft des ersten Tests: die Erkennung darf
    // nicht raten. Ein geratenes Feld waere schlimmer als ein leeres.
    const mapping = autoDetectGridMapping(["Jahr", "Monat"]);
    expect(mapping.remunerationType).toBeNull();
    expect(mapping.production).toBeNull();
  });
});
