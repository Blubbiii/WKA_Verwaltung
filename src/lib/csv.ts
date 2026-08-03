import { repariereZeichensatz } from "@/lib/text/mojibake";
/**
 * CSV lesen — eine Stelle für das ganze Projekt.
 *
 * Bedienaufwand #22 (Audit 2026-07): Import gibt es für SHP, Bank, Energie,
 * GIS und SCADA-Codes, aber für keine Stammdaten. Der einzige brauchbare
 * CSV-Leser steckte in `production-import-sheet.tsx` fest — 1.163 Zeilen
 * Energie-Import, aus denen sich nichts wiederverwenden ließ.
 *
 * ## Was hier bedacht ist
 *
 * **Trennzeichen** — Excel schreibt im deutschen Gebietsschema Semikolon, im
 * englischen Komma. Erkannt wird über die Kopfzeile: welches Zeichen außerhalb
 * von Anführungszeichen häufiger vorkommt. Ein reines `includes(";")` wie im
 * Energie-Import verwechselt sich an einer Kopfzeile wie
 * `"Name; Vorname",Ort` — dort steht das Semikolon INNERHALB eines Feldes.
 *
 * **BOM** — Excel stellt UTF-8-Dateien ein `﻿` voran. Ohne Entfernen
 * heißt die erste Spalte `﻿Name` und keine Zuordnung greift.
 *
 * **Zeilenumbrüche in Feldern** — ein Adressfeld mit Zeilenumbruch ist in
 * Anführungszeichen zulässig. Die zeilenweise Vorzerlegung des Energie-Imports
 * zerreißt solche Datensätze. Hier wird zeichenweise über den ganzen Text
 * gelaufen.
 */

export interface CsvParseResult {
  headers: string[];
  /** Eine Zeile je Datensatz, Spaltenname → Wert. */
  rows: Record<string, string>[];
  delimiter: string;
}

/** Kandidaten in der Reihenfolge, in der bei Gleichstand entschieden wird. */
const DELIMITERS = [";", ",", "\t", "|"] as const;

/**
 * Trennzeichen anhand der Kopfzeile bestimmen.
 *
 * Gezählt wird nur außerhalb von Anführungszeichen — sonst gewinnt ein
 * Semikolon, das in einem Spaltennamen steht.
 */
export function detectDelimiter(text: string): string {
  const firstLine = firstLogicalLine(text);
  let best: string = DELIMITERS[0];
  let bestCount = 0;

  for (const candidate of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (inQuotes && firstLine[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (ch === candidate && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Erste Zeile, die nicht innerhalb eines Anführungszeichen-Feldes endet. */
function firstLogicalLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      return text.slice(0, i);
    }
  }
  return text;
}

/**
 * CSV in Kopfzeile und Datensätze zerlegen.
 *
 * Doppelte Spaltennamen bekommen einen Zähler (`Name`, `Name_2`), damit keine
 * Spalte stillschweigend eine andere überschreibt.
 */
export function parseCsv(input: string, delimiter?: string): CsvParseResult {
  // BOM entfernen — sonst heisst die erste Spalte "﻿Name".
  //
  // Und den Zeichensatz richtigstellen, BEVOR zerlegt wird.
  //
  // In der Kontaktliste standen "BundesstraSSenverwaltung" und "GroSSe Au"
  // (mit den typischen zwei Ersatzzeichen statt eines ss) — eine UTF-8-Datei,
  // die als Latin-1 gelesen wurde. Der Shapefile-Zerleger hatte die Reparatur
  // schon, aber als private Hilfsfunktion bei sich; Flurstuecke kamen deshalb
  // sauber herein, Kontakte nicht. Dieselbe Regel an einer Stelle angewandt
  // und an der anderen nicht.
  //
  // Hier oben, weil auch die KOPFZEILE betroffen ist: bleibt sie verfaelscht,
  // findet die automatische Spaltenzuordnung ihre Spalte nicht.
  const text = repariereZeichensatz(input.replace(/^﻿/, ""));
  if (text.trim() === "") return { headers: [], rows: [], delimiter: delimiter ?? ";" };

  const sep = delimiter ?? detectDelimiter(text);
  const records = splitRecords(text, sep);
  if (records.length === 0) return { headers: [], rows: [], delimiter: sep };

  const seen = new Map<string, number>();
  const headers = records[0].map((raw) => {
    const name = raw.trim() || "Spalte";
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    // Eine Zeile, die nur aus leeren Feldern besteht, ist keine Zeile.
    if (values.every((v) => v.trim() === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows, delimiter: sep };
}

/** Zeichenweise zerlegen — Zeilenumbrüche innerhalb von Feldern bleiben erhalten. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    current.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(current);
    current = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      endField();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // CRLF als EIN Umbruch zählen.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      continue;
    }

    field += ch;
  }

  // Letzter Datensatz ohne abschliessenden Umbruch.
  if (field !== "" || current.length > 0) endRecord();

  // Vollständig leere Datensätze am Ende (Datei endet mit Umbruch) verwerfen.
  return records.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Spalten automatisch zuordnen.
 *
 * `aliases` bildet Zielfeld → mögliche Spaltennamen ab. Verglichen wird
 * kleingeschrieben und ohne Leerraum, Bindestriche und Unterstriche, damit
 * „Postleitzahl", „postleitzahl" und „Postleit-Zahl" gleich behandelt werden.
 */
export function autoDetectMapping(
  headers: string[],
  aliases: Record<string, readonly string[]>,
): Record<string, string> {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    // Erstes Vorkommen gewinnt — bei "Name" und "Name_2" ist "Name" gemeint.
    if (!byNormalized.has(normalize(header))) byNormalized.set(normalize(header), header);
  }

  const mapping: Record<string, string> = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const hit = byNormalized.get(normalize(candidate));
      if (hit) {
        mapping[field] = hit;
        break;
      }
    }
  }
  return mapping;
}
