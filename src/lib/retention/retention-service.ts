/**
 * GoBD Retention Policy Service
 *
 * Hart-löscht soft-deleted Records (`deletedAt IS NOT NULL`) nachdem
 * die gesetzliche Aufbewahrungsfrist abgelaufen ist. GoBD + HGB §257
 * sagen in DE:
 *
 * - **10 Jahre:** Rechnungen, Kontoauszüge, Buchungsbelege, Jahresabschlüsse
 *   → Invoice, IncomingInvoice, JournalEntry, Quote
 * - **6 Jahre:**  Geschäftsbriefe, Handelsbriefe, Verträge (sofern sie
 *   nicht unter die 10-Jahre-Pflicht fallen)
 *   → Contract, Document (Geschäftsbriefe), CrmActivity
 *
 * Vor Ablauf der Frist dürfen wir NICHT hart löschen (selbst wenn der
 * User den soft-delete ausgelöst hat). Nach Ablauf MÜSSEN wir löschen
 * bzw. dürfen löschen (DSGVO-konforme Datenminimierung).
 *
 * Dieser Service läuft idempotent — mehrfache Ausführung ist sicher.
 */

import { prisma } from "@/lib/prisma";
import { jobLogger } from "@/lib/logger";
import { MS_PER_DAY } from "@/lib/constants/time";

const logger = jobLogger.child({ component: "retention" });

const YEARS_TO_MS = (years: number) => years * 365.25 * MS_PER_DAY;

/**
 * Retention-Schwellen pro Model. Records deren `deletedAt`
 * älter als diese Frist ist, werden hart gelöscht.
 */
const RETENTION_POLICY = {
  // 10 Jahre — GoBD Buchführungs- und Aufzeichnungspflichten
  Invoice: 10,
  IncomingInvoice: 10,
  JournalEntry: 10,
  Quote: 10,
  // 6 Jahre — Geschäftsbriefe und operative Verträge
  Contract: 6,
  Document: 6,
  CrmActivity: 6,
} as const;

export interface RetentionRunResult {
  model: string;
  retentionYears: number;
  cutoffDate: Date;
  deletedCount: number;
  error?: string;
}

/**
 * Führt den Retention-Purge für ein einzelnes Model aus.
 */
async function purgeModel(
  model: keyof typeof RETENTION_POLICY,
): Promise<RetentionRunResult> {
  const years = RETENTION_POLICY[model];
  const cutoffDate = new Date(Date.now() - YEARS_TO_MS(years));

  try {
    // Prisma deleteMany auf dem entsprechenden Model. Der Model-Accessor
    // muss dynamisch sein weil wir über mehrere Modelle iterieren.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];

    if (!delegate || typeof delegate.deleteMany !== "function") {
      throw new Error(`Prisma delegate not found for ${model}`);
    }

    const result = await delegate.deleteMany({
      where: {
        deletedAt: { not: null, lt: cutoffDate },
      },
    });

    logger.info(
      { model, retentionYears: years, cutoffDate, deletedCount: result.count },
      `Retention purge completed for ${model}`,
    );

    return {
      model,
      retentionYears: years,
      cutoffDate,
      deletedCount: result.count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, model, retentionYears: years, cutoffDate },
      `Retention purge FAILED for ${model}`,
    );
    return {
      model,
      retentionYears: years,
      cutoffDate,
      deletedCount: 0,
      error: message,
    };
  }
}

/**
 * Führt den Retention-Purge für alle konfigurierten Modelle aus.
 * Idempotent — mehrfache Ausführung ist safe.
 *
 * Aufgerufen aus:
 * - Scheduled Job (reminder/retention worker cron)
 * - Admin-API (manuelles Aufräumen)
 */
export async function runRetentionPurge(): Promise<{
  results: RetentionRunResult[];
  totalDeleted: number;
}> {
  logger.info("Starting retention purge run");

  const results: RetentionRunResult[] = [];
  for (const model of Object.keys(RETENTION_POLICY) as Array<
    keyof typeof RETENTION_POLICY
  >) {
    results.push(await purgeModel(model));
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

  logger.info(
    { totalDeleted, modelResults: results.length },
    "Retention purge run completed",
  );

  return { results, totalDeleted };
}
