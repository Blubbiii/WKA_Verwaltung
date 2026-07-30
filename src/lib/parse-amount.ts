/**
 * Betragseingaben in Zahlen umwandeln — eine Stelle für das ganze Projekt.
 *
 * Bedienaufwand #17 (Audit 2026-07): 235 Formularfelder stehen auf
 * `type="number"` und werden mit `parseFloat(e.target.value) || 0` ausgelesen.
 * Ein Number-Input liefert für „1.234,56" einen LEEREN Wert — die Position
 * wird stillschweigend 0,00 €. Keine Meldung, kein roter Rahmen.
 *
 * Daneben lagen drei eigene Parser im Repo, alle unterschiedlich, keiner in
 * einem Formular:
 *
 *   journal-entries/page.tsx   parseFloat(s.replace(",", "."))
 *                              → "1.234,56" ergibt 1.234 statt 1234.56
 *   production-import-sheet    regexbasiert, sauber, gibt null zurück
 *   ocr/invoice-extractor      entfernt ALLE Punkte
 *                              → "1234.56" ergibt 123456
 *
 * Diese Datei ersetzt sie.
 *
 * ## Die Mehrdeutigkeit, und wie sie hier aufgelöst wird
 *
 * „1.234" ist ohne Kontext nicht entscheidbar: deutsch gelesen 1234, englisch
 * gelesen 1,234. Es gibt keine Regel, die beide Lesarten richtig trifft — nur
 * eine, die vorhersagbar ist:
 *
 *   1. Kommen BEIDE Trennzeichen vor, ist das rechteste das Dezimaltrennzeichen.
 *      „1.234,56" → 1234.56 · „1,234.56" → 1234.56
 *   2. Nur Komma → Dezimaltrennzeichen. „1234,56" → 1234.56
 *      Ausnahme: sauber gruppiert („1,234,567") → Tausendertrennzeichen.
 *   3. Nur Punkt → Dezimaltrennzeichen („1.5" → 1.5, „1.50" → 1.5),
 *      AUSSER die Zeichenkette ist sauber in Dreiergruppen geteilt
 *      („1.234", „12.345.678") → dann Tausendertrennzeichen.
 *
 * Regel 3 ist die bewusste Entscheidung: In einer deutschen Buchhaltung meint
 * „1.234" fast immer 1234. Wer 1,234 meint, schreibt in diesem Programm
 * „1,234". Der Preis: ein aus einer englischen Quelle kopiertes „1.500" wird
 * als 1500 gelesen, nicht als 1,5. Das ist die seltenere Eingabe — und anders
 * als heute ist das Ergebnis wenigstens vorhersagbar statt still 0.
 */

/**
 * Alles, was in einer Betragseingabe stehen darf, aber keine Ziffer ist.
 * \s deckt U+00A0 und U+202F bereits ab — sie stehen hier trotzdem einzeln,
 * weil genau diese beiden aus Excel und Word kommen und der Leser sonst
 * raten muss, ob sie erfasst sind.
 */
const NOISE = /[\s   ’'€$£]/g;

/** „1.234" / „12.345.678" — sauber in Dreiergruppen geteilt. */
const DOT_GROUPED = /^\d{1,3}(\.\d{3})+$/;

/** „1,234" / „12,345,678" — dasselbe mit Komma. */
const COMMA_GROUPED = /^\d{1,3}(,\d{3})+$/;

/**
 * Betragstext in eine Zahl umwandeln.
 *
 * Gibt `null` zurück, wenn nichts Sinnvolles darin steht — bewusst nicht 0.
 * Genau die stille 0 ist der Fehler, den diese Funktion behebt: der Aufrufer
 * muss entscheiden, ob eine leere Eingabe 0 bedeutet oder ein Fehler ist.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let str = input.replace(NOISE, "");
  if (str === "") return null;

  // Vorzeichen abtrennen, damit die Gruppierungsprüfungen nur Ziffern sehen.
  let sign = 1;
  if (str.startsWith("-")) {
    sign = -1;
    str = str.slice(1);
  } else if (str.startsWith("+")) {
    str = str.slice(1);
  }

  // Buchhalterische Klammernotation: (1.234,56) bedeutet -1234,56.
  if (str.startsWith("(") && str.endsWith(")")) {
    sign = -sign;
    str = str.slice(1, -1);
  }

  if (str === "") return null;

  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");

  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Regel 1: das rechteste Trennzeichen trennt die Nachkommastellen.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = str.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    // Regel 2
    normalized = COMMA_GROUPED.test(str)
      ? str.split(",").join("")
      : str.replace(",", ".");
  } else if (lastDot >= 0) {
    // Regel 3
    normalized = DOT_GROUPED.test(str) ? str.split(".").join("") : str;
  } else {
    normalized = str;
  }

  // Nach der Normalisierung darf nur noch eine gültige Dezimalzahl dastehen.
  // `parseFloat` wäre hier zu nachsichtig: es liest „12abc" als 12 und
  // „1.2.3" als 1.2 — beides Eingaben, bei denen eine Rückmeldung besser ist
  // als ein Ergebnis.
  if (!/^\d*\.?\d+$/.test(normalized) && !/^\d+\.$/.test(normalized)) return null;

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? sign * value : null;
}

/**
 * Wie `parseAmount`, aber mit einem Rückfallwert statt `null`.
 *
 * Nur benutzen, wo eine leere Eingabe wirklich 0 bedeutet — nicht als bequemer
 * Ersatz für eine Fehlermeldung.
 */
export function parseAmountOr(
  input: string | number | null | undefined,
  fallback = 0,
): number {
  const parsed = parseAmount(input);
  return parsed === null ? fallback : parsed;
}

/**
 * Zahl in die Schreibweise bringen, die ein Betragsfeld anzeigt.
 *
 * Bewusst ohne Tausenderpunkte: die entstehen erst beim Verlassen des Feldes
 * (siehe `AmountInput`), während der Eingabe stören sie den Cursor.
 */
export function formatAmountForInput(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(decimals).replace(".", ",");
}
