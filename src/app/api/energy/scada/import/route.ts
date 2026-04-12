import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { startImport, isValidFileType } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/scada/import - Liste der Import-Logs
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const logs = await prisma.scadaImportLog.findMany({
      where: {
        tenantId: check.tenantId!,
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json({ data: logs });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Import-Logs");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Import-Logs" });
  }
}

// =============================================================================
// POST /api/energy/scada/import - Neuen SCADA-Import starten
// Erstellt einen Import-Log Eintrag und startet den Import asynchron
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:scada:import");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { locationCode, fileType, basePath } = body;

    // --- Validierung ---

    if (!locationCode || typeof locationCode !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich" });
    }

    if (!locationCode.startsWith("Loc_")) {
      return apiError("BAD_REQUEST", undefined, { message: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" });
    }

    if (!fileType || !isValidFileType(fileType)) {
      return apiError("VALIDATION_FAILED", undefined, { message: "fileType ungültig. Erlaubt: WSD, UID, AVR, AVW, AVM, AVY, SSM, SWM, PES, PEW, PET, WSR, WSW, WSM, WSY" });
    }

    if (!basePath || typeof basePath !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "basePath ist erforderlich (z.B. 'C:\\Enercon')" });
    }

    // Sicherheitsprüfung
    if (basePath.includes("..") || basePath.includes("\0")) {
      return apiError("FORBIDDEN", 400, { message: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" });
    }

    // Prüfung: Läuft bereits ein Import für diesen Standort?
    const runningImport = await prisma.scadaImportLog.findFirst({
      where: {
        tenantId: check.tenantId!,
        locationCode,
        fileType,
        status: "RUNNING",
      },
    });

    if (runningImport) {
      return apiError("CONFLICT", undefined, { message: "Import läuft bereits", details: `Für ${locationCode} (${fileType}) läuft bereits ein Import (ID: ${runningImport.id})` });
    }

    // Import-Log Eintrag erstellen
    const log = await prisma.scadaImportLog.create({
      data: {
        tenantId: check.tenantId!,
        locationCode,
        fileType,
        status: "RUNNING",
      },
    });

    // Fire-and-forget: Import im Hintergrund starten
    startImport({
      tenantId: check.tenantId!,
      locationCode,
      fileType,
      basePath,
      importLogId: log.id,
    }).catch(async (err: unknown) => {
      logger.error({ err }, `SCADA-Import fehlgeschlagen (Log: ${log.id})`);
      await prisma.scadaImportLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorDetails: { message: String(err) },
        },
      });
    });

    return NextResponse.json(
      { id: log.id, status: "RUNNING" },
      { status: 202 }
    );
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Starten des SCADA-Imports");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Starten des SCADA-Imports" });
  }
}
