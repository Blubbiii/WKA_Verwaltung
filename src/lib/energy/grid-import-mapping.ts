/**
 * Spaltenzuordnung für den Netzbetreiber-Import — an einer Stelle.
 *
 * ## Warum das hier liegt und nicht in der Seite
 *
 * Der Assistent verlangte in Schritt 2 zwingend eine Spalte „Vergütungsart".
 * Seine eigene Beispieldatei hatte sie nicht: der Erzeuger war vom
 * Anlagen-Import kopiert worden, und der kennt kein solches Feld. Wer die
 * angebotene Datei herunterlud und wieder hochlud, kam in Schritt 2 nicht
 * weiter — ohne Aussicht, den Fehler bei sich zu finden.
 *
 * Die Ursache war nicht die fehlende Spalte, sondern dass **Erzeuger und
 * Prüfer nichts voneinander wussten**. Beide standen in verschiedenen
 * Dateien, keine Verbindung dazwischen. Genau das behebt dieses Modul: die
 * Pflichtfelder, die Erkennung und die Kopfzeile der Beispieldatei stehen
 * nebeneinander, und `grid-import-mapping.test.ts` prüft, dass sie
 * zusammenpassen.
 *
 * Die Spalte nachzutragen hätte den Fehler behoben. Das hier verhindert, dass
 * er wiederkommt.
 */

export interface GridColumnMapping {
  turbineId: string | null;
  turbineName: string | null;
  year: string | null;
  month: string | null;
  remunerationType: string | null;
  production: string | null;
  revenue: string | null;
}

/** Ohne diese vier kann der Assistent nicht weiter (Schritt „Zuordnung"). */
export const GRID_REQUIRED_FIELDS: (keyof GridColumnMapping)[] = [
  "year",
  "month",
  "remunerationType",
  "production",
];

/** Kopfzeile der Beispieldatei, die die Oberfläche zum Herunterladen anbietet. */
export const GRID_SAMPLE_HEADER =
  "WKA-Nr;Anlage;Jahr;Monat;Vergütungsart;Produktion_kWh;Betriebsstunden;Verfügbarkeit_Pct;Bemerkungen";

/** Codes, die der Assistent in der Spalte „Vergütungsart" akzeptiert. */
export const REMUNERATION_CODES = ["EEG", "DIRECT", "PPA", "SPOT", "OTHER"];

/**
 * Spalten anhand üblicher Bezeichnungen zuordnen.
 *
 * Die Reihenfolge der Abfragen ist bedeutsam: „WKA-Nr" muss vor „WKA" greifen,
 * sonst landet die Nummer in der Bezeichnung. Wer hier etwas einfügt, prüft
 * bitte die Tests — sie halten die Reihenfolge fest.
 */
export function autoDetectGridMapping(headers: string[]): GridColumnMapping {
  const mapping: GridColumnMapping = {
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    remunerationType: null,
    production: null,
    revenue: null,
  };

  for (const header of headers) {
    const lower = header.toLowerCase();

    if (lower.includes("wka") && (lower.includes("id") || lower.includes("nr"))) {
      mapping.turbineId = header;
    } else if (lower.includes("wka") || lower.includes("anlage") || lower.includes("turbine")) {
      if (!mapping.turbineName) mapping.turbineName = header;
    } else if (lower === "jahr" || lower === "year") {
      mapping.year = header;
    } else if (lower === "monat" || lower === "month") {
      mapping.month = header;
    } else if (
      lower.includes("vergue") ||
      lower.includes("vergüt") ||
      lower.includes("art") ||
      lower.includes("type") ||
      lower.includes("code")
    ) {
      mapping.remunerationType = header;
    } else if (
      lower.includes("prod") ||
      lower.includes("kwh") ||
      lower.includes("energie") ||
      lower.includes("energy")
    ) {
      mapping.production = header;
    } else if (
      lower.includes("erl") ||
      lower.includes("eur") ||
      lower.includes("revenue") ||
      lower.includes("betrag")
    ) {
      mapping.revenue = header;
    }
  }

  return mapping;
}
