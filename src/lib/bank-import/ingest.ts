/**
 * Kontoauszug einlesen: parsen, Dubletten aussortieren, zuordnen, speichern.
 *
 * B7 (Audit 2026-07): „Parser sind da, der Import ist datei-basiert.
 * Täglicher automatischer Kontoabruf würde Zahlungsabgleich und Mahnlauf
 * vollständig automatisieren."
 *
 * ## Warum diese Datei überhaupt entsteht
 *
 * Die Kette parsen → entdoppeln → zuordnen → speichern stand bisher inline in
 * der Upload-Route. Für den automatischen Abruf braucht sie einen zweiten
 * Aufrufer — und zwei Fassungen derselben Dublettenerkennung driften
 * auseinander. Bei Kontoumsätzen heisst das doppelte Buchungen, und die fallen
 * erst beim Kontenabgleich auf.
 *
 * ## Der Natural Key
 *
 * `(bankReference, amount, bookingDate, counterpartIban)`. Bewusst nicht die
 * Bankreferenz allein: nicht jede Bank liefert sie, und bei MT940 ist sie
 * teilweise nur innerhalb des Auszugs eindeutig.
 */

export interface ParsedTransaction {
  bankReference?: string | null;
  amount: number | string;
  date: Date;
  counterpartIban?: string | null;
}

export interface ExistingTransaction {
  bankReference: string | null;
  amount: string;
  bookingDate: Date;
  counterpartIban: string | null;
}

/**
 * Natural Key einer Buchung.
 *
 * Exportiert, damit beide Seiten — Kandidaten und Bestand — denselben
 * Schlüssel bilden. Zwei Fassungen davon wären zwei Dublettenerkennungen.
 */
export function transactionKey(transaction: ParsedTransaction): string {
  return [
    (transaction.bankReference ?? "").trim(),
    String(transaction.amount),
    transaction.date.toISOString(),
    (transaction.counterpartIban ?? "").trim(),
  ].join("|");
}

export interface SelectionResult<T> {
  fresh: T[];
  duplicates: number;
  /** Dubletten INNERHALB der eingelesenen Datei. */
  duplicatesInFile: number;
}

/**
 * Neue Buchungen aus den Kandidaten auswählen.
 *
 * Entfernt sowohl Buchungen, die es im Bestand schon gibt, als auch
 * Wiederholungen innerhalb derselben Datei. Der zweite Fall tritt auf, wenn
 * ein Auszug einen Zeitraum überlappt, den ein früherer schon enthielt — bei
 * einem täglichen automatischen Abruf ist das der Normalfall, nicht die
 * Ausnahme.
 */
export function selectNewTransactions<T>(
  candidates: readonly T[],
  extract: (candidate: T) => ParsedTransaction,
  existing: readonly ExistingTransaction[],
): SelectionResult<T> {
  const seen = new Set(
    existing.map((row) =>
      transactionKey({
        bankReference: row.bankReference,
        amount: row.amount,
        date: row.bookingDate,
        counterpartIban: row.counterpartIban,
      }),
    ),
  );

  const fresh: T[] = [];
  let duplicatesInFile = 0;
  let duplicates = 0;

  for (const candidate of candidates) {
    const key = transactionKey(extract(candidate));
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    fresh.push(candidate);
  }

  // Getrennt zählen: Wiederholungen in der Datei sagen etwas über den
  // Auszug, Treffer im Bestand etwas über den Abrufrhythmus.
  const inFileKeys = new Set<string>();
  for (const candidate of candidates) {
    const key = transactionKey(extract(candidate));
    if (inFileKeys.has(key)) duplicatesInFile += 1;
    inFileKeys.add(key);
  }

  return { fresh, duplicates, duplicatesInFile };
}

/**
 * Zeitfenster der Kandidaten — damit der Bestandsabgleich nicht die ganze
 * Tabelle laden muss.
 *
 * `null`, wenn keine Kandidaten vorliegen. Dann ist auch kein Abgleich nötig.
 */
export function dateWindow(
  transactions: readonly ParsedTransaction[],
): { from: Date; to: Date } | null {
  const dates = transactions
    .map((transaction) => transaction.date)
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));

  if (dates.length === 0) return null;

  return {
    from: new Date(Math.min(...dates.map((date) => date.getTime()))),
    to: new Date(Math.max(...dates.map((date) => date.getTime()))),
  };
}

/**
 * Prüfsumme eines Auszugs.
 *
 * Der zweite Schutz neben dem Natural Key: dieselbe Datei ein zweites Mal
 * abzurufen soll gar nicht erst geparst werden. Bei einem täglichen Abruf, der
 * nach einem Fehler wiederholt wird, ist das der Regelfall.
 */
export async function statementChecksum(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
