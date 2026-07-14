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
import { getTenantSettings } from "@/lib/tenant-settings";

const logger = jobLogger.child({ component: "retention" });

const YEARS_TO_MS = (years: number) => years * 365.25 * MS_PER_DAY;

/**
 * Retention-Schwellen pro Model (DEFAULT — pro Tenant überschreibbar via
 * TenantSettings.gobdRetentionYearsInvoice / .gobdRetentionYearsContract).
 *
 * Records deren `deletedAt` älter als diese Frist ist, werden hart gelöscht.
 *
 * Hinweis: Dies sind nur Default-Werte für Stand-alone-Tests und Tenants ohne
 * eigene Settings. Im normalen Lauf werden die Werte über
 * `getRetentionPolicy(tenantId)` aus den TenantSettings geladen.
 */
const RETENTION_POLICY_DEFAULT = {
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

/**
 * CP6: Retention fuer operative Log-Tabellen ohne soft-delete.
 * Diese Tabellen werden nach `createdAt` (nicht `deletedAt`) gepurged, weil
 * sie keinen soft-delete-Flow haben und typischerweise Payloads speichern
 * die keiner GoBD-Aufbewahrung unterliegen.
 *
 *   - WebhookDelivery: 90 Tage — Debug- und Retry-Historie; die Payloads
 *     koennen sensibel sein und muessen nicht laenger aufbewahrt werden.
 */
const CREATED_AT_RETENTION_DAYS: Record<string, number> = {
  WebhookDelivery: 90,
};

/** Models with 10-year retention (GoBD Buchführungs-/Aufzeichnungspflichten). */
type InvoiceRetentionModel = "Invoice" | "IncomingInvoice" | "JournalEntry" | "Quote";
/** Models with 6-year retention (Geschäftsbriefe + operative Verträge). */
type ContractRetentionModel = "Contract" | "Document" | "CrmActivity";

export type RetentionModel = InvoiceRetentionModel | ContractRetentionModel;

export type RetentionPolicy = Record<RetentionModel, number>;

/**
 * Lädt die effektive Retention-Policy für einen Tenant.
 *
 * Die Defaults aus RETENTION_POLICY_DEFAULT werden mit den TenantSettings
 * überschrieben:
 *  - gobdRetentionYearsInvoice → Invoice / IncomingInvoice / JournalEntry / Quote
 *  - gobdRetentionYearsContract → Contract / Document / CrmActivity
 */
export async function getRetentionPolicy(tenantId: string): Promise<RetentionPolicy> {
  const settings = await getTenantSettings(tenantId);
  return {
    Invoice: settings.gobdRetentionYearsInvoice,
    IncomingInvoice: settings.gobdRetentionYearsInvoice,
    JournalEntry: settings.gobdRetentionYearsInvoice,
    Quote: settings.gobdRetentionYearsInvoice,
    Contract: settings.gobdRetentionYearsContract,
    Document: settings.gobdRetentionYearsContract,
    CrmActivity: settings.gobdRetentionYearsContract,
  };
}

/**
 * Models die KEIN soft-delete kennen (haben kein deletedAt-Feld) und
 * deshalb nie vom Retention-Service gepurged werden. Sie sind GoBD-Belege
 * die NIEMALS aus der Datenbank entfernt werden dürfen — auch nach 10
 * Jahren werden sie nicht hart-gelöscht.
 *
 * Falls nach Ablauf der gesetzlichen Frist eine Datenminimierung
 * gewünscht wird, muss das über einen separaten DBA-Workflow erfolgen
 * (z.B. Pseudonymisierung der personenbezogenen Felder unter Beibehaltung
 * der Beleg-Struktur).
 *
 * Liste (Stand 2026-05):
 *   - CashBookEntry (Kassenbuch-Einträge — GoBD §147 10J)
 *   - BankTransaction (Buchungsbelege — GoBD §147 10J)
 *   - DunningRun + DunningItem (Mahnverlauf — Beweisbelege, unbefristet)
 *   - AuditLog (siehe docs/devops/audit-log-hardening.md — separater DB-User)
 *   - JournalEntryLine (Cascade via parent JournalEntry)
 */

export interface RetentionRunResult {
  model: string;
  retentionYears: number;
  cutoffDate: Date;
  deletedCount: number;
  error?: string;
}

/**
 * Führt den Retention-Purge für ein einzelnes Model aus.
 * Wenn tenantId gesetzt, wird der Tenant-Scope auf das Model-Filter angewendet.
 */
async function purgeModel(
  model: RetentionModel,
  retentionYears: number,
  tenantId?: string,
): Promise<RetentionRunResult> {
  const cutoffDate = new Date(Date.now() - YEARS_TO_MS(retentionYears));

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

    const where: Record<string, unknown> = {
      deletedAt: { not: null, lt: cutoffDate },
    };
    if (tenantId) where.tenantId = tenantId;

    const result = await delegate.deleteMany({ where });

    logger.info(
      { model, retentionYears, cutoffDate, tenantId, deletedCount: result.count },
      `Retention purge completed for ${model}`,
    );

    return {
      model,
      retentionYears,
      cutoffDate,
      deletedCount: result.count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, model, retentionYears, cutoffDate, tenantId },
      `Retention purge FAILED for ${model}`,
    );
    return {
      model,
      retentionYears,
      cutoffDate,
      deletedCount: 0,
      error: message,
    };
  }
}

/**
 * Purge fuer Modelle die kein deletedAt-Feld haben (WebhookDelivery et al.).
 * Loeschung erfolgt strikt anhand `createdAt < now() - retentionDays`.
 */
async function purgeCreatedAtModel(
  modelName: string,
  retentionDays: number,
): Promise<RetentionRunResult> {
  const cutoffDate = new Date(Date.now() - retentionDays * MS_PER_DAY);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[
      modelName.charAt(0).toLowerCase() + modelName.slice(1)
    ];
    if (!delegate || typeof delegate.deleteMany !== "function") {
      throw new Error(`Prisma delegate not found for ${modelName}`);
    }
    const result = await delegate.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
    logger.info(
      { model: modelName, retentionDays, cutoffDate, deletedCount: result.count },
      `Retention purge (createdAt) completed for ${modelName}`,
    );
    return {
      model: modelName,
      retentionYears: retentionDays / 365.25,
      cutoffDate,
      deletedCount: result.count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, model: modelName, retentionDays, cutoffDate },
      `Retention purge (createdAt) FAILED for ${modelName}`,
    );
    return {
      model: modelName,
      retentionYears: retentionDays / 365.25,
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
 * - Mit tenantId: pürgt nur diesen Tenant mit dessen Settings-Policy
 *   (gobdRetentionYearsInvoice / .gobdRetentionYearsContract).
 * - Ohne tenantId: pürgt global mit Default-Policy (Backward-Kompatibilität,
 *   gleiche Schwellen für alle Tenants).
 *
 * Aufgerufen aus:
 * - Scheduled Job (retention-cron worker — siehe retention-cron.worker.ts)
 * - Admin-API (/api/admin/retention/run — manuelles Aufräumen)
 */
export async function runRetentionPurge(tenantId?: string): Promise<{
  results: RetentionRunResult[];
  totalDeleted: number;
}> {
  logger.info({ tenantId: tenantId ?? "all" }, "Starting retention purge run");

  const policy: RetentionPolicy = tenantId
    ? await getRetentionPolicy(tenantId)
    : RETENTION_POLICY_DEFAULT;

  const results: RetentionRunResult[] = [];
  for (const model of Object.keys(policy) as RetentionModel[]) {
    results.push(await purgeModel(model, policy[model], tenantId));
  }

  // CP6: createdAt-basierte Retention fuer WebhookDelivery (kein deletedAt).
  // Nicht tenant-scoped — WebhookDelivery haengt an Webhook (tenant-scoped
  // per Cascade), aber der Purge selbst ist rein zeitbasiert und laeuft
  // sicher auch ohne Tenant-Kontext.
  for (const [modelName, days] of Object.entries(CREATED_AT_RETENTION_DAYS)) {
    results.push(await purgeCreatedAtModel(modelName, days));
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

  logger.info(
    { totalDeleted, modelResults: results.length, tenantId: tenantId ?? "all" },
    "Retention purge run completed",
  );

  return { results, totalDeleted };
}
