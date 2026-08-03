/**
 * Falsch dekodierten Text erkennen und richtigstellen.
 *
 * ## Woran man es sieht
 *
 * In der Kontaktliste stand „Bundesrepublik Deutschland
 * (BundesstraÃŸenverwaltung)" und „Unterhaltungs- und
 * Landschaftspflegeverband GroÃŸe Au". Aus jedem `ß` war `ÃŸ` geworden, aus
 * jedem `ü` ein `Ã¼`.
 *
 * Der Grund ist immer derselbe: eine Datei liegt in UTF-8 vor, wird aber als
 * Latin-1 gelesen. Jedes Byte wird dann einzeln zu einem Zeichen — und aus
 * den zwei Bytes, die ein `ß` ausmachen, werden zwei sichtbare Zeichen.
 *
 * ## Warum die Umkehrung sicher ist
 *
 * Der Weg zurück ist eindeutig: die Zeichen wieder zu Bytes machen und diese
 * als UTF-8 lesen. Ist das Ergebnis gültiges UTF-8 **und** unterscheidet es
 * sich vom Eingang, war es falsch dekodiert. Ist es kein gültiges UTF-8, war
 * der Text in Ordnung und bleibt unverändert.
 *
 * Das ist der springende Punkt: die Prüfung kann echten Text nicht kaputt
 * machen. „Größe" enthält Zeichen jenseits von Latin-1 und wird sofort
 * verworfen; „Muller" hat gar keine Sonderzeichen und wird übersprungen.
 *
 * ## Warum diese Datei entstanden ist
 *
 * Es gab die Funktion schon — als private Hilfsfunktion im Shapefile-Zerleger.
 * Flurstücke aus einer Shapefile-Lieferung kamen deshalb sauber herein,
 * Kontakte aus einer CSV-Datei nicht. Dieselbe Regel, an einer Stelle
 * angewandt und an der anderen nicht — und man sieht es erst, wenn ein
 * Verband „GroÃŸe Au" heisst.
 */

/**
 * Stellt einen einzelnen Text richtig. Unverdächtiger Text kommt unverändert
 * zurück.
 */
/** Obergrenze eines Latin-1-Zeichens. Darueber kann kein einzelnes Byte liegen. */
const LATIN1_MAX = 0xff;
/** Ab hier beginnen die Zeichen, die aus einer Fehldekodierung stammen koennen. */
const LATIN1_SONDERZEICHEN_AB = 0x80;

export function repariereZeichensatz(text: string): string {
  // Ohne Zeichen aus dem oberen Latin-1-Bereich kann nichts falsch dekodiert
  // sein. Bewusst als Schleife und nicht als Zeichenklasse in einem regulaeren
  // Ausdruck: die Zeichen 0x80 bis 0xFF sind in einer Quelldatei unsichtbar
  // und ueberleben weder Kopieren noch eine Werkzeugkette, die die Datei
  // umschreibt. Genau daran ist der erste Anlauf gescheitert.
  let verdaechtig = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= LATIN1_SONDERZEICHEN_AB && code <= LATIN1_MAX) {
      verdaechtig = true;
      break;
    }
  }
  if (!verdaechtig) return text;

  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Ein Zeichen jenseits von Latin-1 kann nicht aus einem einzelnen Byte
    // entstanden sein — dann ist der Text echt und bleibt, wie er ist.
    if (code > 255) return text;
    bytes[i] = code;
  }

  try {
    // `fatal: true` ist wesentlich: ohne das ersetzt der Dekodierer
    // ungueltige Folgen still durch U+FFFD und meldet Erfolg — aus einem
    // gesunden Text wuerde dann einer mit Fragezeichen-Rauten.
    const entschluesselt = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return entschluesselt !== text ? entschluesselt : text;
  } catch {
    // Kein gueltiges UTF-8 — also war der Text nicht falsch dekodiert.
    return text;
  }
}

/** Sieht der Text nach falscher Dekodierung aus? Nur zum Melden gedacht. */
export function istFalschDekodiert(text: string): boolean {
  return repariereZeichensatz(text) !== text;
}

/**
 * Stellt alle Zeichenketten eines Objekts richtig — flach, ohne Verschachtelung.
 *
 * Gedacht für die Grenze, an der Daten hereinkommen: eine eingelesene
 * CSV-Zeile, ein Datensatz aus einer Fremdquelle. Andere Werte als
 * Zeichenketten bleiben unangetastet.
 */
export function repariereZeile<T extends Record<string, unknown>>(zeile: T): T {
  const ergebnis: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(zeile)) {
    ergebnis[typeof schluessel === "string" ? repariereZeichensatz(schluessel) : schluessel] =
      typeof wert === "string" ? repariereZeichensatz(wert) : wert;
  }
  return ergebnis as T;
}
