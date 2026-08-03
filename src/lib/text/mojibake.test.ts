import { describe, expect, it } from "vitest";
import {
  istFalschDekodiert,
  repariereZeichensatz,
  repariereZeile,
} from "./mojibake";

/**
 * Erzeugt aus richtigem Text die falsch dekodierte Fassung.
 *
 * Genau so entsteht der Fehler: eine Datei liegt in UTF-8 vor, wird aber als
 * Latin-1 gelesen — jedes Byte wird einzeln zu einem Zeichen. Aus den zwei
 * Bytes eines `ß` werden zwei sichtbare Zeichen.
 *
 * ## Warum das hier steht und nicht als Zeichenkette im Test
 *
 * Der erste Anlauf schrieb die verfälschten Texte wörtlich hin. Sie haben es
 * nicht bis in die Datei geschafft: Editor und Werkzeugkette haben sie beim
 * Speichern wieder eingerenkt, und der Test verglich zweimal denselben
 * richtigen Text — sah aus wie ein Fehler in der Funktion, war aber einer in
 * der Datei.
 *
 * Erzeugt statt hingeschrieben ist der Fall unabhängig davon, wie die Datei
 * gespeichert wird. Und man sieht dabei, wie der Fehler zustande kommt.
 */
function alsLatin1Gelesen(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

describe("alsLatin1Gelesen", () => {
  it("erzeugt wirklich eine Verfaelschung", () => {
    // Ohne diese Probe koennte der Erzeuger stillschweigend nichts tun — und
    // alle folgenden Tests waeren wertlos, weil sie richtigen Text pruefen.
    const kaputt = alsLatin1Gelesen("Große Au");
    expect(kaputt).not.toBe("Große Au");
    expect(kaputt.length).toBeGreaterThan("Große Au".length);
  });
});

describe("repariereZeichensatz", () => {
  it("stellt die echten Faelle aus der Kontaktliste richtig", () => {
    // Diese beiden standen so in der Datenbank und waren in der Kontaktliste
    // zu sehen.
    for (const echt of ["Bundesstraßenverwaltung", "Große Au"]) {
      expect(repariereZeichensatz(alsLatin1Gelesen(echt))).toBe(echt);
    }
  });

  it("stellt die uebrigen deutschen Sonderzeichen richtig", () => {
    for (const echt of ["Müller", "Schön", "Händler", "Größe", "Öl", "Ärger", "Übersicht"]) {
      expect(repariereZeichensatz(alsLatin1Gelesen(echt)), echt).toBe(echt);
    }
  });

  it("laesst gesunden Text unveraendert", () => {
    // Das ist die wichtigste Eigenschaft. Eine Reparatur, die richtigen Text
    // kaputt macht, ist schlimmer als der Fehler selbst — sie traefe ALLE
    // Datensaetze statt der drei betroffenen.
    for (const text of [
      "Müller",
      "Große Au",
      "Bundesstraßenverwaltung",
      "Gemeinde Borstel",
      "Windpark Nord-Ost 3",
      "",
      "ASCII only",
      "50 % Anteil",
    ]) {
      expect(repariereZeichensatz(text), `unveraendert: ${text}`).toBe(text);
    }
  });

  it("bricht nicht bei doppelter Anwendung", () => {
    // Laeuft die Reparatur zweimal ueber denselben Text — etwa weil ein
    // Import wiederholt wird — darf beim zweiten Mal nichts mehr passieren.
    const einmal = repariereZeichensatz(alsLatin1Gelesen("Große Au"));
    expect(repariereZeichensatz(einmal)).toBe(einmal);
    expect(einmal).toBe("Große Au");
  });

  it("laesst Zeichenketten ohne Sonderzeichen sofort in Ruhe", () => {
    expect(repariereZeichensatz("Gemeinde Borstel")).toBe("Gemeinde Borstel");
  });
});

describe("istFalschDekodiert", () => {
  it("meldet nur die kaputten", () => {
    expect(istFalschDekodiert(alsLatin1Gelesen("Große Au"))).toBe(true);
    expect(istFalschDekodiert("Große Au")).toBe(false);
    expect(istFalschDekodiert("Gemeinde Borstel")).toBe(false);
  });
});

describe("repariereZeile", () => {
  it("fasst nur Zeichenketten an", () => {
    const zeile = repariereZeile({
      name: alsLatin1Gelesen("Große Au"),
      flaeche: 12345,
      aktiv: true,
      datum: null,
    });
    expect(zeile.name).toBe("Große Au");
    expect(zeile.flaeche).toBe(12345);
    expect(zeile.aktiv).toBe(true);
    expect(zeile.datum).toBeNull();
  });

  it("stellt auch Spaltenueberschriften richtig", () => {
    // Eine CSV-Kopfzeile ist genauso betroffen wie ihr Inhalt. Bleibt sie
    // kaputt, findet die automatische Spaltenzuordnung "Größe" nicht.
    const zeile = repariereZeile({ [alsLatin1Gelesen("Größe")]: "100" });
    expect(Object.keys(zeile)).toEqual(["Größe"]);
  });
});
