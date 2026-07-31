/**
 * B7: Dublettenerkennung beim Kontoauszug.
 *
 * Beim taeglichen automatischen Abruf ueberlappen sich die Auszuege
 * regelmaessig. Wenn die Erkennung hier danebengeht, entstehen doppelte
 * Buchungen — und die fallen erst beim Kontenabgleich auf.
 */

import { describe, it, expect } from "vitest";
import {
  transactionKey,
  selectNewTransactions,
  dateWindow,
  statementChecksum,
  type ParsedTransaction,
  type ExistingTransaction,
} from "./ingest";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function tx(partial: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    bankReference: "REF-1",
    amount: 1000,
    date: d("2026-03-01"),
    counterpartIban: "DE02120300000000202051",
    ...partial,
  };
}

function existing(partial: Partial<ExistingTransaction>): ExistingTransaction {
  return {
    bankReference: "REF-1",
    amount: "1000",
    bookingDate: d("2026-03-01"),
    counterpartIban: "DE02120300000000202051",
    ...partial,
  };
}

describe("Natural Key", () => {
  it("beide Seiten bilden denselben Schluessel", () => {
    // Zwei Fassungen davon waeren zwei Dublettenerkennungen.
    const fromCandidate = transactionKey(tx({}));
    const fromExisting = transactionKey({
      bankReference: "REF-1",
      amount: "1000",
      date: d("2026-03-01"),
      counterpartIban: "DE02120300000000202051",
    });
    expect(fromCandidate).toBe(fromExisting);
  });

  it("Leerraum wird entfernt", () => {
    expect(transactionKey(tx({ bankReference: "  REF-1  " }))).toBe(transactionKey(tx({})));
  });

  it("fehlende Bankreferenz macht den Schluessel nicht unbrauchbar", () => {
    // Nicht jede Bank liefert sie — Betrag, Datum und Gegen-IBAN tragen dann.
    const a = transactionKey(tx({ bankReference: null }));
    const b = transactionKey(tx({ bankReference: null, amount: 2000 }));
    expect(a).not.toBe(b);
  });

  it("ein anderer Betrag ist eine andere Buchung", () => {
    expect(transactionKey(tx({ amount: 1000 }))).not.toBe(transactionKey(tx({ amount: 1000.01 })));
  });
});

describe("Auswahl neuer Buchungen", () => {
  const extract = (t: ParsedTransaction) => t;

  it("laesst durch, was neu ist", () => {
    const result = selectNewTransactions([tx({})], extract, []);
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toBe(0);
  });

  it("filtert, was im Bestand schon steht", () => {
    const result = selectNewTransactions([tx({})], extract, [existing({})]);
    expect(result.fresh).toHaveLength(0);
    expect(result.duplicates).toBe(1);
  });

  it("filtert Wiederholungen INNERHALB derselben Datei", () => {
    // Beim taeglichen Abruf ueberlappen sich Auszuege — das ist der
    // Normalfall, nicht die Ausnahme.
    const result = selectNewTransactions([tx({}), tx({}), tx({ amount: 500 })], extract, []);
    expect(result.fresh).toHaveLength(2);
    expect(result.duplicatesInFile).toBe(1);
  });

  it("zaehlt Dubletten im Bestand und in der Datei getrennt", () => {
    // Die eine Zahl sagt etwas ueber den Auszug, die andere ueber den
    // Abrufrhythmus.
    const result = selectNewTransactions(
      [tx({}), tx({}), tx({ amount: 500 })],
      extract,
      [existing({ amount: "500" })],
    );
    expect(result.duplicatesInFile).toBe(1);
    expect(result.duplicates).toBe(2);
    expect(result.fresh).toHaveLength(1);
  });

  it("eine Buchung mit gleichem Betrag am selben Tag, aber anderer Referenz, bleibt", () => {
    // Zwei echte Zahlungen desselben Betrags am selben Tag sind moeglich.
    const result = selectNewTransactions(
      [tx({ bankReference: "REF-2" })],
      extract,
      [existing({ bankReference: "REF-1" })],
    );
    expect(result.fresh).toHaveLength(1);
  });
});

describe("Zeitfenster", () => {
  it("umspannt alle Kandidaten", () => {
    const window = dateWindow([
      tx({ date: d("2026-03-05") }),
      tx({ date: d("2026-03-01") }),
      tx({ date: d("2026-03-31") }),
    ]);
    expect(window).toEqual({ from: d("2026-03-01"), to: d("2026-03-31") });
  });

  it("ist null ohne Kandidaten", () => {
    // Dann ist auch kein Bestandsabgleich noetig.
    expect(dateWindow([])).toBeNull();
  });

  it("ignoriert ungueltige Datumsangaben", () => {
    const window = dateWindow([tx({ date: new Date("kaputt") }), tx({ date: d("2026-03-01") })]);
    expect(window).toEqual({ from: d("2026-03-01"), to: d("2026-03-01") });
  });
});

describe("Pruefsumme des Auszugs", () => {
  it("gleicher Inhalt, gleiche Summe", async () => {
    // Der zweite Schutz: dieselbe Datei soll gar nicht erst geparst werden.
    expect(await statementChecksum(":20:AUSZUG\n:61:2603010301C1000,00")).toBe(
      await statementChecksum(":20:AUSZUG\n:61:2603010301C1000,00"),
    );
  });

  it("ein geaendertes Zeichen aendert die Summe", async () => {
    const a = await statementChecksum(":20:AUSZUG\n:61:2603010301C1000,00");
    const b = await statementChecksum(":20:AUSZUG\n:61:2603010301C1000,01");
    expect(a).not.toBe(b);
  });
});
