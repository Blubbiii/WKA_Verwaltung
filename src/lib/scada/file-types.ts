/**
 * SCADA File-Type Master — Single Source of Truth.
 *
 * Diese Datei enthält die kanonische Liste aller unterstützten Enercon-SCADA-
 * Dateiendungen. Sie ist bewusst frei von Prisma/Node-Only-Deps, damit sowohl
 * Server-Code (import-service, API-Routes) als auch Client-Code (Upload-UI)
 * daraus importieren können.
 *
 * WICHTIG: Beim Hinzufügen einer neuen Extension nur HIER ändern. Historisch
 * war die Liste an 4 Stellen dupliziert (Import-Service, Frontend-Uploader,
 * /api/energy/scada/upload, /api/energy/scada/n8n/upload) und wochenlang nicht
 * synchron — neue Extensions landeten im Backend, aber der Frontend-Whitelist
 * blieb alt und Files wurden clientseitig verworfen bevor sie das Backend
 * erreichten. Dieser Master verhindert Drift by design.
 *
 * Die reichere Config (fileLocation, periodType, modelName, readerKey) für
 * jeden Type liegt in `import-service.ts:FILE_TYPE_CONFIG` — sie referenziert
 * die Extensions von hier.
 */

/**
 * Kanonische Reihenfolge aller SCADA-File-Type-Keys (uppercase).
 *
 * 27 Extensions in 6 semantischen Gruppen — siehe `SCADA_FILE_TYPES_BY_GROUP`.
 */
export const SCADA_FILE_TYPES = [
  // Measurement data (10-Minuten-Intervalle)
  "WSD", "UID",

  // Availability time budgets
  "AVR", "AVW", "AVM", "AVY",

  // State and warning summaries (monthly)
  "SSM", "SWM",

  // Event logs
  "PES", "PEW", "PET",

  // Wind summaries (aggregated)
  "WSR", "WSW", "WSM", "WSY",

  // Shadow casting
  "WDD",

  // Operating state codes
  "84D", "85D",

  // Per-phase electrical data
  "UQD", "UQR", "UQW", "UQM", "UQY",

  // Electrical summaries (full UID field set)
  "UIR", "UIW", "UIM", "UIY",
] as const;

export type ScadaFileTypeKey = (typeof SCADA_FILE_TYPES)[number];

/**
 * Lowercase Datei-Endungen (ohne Punkt). Kanonisch für Whitelist-Vergleiche.
 *
 * @example
 *   const ext = file.name.split(".").pop()?.toLowerCase();
 *   if (SCADA_EXTENSIONS_SET.has(ext)) { ... }
 */
export const SCADA_EXTENSIONS: readonly string[] = SCADA_FILE_TYPES.map((t) =>
  t.toLowerCase(),
);

/**
 * Als Set — O(1)-Lookup für Whitelist-Prüfungen im Hot-Path.
 */
export const SCADA_EXTENSIONS_SET: ReadonlySet<string> = new Set(SCADA_EXTENSIONS);

/**
 * Mit führendem Punkt — für Frontend-Filter (`accept`-Attribut, File-Extension-Check).
 *
 * @example
 *   const isScada = SCADA_EXTENSIONS_DOTTED.includes("." + ext);
 */
export const SCADA_EXTENSIONS_DOTTED: readonly string[] = SCADA_EXTENSIONS.map(
  (e) => `.${e}`,
);

/**
 * Für Gruppierungs-UI: Extensions nach semantischer Kategorie sortiert.
 * (Wird von der Frontend-Whitelist als Kommentar-Struktur genutzt.)
 */
export const SCADA_FILE_TYPES_BY_GROUP = {
  measurementDaily: ["WSD", "UID", "UQD", "WDD", "84D", "85D"],
  availability: ["AVR", "AVW", "AVM", "AVY"],
  stateWarningSummary: ["SSM", "SWM"],
  events: ["PES", "PEW", "PET"],
  windSummary: ["WSR", "WSW", "WSM", "WSY"],
  electricalSummary: ["UIR", "UIW", "UIM", "UIY"],
  electricalPhase: ["UQR", "UQW", "UQM", "UQY"],
} as const satisfies Record<string, readonly ScadaFileTypeKey[]>;

/**
 * Case-insensitive Type-Guard — akzeptiert "wsd", "WSD", "Wsd".
 * Bei match wird der kanonische Uppercase-Key returned, sonst null.
 */
export function normalizeFileType(value: string): ScadaFileTypeKey | null {
  const upper = value.toUpperCase();
  return (SCADA_FILE_TYPES as readonly string[]).includes(upper)
    ? (upper as ScadaFileTypeKey)
    : null;
}
