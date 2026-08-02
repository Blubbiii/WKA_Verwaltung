/**
 * Gültige deutsche Test-IBANs erzeugen.
 *
 * ## Warum nicht eine feste
 *
 * Der SEPA-Test benutzte eine fest verdrahtete IBAN. Beim zweiten Lauf gegen
 * dieselbe Datenbank scheiterte er mit `HTTP 409` — das Bankkonto gab es
 * schon. Ein Test, der nur beim ersten Mal läuft, ist kein Test.
 *
 * ## Warum nicht einfach Ziffern würfeln
 *
 * Eine IBAN trägt eine Prüfziffer. Die API prüft sie (`ibanRegex` plus
 * Prüfung beim Zahllauf), und zu Recht: eine Zahlungsdatei mit ungültiger
 * IBAN weist die Bank zurück. Eine zusammengewürfelte Nummer wäre also nicht
 * „irgendeine IBAN", sondern eine ungültige — und der Test scheiterte an
 * seiner eigenen Vorbereitung statt am Gegenstand.
 *
 * Deshalb wird die Prüfziffer gerechnet. Das Verfahren steht in ISO 13616:
 * Land und Prüfziffer ans Ende, Buchstaben durch Zahlen ersetzen (A=10 … Z=35),
 * dann Rest modulo 97, und die Prüfziffer ist 98 minus dieser Rest.
 *
 * `iban.test.ts` prüft das gegen bekannte gültige IBANs — Modulo-97 auf einer
 * 20-stelligen Zahl ist leicht falsch implementiert, und ein Fehler dabei
 * fiele sonst erst als rätselhafter 400er im Test auf.
 */

/** Rest modulo 97, ziffernweise — die Zahl ist zu gross für `number`. */
function modulo97(ziffern: string): number {
  let rest = 0;
  for (const zeichen of ziffern) {
    rest = (rest * 10 + Number(zeichen)) % 97;
  }
  return rest;
}

/**
 * Baut eine gültige deutsche IBAN aus Bankleitzahl und Kontonummer.
 *
 * @param blz    8 Ziffern.
 * @param konto  bis zu 10 Ziffern, wird links mit Nullen aufgefüllt.
 */
export function deutscheIban(blz: string, konto: string): string {
  const bban = `${blz}${konto.padStart(10, "0")}`;

  // "DE00" ans Ende und in Ziffern: D = 13, E = 14, Prüfziffer vorläufig 00.
  const rest = modulo97(`${bban}131400`);
  const pruefziffer = String(98 - rest).padStart(2, "0");

  return `DE${pruefziffer}${bban}`;
}

/**
 * Eine für diesen Lauf eindeutige, gültige IBAN.
 *
 * Die Kontonummer kommt aus der laufenden Zeit — damit kollidieren auch zwei
 * Läufe kurz hintereinander nicht.
 */
export function testIban(unterscheidung: number = Date.now()): string {
  return deutscheIban("12030000", String(unterscheidung).slice(-10));
}
