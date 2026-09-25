/**
 * Periodensperre (Phase 9 — GoBD §146 AO).
 *
 * Schließt einen Monat. Solange er gesperrt ist, prüfen die Aufrufer
 * (Rechnung anlegen, Rechnung stornieren, Zahlung erfassen) das Belegdatum
 * gegen die Sperre.
 *
 * Audit-Trail über AccountingPeriodLock-Zeilen (lockedAt/By, unlockedAt/By, reason).
 * Unlock ist möglich (Korrektur-Fall), wird aber im selben Record vermerkt.
 */

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
