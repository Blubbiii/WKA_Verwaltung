/**
 * Admin-Endpoint: Retention Policy Run
 *
 * Löst die GoBD-konforme Hard-Deletion aller soft-deleted Records aus
 * deren deletedAt älter als die gesetzliche Aufbewahrungsfrist ist.
 *
 * POST /api/admin/retention/run
 *
 * Idempotent — mehrfache Ausführung ist safe. Kann manuell (Admin-UI)
 * oder extern via cron/systemd-timer aufgerufen werden. Empfohlen:
 * einmal pro Woche oder Monat.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { runRetentionPurge } from "@/lib/retention/retention-service";

export async function POST() {
  try {
    // Nur ADMIN+ darf Retention triggern — hart-löschen ist irreversibel
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    logger.info({ userId: check.userId }, "Manual retention purge triggered");

    const result = await runRetentionPurge();

    return NextResponse.json({
      totalDeleted: result.totalDeleted,
      results: result.results,
    });
  } catch (error) {
    logger.error({ err: error }, "Retention purge failed");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Retention purge fehlgeschlagen",
    });
  }
}
