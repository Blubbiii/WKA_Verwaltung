/**
 * Der Zeitraum des Belegexports.
 *
 * Eine Quelle für Seite, Route und Export. Bewusst ohne Server-Abhängigkeiten
 * — die Seite läuft im Browser und darf weder Prisma noch JSZip nachladen.
 *
 * Die Tage sind deutsche Kalendertage als `YYYY-MM-DD`. Gerechnet wird trotzdem
 * über UTC-Mitternacht: Ein Tag ist hier ein Etikett, kein Zeitpunkt, und in
 * UTC hat jeder Tag 24 Stunden. In Ortszeit hätte die Nacht der Zeitumstellung
 * 23 oder 25, und jede Tageszählung rundete daran.
 */

/** Ein Zeitraum aus zwei Kalendertagen, beide einschließlich. */
export interface Zeitraum {
  /** Erster Kalendertag, `YYYY-MM-DD`. */
  von: string;
  /** Letzter Kalendertag, `YYYY-MM-DD`. */
  bis: string;
}

const TAG_MS = 86_400_000;

/** Der Tag als Zeitpunkt, 00:00 UTC. */
export function utcMitternacht(tag: string): Date {
  return new Date(`${tag}T00:00:00.000Z`);
}

/**
 * Gibt es diesen Tag wirklich?
 *
 * Die Schreibweise zu prüfen genügt nicht: `2026-02-31` passt auf das Muster,
 * und JavaScript rechnet es klaglos in den 3. März um. Der Nutzer bekäme dann
 * einen anderen Zeitraum als den angeforderten — ohne Hinweis. Deshalb wird
 * zurückgerechnet und verglichen.
 */
export function istKalendertag(tag: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return false;
  const zeitpunkt = utcMitternacht(tag);
  return !Number.isNaN(zeitpunkt.getTime()) && zeitpunkt.toISOString().slice(0, 10) === tag;
}

/** Anzahl der Tage im Zeitraum, beide Grenzen eingeschlossen. */
export function tageImZeitraum(zeitraum: Zeitraum): number {
  return (
    Math.round((utcMitternacht(zeitraum.bis).getTime() - utcMitternacht(zeitraum.von).getTime()) / TAG_MS) + 1
  );
}

/** Name der ZIP-Datei. Der Server setzt ihn, die Seite nutzt ihn als Ersatz. */
export function belegExportDateiname(zeitraum: Zeitraum): string {
  return `Belege_${zeitraum.von}_bis_${zeitraum.bis}.zip`;
}
