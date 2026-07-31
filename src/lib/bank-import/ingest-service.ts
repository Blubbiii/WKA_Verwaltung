/**
 * Kontoauszug verarbeiten — die eine Kette für alle Wege.
 *
 * B7 (Audit 2026-07). Diese Datei wird sowohl vom Upload von Hand als auch vom
 * automatischen Abruf benutzt. Zwei Fassungen derselben Dublettenerkennung
 * würden auseinanderdriften, und bei Kontoumsätzen heisst das doppelte
 * Buchungen.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseMt940 } from "@/lib/bank-import/mt940-parser";
import { parseCamt054 } from "@/lib/bank-import/camt054-parser";
import { matchTransactions } from "@/lib/bank-import/matcher";
import { selectNewTransactions, dateWindow } from "@/lib/bank-import/ingest";
import { apiLogger as logger } from "@/lib/logger";

export interface IngestResult {
  imported: number;
  batchId: string;
  matched: number;
  suggested: number;
  unmatched: number;
  /** Übersprungene Dubletten insgesamt. */
  skipped: number;
  /** Davon Wiederholungen innerhalb derselben Datei. */
  duplicatesInFile: number;
  found: number;
}

export class EmptyStatementError extends Error {
  constructor() {
    super("Keine Transaktionen in der Datei gefunden");
    this.name = "EmptyStatementError";
  }
}

/**
 * Auszug parsen, entdoppeln, zuordnen und speichern.
 *
 * `iban` ist das Konto, dem die Umsätze zugeordnet werden. Fehlt es, landen
 * sie unter `UNKNOWN` — das ist bewusst sichtbar und nicht geraten.
 */
export async function ingestStatement(input: {
  content: string;
  fileName: string;
  iban: string | null;
  tenantId: string;
}): Promise<IngestResult> {
  const trimmed = input.content.trimStart();
  const isXml = trimmed.startsWith("<?xml") || trimmed.startsWith("<");
  const transactions = isXml ? parseCamt054(input.content) : parseMt940(input.content);

  if (transactions.length === 0) {
    throw new EmptyStatementError();
  }

  const matches = await matchTransactions(transactions, input.tenantId);

  // Bestandsabgleich nur im Zeitfenster der Kandidaten — sonst lüde jeder
  // Import die ganze Tabelle.
  const window = dateWindow(matches.map((match) => match.transaction));
  const existingRows = window
    ? await prisma.bankTransaction.findMany({
        where: {
          tenantId: input.tenantId,
          bookingDate: { gte: window.from, lte: window.to },
        },
        select: {
          bankReference: true,
          amount: true,
          bookingDate: true,
          counterpartIban: true,
        },
      })
    : [];

  const selection = selectNewTransactions(
    matches,
    (match) => match.transaction,
    existingRows.map((row) => ({
      bankReference: row.bankReference,
      amount: row.amount.toString(),
      bookingDate: row.bookingDate,
      counterpartIban: row.counterpartIban,
    })),
  );

  const batchId = randomUUID().slice(0, 8);
  const now = new Date();

  const created = await prisma.bankTransaction.createMany({
    data: selection.fresh.map((match) => {
      const wasMatched = match.confidence !== "none" && !!match.matchedInvoiceId;
      return {
        tenantId: input.tenantId,
        bankAccountIban: input.iban || "UNKNOWN",
        bookingDate: match.transaction.date,
        amount: match.transaction.amount,
        currency: match.transaction.currency,
        counterpartName: match.transaction.counterpartName || null,
        counterpartIban: match.transaction.counterpartIban || null,
        reference: match.transaction.reference || null,
        bankReference: match.transaction.bankReference || null,
        matchStatus:
          match.confidence === "high"
            ? ("MATCHED" as const)
            : match.confidence === "medium"
              ? ("SUGGESTED" as const)
              : ("UNMATCHED" as const),
        matchedInvoiceId: match.matchedInvoiceId,
        matchConfidence:
          match.confidence === "high" ? 1.0 : match.confidence === "medium" ? 0.6 : null,
        // GoBD-Audit: dokumentiert, dass der Match vom Auto-Matcher kommt.
        // Bei nachträglicher Korrektur muss matchSource auf MANUAL gesetzt und
        // matchedById/matchedAt aktualisiert werden.
        matchSource: wasMatched ? ("AUTO" as const) : null,
        matchedAt: wasMatched ? now : null,
        importBatchId: batchId,
        importFileName: input.fileName,
      };
    }),
  });

  if (selection.duplicates > 0) {
    logger.info(
      {
        tenantId: input.tenantId,
        batchId,
        skipped: selection.duplicates,
        duplicatesInFile: selection.duplicatesInFile,
        imported: created.count,
      },
      "Bank-Import: Duplikate erkannt und übersprungen",
    );
  }

  return {
    imported: created.count,
    batchId,
    matched: selection.fresh.filter((match) => match.confidence === "high").length,
    suggested: selection.fresh.filter((match) => match.confidence === "medium").length,
    unmatched: selection.fresh.filter((match) => match.confidence === "none").length,
    skipped: selection.duplicates,
    duplicatesInFile: selection.duplicatesInFile,
    found: matches.length,
  };
}
