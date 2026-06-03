import { prisma } from "@/lib/prisma";
import { dbLogger as logger } from "@/lib/logger";

/**
 * Verifies that the audit_logs append-only PostgreSQL triggers are installed.
 *
 * Hintergrund: GoBD §146/§147 AO verlangt einen Manipulationsschutz fuer
 * Audit-Logs. Der Schutz wird durch zwei Trigger erreicht
 * (`audit_logs_no_update`, `audit_logs_no_delete`), die per manueller
 * Migration deployt werden muessen (`prisma/migrations/manual/audit_log_hardening.sql`).
 *
 * Diese Funktion prueft beim App-Boot, ob die Trigger existieren — falls
 * nicht, wird eine WARN-Log-Zeile ausgegeben, sodass das DevOps-Team den
 * Migration-Schritt manuell nachholen kann.
 *
 * Wirft KEINE Exception — fehlende Trigger blockieren den App-Boot nicht.
 * Verbindungsfehler werden ebenfalls nur geloggt.
 */
export async function checkAuditLogTrigger(): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgname IN ('audit_logs_no_update','audit_logs_no_delete')`
    );

    const found = rows.map((r) => r.tgname);
    if (found.length < 2) {
      logger.warn(
        { found, expected: ["audit_logs_no_update", "audit_logs_no_delete"] },
        "[SECURITY] Audit-Log Append-Only Trigger fehlt — siehe prisma/migrations/manual/audit_log_hardening.sql (GoBD §146/§147 AO)"
      );
      return;
    }

    logger.info(
      { triggers: found },
      "[SECURITY] Audit-Log Append-Only Trigger aktiv"
    );
  } catch (err) {
    logger.warn(
      { err },
      "[SECURITY] Audit-Log Trigger-Check fehlgeschlagen — pruefe DB-Verbindung"
    );
  }
}
