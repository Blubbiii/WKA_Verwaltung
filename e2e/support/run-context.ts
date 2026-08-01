/**
 * Kennung des Testlaufs — und damit die Grundlage fürs Aufräumen.
 *
 * Jeder Datensatz, den die Suite anlegt, trägt dieses Präfix im Namen. Daran
 * hängt alles Weitere: das Aufräumen findet seine eigenen Spuren wieder, ohne
 * je einen echten Datensatz anzufassen, und zwei parallele Läufe kommen sich
 * nicht ins Gehege.
 *
 * ## Warum das nicht optional ist
 *
 * Die Suite läuft auch gegen Instanzen mit echten Daten. Ein Aufräumen, das
 * „alle Parks mit Test im Namen“ löscht, träfe irgendwann einen echten
 * „Testfeld Nord“. Ein Präfix mit Zeitstempel und Zufallsanteil trifft nur,
 * was dieser Lauf selbst erzeugt hat.
 *
 * ## Warum es im Namen steht und nicht in einem Feld
 *
 * Ein eigenes Feld „istTestdatensatz“ müsste durch jedes Schema, jede API und
 * jede Maske gezogen werden — und wäre in der Oberfläche unsichtbar. Das
 * Präfix steht im Namen und ist damit genau dort sichtbar, wo jemand
 * hinsieht, der sich wundert, was das für ein Park ist.
 */

/**
 * Kennung dieses Laufs: `E2E-<Datum>-<Zufall>`.
 *
 * Aus einer Umgebungsvariablen übernehmbar, damit alle Arbeiter eines Laufs
 * dieselbe verwenden — Playwright startet die Spezifikationen in getrennten
 * Prozessen, ein Modul-Zufallswert wäre je Datei ein anderer.
 */
export const RUN_ID =
  process.env.E2E_RUN_ID ??
  `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

/** Präfix für jeden erzeugten Namen. Bewusst laut und unverwechselbar. */
export const PREFIX = `E2E-${RUN_ID}`;

/**
 * Erkennt Datensätze FRÜHERER Läufe mit.
 *
 * Bricht ein Lauf ab, bleiben seine Spuren liegen. Der nächste räumt sie mit
 * weg, statt sie für immer stehen zu lassen — deshalb ist das Muster
 * absichtlich weiter gefasst als `PREFIX`.
 */
export const CLEANUP_PATTERN = /^E2E-\d{8}-[a-z0-9]{5}/;

/** Eindeutiger Name für ein Objekt dieses Laufs. */
export function testName(label: string, suffix?: string): string {
  return suffix ? `${PREFIX} ${label} ${suffix}` : `${PREFIX} ${label}`;
}

/**
 * Gehört dieser Name einem Testlauf?
 *
 * Wird vor JEDEM Löschen geprüft. Ein Aufräumen, das sich auf die Herkunft
 * seiner Liste verlässt, löscht irgendwann das Falsche.
 */
export function isTestArtifact(name: string | null | undefined): boolean {
  return typeof name === "string" && CLEANUP_PATTERN.test(name.trim());
}
