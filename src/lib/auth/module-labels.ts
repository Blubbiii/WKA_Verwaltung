/**
 * MODUL-BESCHRIFTUNGEN — eine Quelle für alle Rechte-Ansichten
 * =============================================================
 *
 * ## Warum es diese Datei gibt
 *
 * Die Beschriftungen standen zweimal im Haus, und die beiden Kopien waren
 * auseinandergelaufen:
 *
 * | Ort | kannte | es gibt |
 * |---|---|---|
 * | `api/admin/permissions/route.ts` (Rechte-Ansicht) | 20 Module | 32 |
 * | `api/admin/permissions/export/route.ts` (Matrix-Export) | 17 Module | 32 |
 *
 * Beide fielen für unbekannte Module auf `perm.module` zurück. In der
 * exportierten Berechtigungs-Matrix vom 05.08.2026 standen deshalb fünfzehn
 * Überschriften als technische Schlüssel in einem sonst deutschen Dokument:
 * `accounting`, `faults`, `wirtschaftsplan`, `curtailment` …
 *
 * Schlimmer als hässlich: dieselben fünfzehn fehlten auch in `moduleOrder`.
 * Wer dort nicht steht, wird hinten angehängt — in der Reihenfolge, in der die
 * Datenbank die Rechte liefert. Der Buchhaltungsblock, mit zwanzig Zeilen der
 * grösste im ganzen Dokument, landete so im unsortierten Anhang.
 *
 * ## Die Regel
 *
 * `PERMISSION_CATALOG` in `permissions.catalog.ts` ist die Quelle der Rechte.
 * Diese Datei ist die Quelle ihrer **Darstellung** — Beschriftung und
 * Reihenfolge — und sonst nichts.
 *
 * Wer ein Modul im Katalog ergänzt, ergänzt es hier mit. Der Wächter
 * `module-labels.test.ts` besteht darauf: er vergleicht beide Listen und
 * schlägt fehl, sobald eine ein Modul kennt, das der anderen fehlt. Ein
 * vergessener Eintrag fällt damit im Test auf und nicht erst einem Prüfer im
 * fertigen Dokument.
 */

/**
 * Deutsche Beschriftung je Modul.
 *
 * Die Reihenfolge der Einträge IST die Anzeigereihenfolge — gruppiert nach
 * Sachgebiet, nicht alphabetisch: erst der Bestand (Parks, Anlagen,
 * Flurstücke), dann das Kaufmännische, dann der Betrieb, zuletzt die
 * Verwaltung. So liest sich das Dokument wie das Unternehmen arbeitet.
 */
export const MODUL_BESCHRIFTUNGEN: Record<string, string> = {
  // --- Bestand ---
  parks: "Windparks",
  turbines: "Anlagen",
  plots: "Flurstücke",
  leases: "Pachtverträge",
  contracts: "Verträge",

  // --- Gesellschaft und Beteiligung ---
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  votes: "Abstimmungen",
  portal: "Anleger-Portal",

  // --- Kaufmännisches ---
  invoices: "Rechnungen",
  accounting: "Buchhaltung",
  "management-billing": "Betriebsführungs-Abrechnung",
  wirtschaftsplan: "Wirtschaftsplan",
  vendors: "Lieferanten",

  // --- Betrieb ---
  energy: "Energie und Abrechnung",
  "service-events": "Service-Einsätze",
  faults: "Störungen",
  availability: "Verfügbarkeit",
  curtailment: "Abregelung",
  insurance: "Versicherungen",
  dismantling: "Rückbau",

  // --- Unterlagen und Kontakt ---
  documents: "Dokumente",
  inbox: "Eingang",
  crm: "Kontakte",
  mailings: "Rundschreiben",
  news: "Meldungen",

  // --- Auswertung und Verwaltung ---
  reports: "Berichte",
  settings: "Einstellungen",
  users: "Benutzer",
  roles: "Rollen und Rechte",
  admin: "Administration",
  system: "System",
};

/**
 * Anzeigereihenfolge der Module.
 *
 * Abgeleitet aus der Reihenfolge in `MODUL_BESCHRIFTUNGEN` — damit gibt es
 * keine zweite Liste, die man getrennt pflegen und vergessen kann. Genau
 * dieses Auseinanderlaufen von Beschriftung und Reihenfolge war der Fehler,
 * den diese Datei behebt.
 */
export const MODUL_REIHENFOLGE: string[] = Object.keys(MODUL_BESCHRIFTUNGEN);

/**
 * Beschriftung eines Moduls, ersatzweise sein technischer Schlüssel.
 *
 * Der Rückfall bleibt bestehen: ein neues Modul soll im Dokument auftauchen,
 * auch wenn hier noch niemand einen Namen vergeben hat. Lieber ein sperriges
 * Wort als eine fehlende Zeile — eine fehlende Zeile in einer
 * Berechtigungs-Matrix behauptet, es gebe das Recht nicht.
 */
export function modulBeschriftung(modul: string): string {
  return MODUL_BESCHRIFTUNGEN[modul] ?? modul;
}

/**
 * Sortiert Modulschlüssel in die Anzeigereihenfolge.
 *
 * Unbekannte Module hängen hinten an, alphabetisch — nicht in der zufälligen
 * Reihenfolge, in der die Datenbank sie liefert. Ein Anhang ist verkraftbar,
 * ein unsortierter Anhang nicht.
 */
export function sortiereModule(module: string[]): string[] {
  const bekannt = MODUL_REIHENFOLGE.filter((m) => module.includes(m));
  const unbekannt = module
    .filter((m) => !MODUL_BESCHRIFTUNGEN[m])
    .sort((a, b) => a.localeCompare(b, "de"));
  return [...bekannt, ...unbekannt];
}
