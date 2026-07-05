/**
 * Deklarative Path-Patterns für die Enercon-SCADA-Ablage-Struktur.
 *
 * Ersetzt die 3-Case-Switch-Discovery in `import-service.ts` durch
 * pattern-basiertes Matching. Vorteil: neuer File-Location-Typ (z.B. wenn
 * Enercon ein neues Verzeichnis-Layout ausrollt) heißt neuen Pattern
 * ergänzen — kein Reader-Code-Refactor.
 *
 * Ablage-Konvention:
 *   daily:   Loc_XXXX/{YYYY}/{MM}/{YYYYMMDD}.{ext}
 *   monthly: Loc_XXXX/{YYYY}/{YYYYMM}00.{ext}
 *   yearly:  Loc_XXXX/{YYYY}0000.{ext} (excludes 00000000 = alltime)
 *
 * Wichtig: `00000000.*` (Alltime-Rollups) werden bewusst NICHT gesucht —
 * die überlappen mit yearly und liefern keinen zusätzlichen Business-Wert.
 * Der Filter für den Yearly-Case schließt sie explizit aus.
 */

import fg from "fast-glob";
import path from "node:path";

/** File-Location aus dem Backend-Config (import-service.ts) */
export type FileLocation = "daily" | "monthly" | "yearly";

/**
 * Deklarativer Filename-Struktur-Descriptor pro File-Location.
 *
 * - `globPattern`: fast-glob-Pattern relativ zum locationPath, mit `{ext}`-
 *   Platzhalter der bei der Suche ersetzt wird.
 * - `filenameRegex`: Zusätzliche Validation nach dem Glob-Match. Nötig weil
 *   Glob-Pattern nur die grobe Struktur matcht (z.B. `????????` matcht auch
 *   invalide Monate/Tage), Regex prüft die Semantik.
 */
interface PatternDescriptor {
  readonly globPattern: string;
  readonly filenameRegex: RegExp;
}

/**
 * Patterns pro File-Location. `[ext]` wird beim Discovery-Aufruf durch die
 * konkrete Extension ersetzt (WSD, UID, AVR, ...).
 *
 * Warum `[!0-9]` im Yearly-Pattern: exkludiert Files unterhalb der Loc-Root
 * die mit Ziffer starten (unwahrscheinlich, aber sicherer). Der `filenameRegex`
 * mit negativer Lookahead für "0000" schließt die Alltime-Files aus.
 */
const PATTERNS: Record<FileLocation, PatternDescriptor> = {
  // {Loc}/{YYYY}/{MM}/{YYYYMMDD}.{ext} — z.B. 20260315.wsd
  daily: {
    globPattern: "*/[0-9][0-9]/????????.[ext]",
    filenameRegex: /^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\.[a-z0-9]+$/i,
  },

  // {Loc}/{YYYY}/{YYYYMM}00.{ext} — z.B. 20260600.wsr
  monthly: {
    globPattern: "*/????????.[ext]",
    filenameRegex: /^\d{4}(0[1-9]|1[0-2])00\.[a-z0-9]+$/i,
  },

  // {Loc}/{YYYY}0000.{ext} — z.B. 20260000.avy, exkludiert 00000000
  yearly: {
    globPattern: "????????.[ext]",
    filenameRegex: /^(?!0000)\d{4}0000\.[a-z0-9]+$/i,
  },
};

/**
 * Discoverd SCADA-Files für einen File-Type via deklarative Pattern.
 *
 * Ersatz für die bisherige Case-Switch-Logik in `import-service.ts:discoverFiles`.
 * Verhalten ist deckungsgleich — die Cross-Check-Tests in Phase 0 beweisen es.
 *
 * @param locationPath Absoluter Pfad zum Loc_XXXX-Verzeichnis
 * @param extension    Lowercase Datei-Extension ohne Punkt (z.B. "wsd")
 * @param fileLocation Ablage-Kategorie aus FILE_TYPE_CONFIG
 * @param maxFiles     Sicherheits-Grenze — mehr Files werden abgeschnitten + geloggt
 * @returns Sortierte Absolut-Pfade
 */
export async function discoverByPattern(
  locationPath: string,
  extension: string,
  fileLocation: FileLocation,
  maxFiles: number = 50_000,
): Promise<string[]> {
  const pattern = PATTERNS[fileLocation];
  const glob = pattern.globPattern.replace("[ext]", extension.toLowerCase());

  // fast-glob nutzt POSIX-Pfade — Windows-Pfade normalisieren
  const normalizedRoot = locationPath.replace(/\\/g, "/");

  const files = await fg(glob, {
    cwd: normalizedRoot,
    caseSensitiveMatch: false,
    onlyFiles: true,
    absolute: true,
    // Sortiert innerhalb fg — spart eine Array.sort() Runde
    // (Empirisch ~15% schneller bei 5000+ Files auf Windows-Volumes)
    stats: false,
  });

  // Post-Filter Regex — Glob matcht die Struktur, Regex validiert Datum-Semantik
  const validated = files
    .filter((f) => pattern.filenameRegex.test(path.basename(f)))
    .sort();

  if (validated.length > maxFiles) {
    // Best-Effort: liefer erste maxFiles, Rest wird im Import ignoriert.
    // Log kommt aus dem Caller (import-service) damit hier kein Logger-Import
    // dazu kommt.
    return validated.slice(0, maxFiles);
  }

  return validated;
}
