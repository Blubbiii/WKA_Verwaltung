/**
 * Ausgeschriebene Umlaute in den deutschen Texten.
 *
 * Der Umlaut-Durchgang im Bugtest hatte nur die .tsx-Dateien erfasst; in den
 * Sprachdateien standen weiter "Datensaetze", "waehlen", "Verpaechter" usw.
 * Die Liste ist von Hand geprüft — "neue", "Steuer", "Quelle", "aktuell",
 * "Dauer" sind richtig geschrieben und stehen deshalb nicht darin. Nicht
 * geändert: Dateinamen-Präfixe und E-Mail-Adressen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FALSCH = `Aufschluesselung ausfuehren ausgeloest ausgewaehlt ausgewaehlten Ausgewaehlter auswaehlen Auswaehlen
Begruendung Datenqualitaet Datensaetze Eingeschraenkt Entitaet Entitaeten Ermaessigt Ermaessigter Flaeche fuer
geloescht Geloest Geschaetzter gewaehlten Glaettung Glaettungsfaktor gueltige Haeufigkeit koennen Kuendigen
Kuendigungsfrist Leistungsabfaellen Loesch loeschen Loeschen persoenlichen Pruefer rueckgaengig Signaturpruefung
Stuendliche Taegliche Tatsaechliche temporaerem Unterstuetzte Verlaengerung Verpaechter Verteilungsschluessel
waehle Waehle waehlen Waehlen wuerden zugehoerigen Zustaende`.split(/\s+/);

function texte(o: unknown, pfad = ""): Array<[string, string]> {
  if (typeof o === "string") return [[pfad, o]];
  if (!o || typeof o !== "object") return [];
  return Object.entries(o).flatMap(([k, v]) => texte(v, pfad ? `${pfad}.${k}` : k));
}

describe("Umlaute in den deutschen Sprachdateien", () => {
  for (const datei of ["de", "de-personal"]) {
    it(`${datei}.json schreibt keine Umlaute aus`, () => {
      const m = JSON.parse(readFileSync(join(process.cwd(), "src/messages", `${datei}.json`), "utf8"));
      const re = new RegExp(`(?<![A-Za-zÄÖÜäöüß])(${FALSCH.join("|")})(?![A-Za-zÄÖÜäöüß])`);
      const funde = texte(m).filter(([, v]) => re.test(v)).map(([k, v]) => `${k}: ${v.match(re)![1]}`);
      expect(funde).toEqual([]);
    });
  }
});
