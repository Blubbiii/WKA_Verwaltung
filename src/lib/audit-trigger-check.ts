/**
 * P1-2: Verifiziert beim App-Start, ob die Audit-Log Append-Only Trigger
 * aktiv sind. Bei Fehlen → logger.warn (kein Throw, App startet trotzdem).
 *
 * Trigger werden NICHT durch `prisma db push` erstellt — sie müssen
 * manuell deployed werden via:
 *   docker exec -i windparkmanager-postgres-1 psql -U wpm -d windparkmanager \
 *     < prisma/migrations/manual/audit_log_hardening.sql
 */

import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

let checked = false;

export async function checkAuditLogTrigger(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const r = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgname IN ('audit_logs_no_update','audit_logs_no_delete')`
    );
    if (r.length < 2) {
      logger.warn(
        { found: r.map((x) => x.tgname), expected: ["audit_logs_no_update", "audit_logs_no_delete"] },
        "[SECURITY] Audit-Log Append-Only Trigger fehlt — GoBD §147 nicht erfüllt. Deploy: prisma/migrations/manual/audit_log_hardening.sql"
      );
    } else {
      logger.info("[SECURITY] Audit-Log Append-Only Trigger aktiv");
    }
  } catch (err) {
    logger.warn({ err }, "[SECURITY] Audit-Log Trigger-Check fehlgeschlagen");
  }
}
