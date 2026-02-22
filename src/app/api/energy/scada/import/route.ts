import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { startImport, isValidFileType } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/import - Liste der Import-Logs
// =============================================================================

export async function GET(request: NextRequest) {
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Import-Logs" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "locationCode ist erforderlich" },
        { status: 400 }
      );
    }

    if (!locationCode.startsWith("Loc_")) {
      return NextResponse.json(
        { error: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" },
        { status: 400 }
      );
    }

    if (!fileType || !isValidFileType(fileType)) {
      return NextResponse.json(
        { error: "fileType ungueltig. Erlaubt: WSD, UID, AVR, AVW, AVM, AVY, SSM, SWM, PES, PEW, PET, WSR, WSW, WSM, WSY" },
        { status: 400 }
      );
    }

    if (!basePath || typeof basePath !== "string") {
      return NextResponse.json(
        { error: "basePath ist erforderlich (z.B. 'C:\\Enercon')" },
        { status: 400 }
      );
    }

    // Sicherheitspruefung
    if (basePath.includes("..") || basePath.includes("\0")) {
      return NextResponse.json(
        { error: "Ungueltiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" },
        { status: 400 }
      );
    }

    // Pruefung: Laeuft bereits ein Import fuer diesen Standort?
    const runningImport = await prisma.scadaImportLog.findFirst({
      where: {
        tenantId: check.tenantId!,
        locationCode,
        fileType,
        status: "RUNNING",
      },
    });

    if (runningImport) {
      return NextResponse.json(
        {
          error: "Import laeuft bereits",
          details: `Fuer ${locationCode} (${fileType}) laeuft bereits ein Import (ID: ${runningImport.id})`,
        },
        { status: 409 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Starten des SCADA-Imports" },
      { status: 500 }
    );
  }
}
