/**
 * Periodensperre (Phase 9 — GoBD §146 AO).
 *
 * Schließt einen Buchungsmonat. Solange die Period gelockt ist:
 * - kein neuer JournalEntry mit entryDate im Lock-Monat
 * - kein DRAFT → POSTED Übergang für Entries im Lock-Monat
 * - kein Storno (Reverse) das in den Lock-Monat bucht
 *
 * Audit-Trail über AccountingPeriodLock-Zeilen (lockedAt/By, unlockedAt/By, reason).
 * Unlock ist möglich (Korrektur-Fall), wird aber im selben Record vermerkt.
 *
 * Storno (reverseJournalEntry) erzeugt eine Spiegelbuchung mit getauschten
 * soll/haben-Beträgen, neue Buchung selbst ist POSTED + verlinkt mit Original.
 * Original bleibt unverändert (GoBD §146 Abs. 4 — Unveränderbarkeit).
 */

import { JournalEntryStatus, PostingSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TxClient } from "@/lib/invoices/numberGenerator";

/** Thrown when a write hits a locked period. Caller converts to apiError("PERIOD_LOCKED", 409). */
export class PeriodLockedError extends Error {
  readonly periodYear: number;
  readonly periodMonth: number;

  constructor(periodYear: number, periodMonth: number) {
    super(
      `Buchungsperiode ${periodYear}-${String(periodMonth).padStart(2, "0")} ist gesperrt`,
    );
    this.name = "PeriodLockedError";
    this.periodYear = periodYear;
    this.periodMonth = periodMonth;
  }
}

/**
 * Wirft PeriodLockedError wenn der Monat von `bookingDate` für den Tenant
 * geschlossen ist. Liest aus AccountingPeriodLock + prüft unlockedAt IS NULL
 * (unlocked Records gelten nicht mehr als Sperre).
 *
 * Kann sowohl mit Top-Level-prisma als auch innerhalb einer Transaktion
 * aufgerufen werden — wenn ein `tx` übergeben wird, läuft die Query in
 * dessen Snapshot (verhindert Race zwischen Lock-Anlage und Buchung).
 */
export async function assertPeriodOpen(
  tenantId: string,
  bookingDate: Date,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  const periodYear = bookingDate.getUTCFullYear();
  const periodMonth = bookingDate.getUTCMonth() + 1;

  const lock = await client.accountingPeriodLock.findUnique({
    where: {
      tenantId_periodYear_periodMonth: { tenantId, periodYear, periodMonth },
    },
    select: { id: true, unlockedAt: true },
  });

  if (lock && lock.unlockedAt === null) {
    throw new PeriodLockedError(periodYear, periodMonth);
  }
}

/**
 * Erzeugt die Storno-Buchung für einen POSTED JournalEntry. Original bleibt
 * unverändert (GoBD-Unveränderbarkeit), neue Buchung hat invertierte
 * soll/haben-Beträge und ist via reversesJournalEntryId verlinkt.
 *
 * Caller MUSS in einer eigenen $transaction laufen — der Helper macht KEINEN
 * eigenen $transaction-Wrap, damit er in größere Transaktionen komponiert werden
 * kann (z.B. Storno + nachgelagerte Buchung).
 *
 * Wirft:
 * - NotFoundError wenn Original nicht existiert oder zu anderem Tenant gehört
 * - Error wenn Original noch DRAFT ist (DRAFT kann direkt gelöscht werden)
 * - Error wenn Original bereits storniert wurde
 * - PeriodLockedError wenn entryDate des Stornos (= heute) in gesperrtem Monat
 */
export async function reverseJournalEntry(
  tx: TxClient,
  params: {
    tenantId: string;
    originalEntryId: string;
    userId: string;
    reason: string;
    /** Optional: Storno-Datum. Default = jetzt. */
    reversalDate?: Date;
  },
): Promise<{ originalId: string; reversalId: string }> {
  const reversalDate = params.reversalDate ?? new Date();

  // Period-Gate für das Storno-Datum (nicht für die Original-Periode — die
  // bleibt geschlossen, das Storno bucht in den AKTUELLEN offenen Monat).
  await assertPeriodOpen(params.tenantId, reversalDate, tx);

  const original = await tx.journalEntry.findUnique({
    where: { id: params.originalEntryId },
    include: {
      lines: true,
      reversedBy: { select: { id: true } },
    },
  });

  if (!original || original.deletedAt !== null) {
    const err = new Error("Original-Buchung nicht gefunden");
    err.name = "EntityNotFoundError";
    throw err;
  }

  if (original.tenantId !== params.tenantId) {
    const err = new Error("Original-Buchung gehört zu anderem Mandanten");
    err.name = "TenantMismatchError";
    throw err;
  }

  if (original.status !== JournalEntryStatus.POSTED) {
    const err = new Error(
      `Storno nur für gebuchte (POSTED) Buchungen möglich. Aktueller Status: ${original.status}`,
    );
    err.name = "InvalidStateError";
    throw err;
  }

  if (original.reversedBy) {
    const err = new Error("Buchung wurde bereits storniert");
    err.name = "AlreadyReversedError";
    throw err;
  }

  // Storno-Buchung anlegen: gleiche Konten, soll/haben getauscht.
  const reversal = await tx.journalEntry.create({
    data: {
      tenantId: params.tenantId,
      entryDate: reversalDate,
      description: `Storno: ${original.description}`.slice(0, 200),
      reference: original.reference,
      status: JournalEntryStatus.POSTED,
      source: PostingSource.MANUAL,
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      createdById: params.userId,
      reversesJournalEntryId: original.id,
      reversalReason: params.reason.slice(0, 500),
      lines: {
        create: original.lines.map((line) => ({
          lineNumber: line.lineNumber,
          account: line.account,
          accountName: line.accountName,
          description: line.description
            ? `Storno: ${line.description}`.slice(0, 200)
            : null,
          // Hier ist der Kern der Generalumkehr: soll und haben getauscht.
          debitAmount: line.creditAmount,
          creditAmount: line.debitAmount,
          taxKey: line.taxKey,
          costCenter: line.costCenter,
        })),
      },
    },
  });

  return { originalId: original.id, reversalId: reversal.id };
}
