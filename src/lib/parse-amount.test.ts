/**
 * Bedienaufwand #17: Betragseingaben.
 *
 * Die Tests halten vor allem die Mehrdeutigkeitsregeln fest. Sie sind eine
 * Entscheidung, keine Naturkonstante — wer sie ändert, muss diese Datei
 * anfassen und sieht dabei, was er umdreht.
 */

import { describe, it, expect } from "vitest";
import { parseAmount, parseAmountOr, formatAmountForInput } from "./parse-amount";

describe("parseAmount — deutsche Schreibweise", () => {
  it("liest Komma als Dezimaltrennzeichen", () => {
    expect(parseAmount("1234,56")).toBe(1234.56);
    expect(parseAmount("0,01")).toBe(0.01);
    expect(parseAmount("12,5")).toBe(12.5);
  });

  it("liest Punkt und Komma zusammen richtig", () => {
    // Genau der Fall, der heute still zu 0 wird — bzw. im Buchungsdialog zu
    // 1.234 statt 1234,56.
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
    expect(parseAmount("12.345,00")).toBe(12345);
  });

  it("liest reine Tausendergruppen als Tausender", () => {
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("12.345.678")).toBe(12345678);
  });
});

describe("parseAmount — englische Schreibweise", () => {
  it("liest das rechteste Trennzeichen als Dezimaltrennzeichen", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
  });

  it("liest einen einzelnen Punkt als Dezimalpunkt", () => {
    // "1.5" und "1.50" sind keine Dreiergruppen — also Dezimalpunkt.
    expect(parseAmount("1.5")).toBe(1.5);
    expect(parseAmount("1.50")).toBe(1.5);
    expect(parseAmount("0.99")).toBe(0.99);
    expect(parseAmount("1234.5678")).toBe(1234.5678);
  });

  it("liest reine Kommagruppen als Tausender", () => {
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("12,345,678")).toBe(12345678);
  });
});

describe("parseAmount — die bewusst getroffene Entscheidung", () => {
  it('"1.500" wird als 1500 gelesen, nicht als 1,5', () => {
    // Deutsche Lesart gewinnt: eine saubere Dreiergruppe nach einem Punkt ist
    // in diesem Programm ein Tausendertrennzeichen. Wer 1,5 meint, tippt
    // "1,5". Der Preis ist eine aus einer englischen Quelle kopierte Zahl —
    // die seltenere Eingabe, und anders als bisher ist das Ergebnis
    // wenigstens vorhersagbar statt still 0.
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1,5")).toBe(1.5);
  });

  it('"1.50" bleibt 1,50 — keine Dreiergruppe', () => {
    expect(parseAmount("1.50")).toBe(1.5);
  });
});

describe("parseAmount — Vorzeichen und Beiwerk", () => {
  it("erkennt Minus", () => {
    expect(parseAmount("-1.234,56")).toBe(-1234.56);
    expect(parseAmount("-0,01")).toBe(-0.01);
  });

  it("erkennt die buchhalterische Klammernotation", () => {
    expect(parseAmount("(1.234,56)")).toBe(-1234.56);
    expect(parseAmount("(0,50)")).toBe(-0.5);
  });

  it("ignoriert Waehrungszeichen und Leerraum", () => {
    expect(parseAmount("1.234,56 €")).toBe(1234.56);
    expect(parseAmount("  42,00  ")).toBe(42);
    // Geschuetztes Leerzeichen, wie es aus Excel und Word kommt.
    expect(parseAmount("1 234,56")).toBe(1234.56);
  });
});

describe("parseAmount — was NICHT durchgeht", () => {
  it("leere Eingabe ergibt null, nicht 0", () => {
    // Der Kern des Befunds: eine unlesbare Eingabe darf nicht als 0 gebucht
    // werden. Der Aufrufer muss entscheiden.
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it("Text ergibt null", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount(",")).toBeNull();
  });

  it("halb gelesene Zahlen ergeben null statt eines Teilwerts", () => {
    // parseFloat liest hier 12 bzw. 1.2 — genau die Art stiller Fehlmessung,
    // um die es geht.
    expect(parseAmount("12abc")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("1,2,3")).toBeNull();
  });

  it("Unendlich und NaN ergeben null", () => {
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
    expect(parseAmount("Infinity")).toBeNull();
  });
});

describe("parseAmount — Zahlen gehen unveraendert durch", () => {
  it("nimmt eine Zahl direkt an", () => {
    expect(parseAmount(1234.56)).toBe(1234.56);
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount(-5)).toBe(-5);
  });
});

describe("parseAmountOr", () => {
  it("faellt auf den Vorgabewert zurueck", () => {
    expect(parseAmountOr("", 0)).toBe(0);
    expect(parseAmountOr("abc", 0)).toBe(0);
    expect(parseAmountOr("1.234,56", 0)).toBe(1234.56);
  });

  it("behandelt eine gelesene 0 nicht als Fehlschlag", () => {
    expect(parseAmountOr("0", 99)).toBe(0);
    expect(parseAmountOr("0,00", 99)).toBe(0);
  });
});

describe("formatAmountForInput", () => {
  it("schreibt mit Komma und ohne Tausenderpunkte", () => {
    // Tausenderpunkte waehrend der Eingabe verschieben den Cursor.
    expect(formatAmountForInput(1234.5)).toBe("1234,50");
    expect(formatAmountForInput(0)).toBe("0,00");
    expect(formatAmountForInput(-12.3)).toBe("-12,30");
  });

  it("leerer Wert bleibt leer", () => {
    expect(formatAmountForInput(null)).toBe("");
    expect(formatAmountForInput(undefined)).toBe("");
  });

  it("laesst sich zurueckuebersetzen", () => {
    for (const value of [0, 0.01, 1234.56, -99.9, 1000000]) {
      expect(parseAmount(formatAmountForInput(value))).toBe(value);
    }
  });
});
