import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import { cancelImport } from "@/lib/scada/import-stale";

// =============================================================================
// GET /api/energy/scada/import/[id] - Status eines einzelnen Import-Logs
// Wird vom Frontend per Polling abgefragt, um den Fortschritt anzuzeigen
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const log = await prisma.scadaImportLog.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!log) {
      return apiError("NOT_FOUND", undefined, { message: "Import-Log nicht gefunden" });
    }

    return NextResponse.json(log);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des Import-Logs");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Import-Logs" });
  }
}

// =============================================================================
// DELETE /api/energy/scada/import/[id] - Laufenden Import abbrechen
//
// FIX P1-7: Bisher gab es keinen Weg, einen hängenden RUNNING-Import loszuwerden —
// er blockierte jeden Folgeimport (manuell: CONFLICT, Auto-Import: stiller Skip).
// Der Abbruch ist kooperativ: der Log geht auf CANCELLED, die Datei-Schleife in
// startImport() prüft das zwischen zwei Dateien und bricht ab. Ein hartes Beenden
// des laufenden Promise ist in Node nicht möglich.
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:scada:import");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const log = await prisma.scadaImportLog.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, status: true, startedAt: true },
    });

    if (!log) {
      return apiError("NOT_FOUND", undefined, { message: "Import-Log nicht gefunden" });
    }

    if (log.status !== "RUNNING") {
      return apiError("BAD_REQUEST", undefined, {
        message: "Nur laufende Imports können abgebrochen werden",
        details: `Aktueller Status: ${log.status}`,
      });
    }

    const reason = await request
      .json()
      .then((b: unknown) =>
        b && typeof b === "object" && "reason" in b && typeof b.reason === "string"
          ? b.reason.slice(0, 500)
          : undefined,
      )
      .catch(() => undefined);

    const cancelled = await cancelImport(check.tenantId!, id, reason);

    if (!cancelled) {
      return apiError("CONFLICT", undefined, {
        message: "Import konnte nicht abgebrochen werden — Status hat sich zwischenzeitlich geändert",
      });
    }

    logger.info({ importLogId: id, reason }, "SCADA-Import abgebrochen");

    return NextResponse.json({
      id,
      status: "CANCELLED",
      message:
        "Import wurde abgebrochen. Ein noch laufender Verarbeitungsschritt wird nach der aktuellen Datei beendet.",
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Abbrechen des Import-Logs");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Abbrechen des Imports" });
  }
}
