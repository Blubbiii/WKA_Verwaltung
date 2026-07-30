/**
 * Bedienaufwand #22: CSV lesen.
 *
 * Die Fälle hier sind keine Theorie — sie sind das, was Excel und Outlook
 * tatsächlich exportieren.
 */

import { describe, it, expect } from "vitest";
import { parseCsv, detectDelimiter, autoDetectMapping } from "./csv";

describe("detectDelimiter", () => {
  it("erkennt Semikolon (deutsches Excel)", () => {
    expect(detectDelimiter("Name;Ort;PLZ\nMeier;Kiel;24103")).toBe(";");
  });

  it("erkennt Komma (englisches Excel)", () => {
    expect(detectDelimiter("Name,City,Zip\nMeier,Kiel,24103")).toBe(",");
  });

  it("erkennt Tabulator", () => {
    expect(detectDelimiter("Name\tOrt\tPLZ")).toBe("\t");
  });

  it("laesst sich von einem Trennzeichen IM Spaltennamen nicht taeuschen", () => {
    // Ein reines includes(";") — wie im Energie-Import — waehlt hier
    // faelschlich das Semikolon und zerlegt die Datei falsch.
    expect(detectDelimiter('"Name; Vorname",Ort,PLZ')).toBe(",");
  });

  it("schaut nur auf die Kopfzeile, nicht auf die Daten", () => {
    expect(detectDelimiter('Name,Notiz\nMeier,"a;b;c;d;e"')).toBe(",");
  });
});

describe("parseCsv — Grundfaelle", () => {
  it("liest Kopfzeile und Datensaetze", () => {
    const result = parseCsv("Name;Ort\nMeier;Kiel\nSchulz;Rendsburg");
    expect(result.headers).toEqual(["Name", "Ort"]);
    expect(result.rows).toEqual([
      { Name: "Meier", Ort: "Kiel" },
      { Name: "Schulz", Ort: "Rendsburg" },
    ]);
  });

  it("kommt mit CRLF zurecht", () => {
    const result = parseCsv("Name;Ort\r\nMeier;Kiel\r\n");
    expect(result.rows).toEqual([{ Name: "Meier", Ort: "Kiel" }]);
  });

  it("verwirft leere Zeilen", () => {
    const result = parseCsv("Name;Ort\nMeier;Kiel\n\n;\nSchulz;Kiel\n");
    expect(result.rows).toHaveLength(2);
  });

  it("eine leere Datei ergibt nichts, nicht einen leeren Datensatz", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv("   \n  ").rows).toEqual([]);
  });
});

describe("parseCsv — was Excel wirklich schreibt", () => {
  it("entfernt das BOM", () => {
    // Ohne das heisst die erste Spalte "﻿Name" und keine Zuordnung greift.
    const result = parseCsv("﻿Name;Ort\nMeier;Kiel");
    expect(result.headers[0]).toBe("Name");
    expect(result.rows[0].Name).toBe("Meier");
  });

  it("liest Trennzeichen innerhalb von Anfuehrungszeichen als Text", () => {
    const result = parseCsv('Name;Adresse\nMeier;"Am Hang 12; 24103 Kiel"');
    expect(result.rows[0].Adresse).toBe("Am Hang 12; 24103 Kiel");
  });

  it("liest verdoppelte Anfuehrungszeichen als eines", () => {
    const result = parseCsv('Name;Notiz\nMeier;"sagt ""hallo"""');
    expect(result.rows[0].Notiz).toBe('sagt "hallo"');
  });

  it("haelt Zeilenumbrueche innerhalb eines Feldes zusammen", () => {
    // Eine zeilenweise Vorzerlegung — wie im Energie-Import — zerreisst diesen
    // Datensatz in zwei kaputte.
    const result = parseCsv('Name;Adresse\nMeier;"Am Hang 12\n24103 Kiel"');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].Adresse).toBe("Am Hang 12\n24103 Kiel");
  });

  it("fuellt fehlende Spalten am Zeilenende mit Leerstring", () => {
    const result = parseCsv("Name;Ort;PLZ\nMeier;Kiel");
    expect(result.rows[0]).toEqual({ Name: "Meier", Ort: "Kiel", PLZ: "" });
  });

  it("macht doppelte Spaltennamen unterscheidbar", () => {
    // Sonst ueberschreibt die zweite Spalte stillschweigend die erste.
    const result = parseCsv("Name;Name;Ort\na;b;Kiel");
    expect(result.headers).toEqual(["Name", "Name_2", "Ort"]);
    expect(result.rows[0]).toEqual({ Name: "a", Name_2: "b", Ort: "Kiel" });
  });

  it("eine namenlose Spalte bekommt einen Platzhalter", () => {
    const result = parseCsv("Name;;Ort\na;b;Kiel");
    expect(result.headers).toEqual(["Name", "Spalte", "Ort"]);
  });
});

describe("autoDetectMapping", () => {
  const ALIASES = {
    lastName: ["Nachname", "Name", "Last Name"],
    postalCode: ["PLZ", "Postleitzahl", "Zip"],
    city: ["Ort", "Stadt", "City"],
  } as const;

  it("findet die uebliche Schreibweise", () => {
    const mapping = autoDetectMapping(["Nachname", "PLZ", "Ort"], ALIASES);
    expect(mapping).toEqual({ lastName: "Nachname", postalCode: "PLZ", city: "Ort" });
  });

  it("ignoriert Gross-/Kleinschreibung, Leerraum und Bindestriche", () => {
    const mapping = autoDetectMapping(["postleit-zahl", " STADT "], ALIASES);
    expect(mapping.postalCode).toBe("postleit-zahl");
    expect(mapping.city).toBe(" STADT ");
  });

  it("nimmt den ersten passenden Aliasnamen", () => {
    // "Nachname" steht vor "Name" in der Liste — beides vorhanden, das
    // eindeutigere gewinnt.
    const mapping = autoDetectMapping(["Name", "Nachname"], ALIASES);
    expect(mapping.lastName).toBe("Nachname");
  });

  it("laesst Felder ohne Treffer weg statt zu raten", () => {
    const mapping = autoDetectMapping(["Spalte A", "Spalte B"], ALIASES);
    expect(mapping).toEqual({});
  });
});
