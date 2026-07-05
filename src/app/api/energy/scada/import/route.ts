import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { startImport, isValidFileType } from "@/lib/scada/import-service";
import type { ScadaFileType } from "@/lib/scada/import-service";
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

/**
 * POST /api/energy/scada/import
 *
 * Akzeptiert 2 Payload-Formen (Backwards-Compat für n8n/single-type-Aufrufer):
 *
 *   Single-Type (Legacy):
 *     { locationCode, fileType: "WSD", basePath }
 *     → 202 { id, status: "RUNNING" }
 *
 *   Bulk (Sprint 2 des Refactors — strukturelle Lösung des 24×-400-Problems):
 *     { locationCode, fileTypes: ["WSD", "UID", ...], basePath }
 *     → 202 { jobs: [{id, fileType, status: "RUNNING"}, ...], skipped: [{fileType, reason}, ...] }
 *
 *  Wenn ein einzelner Type in der Bulk-Anfrage Validation-Errors hat (schon
 *  laufend, unbekannter Type), wird er in `skipped[]` gemeldet — die anderen
 *  starten trotzdem. Kein 400 mehr für die ganze Anfrage bei einem einzelnen
 *  Type-Fehler.
 */

/** Startet einen einzelnen Import + Fire-and-Forget-Job. Interne Helper-Fn. */
async function launchImportForType(
  tenantId: string,
  locationCode: string,
  fileType: ScadaFileType,
  basePath: string,
): Promise<{ id: string; fileType: ScadaFileType; status: "RUNNING" }> {
  const log = await prisma.scadaImportLog.create({
    data: { tenantId, locationCode, fileType, status: "RUNNING" },
  });

  startImport({
    tenantId,
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

  return { id: log.id, fileType, status: "RUNNING" };
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:scada:import");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { locationCode, fileType, fileTypes, basePath } = body as {
      locationCode?: unknown;
      fileType?: unknown;
      fileTypes?: unknown;
      basePath?: unknown;
    };

    // --- Common-Validation (gilt für beide Modi) ---

    if (!locationCode || typeof locationCode !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich" });
    }

    if (!locationCode.startsWith("Loc_")) {
      return apiError("BAD_REQUEST", undefined, { message: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" });
    }

    if (!basePath || typeof basePath !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "basePath ist erforderlich (z.B. 'C:\\Enercon')" });
    }

    if (basePath.includes("..") || basePath.includes("\0")) {
      return apiError("FORBIDDEN", 400, { message: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" });
    }

    const tenantId = check.tenantId!;

    // --- Bulk-Modus (fileTypes[]) ---

    if (Array.isArray(fileTypes)) {
      if (fileTypes.length === 0) {
        return apiError("BAD_REQUEST", undefined, { message: "fileTypes[] darf nicht leer sein" });
      }
      if (fileTypes.length > 30) {
        // Max ~27 gültige Types + Puffer — sonst DDoS-Vektor
        return apiError("BAD_REQUEST", undefined, { message: "Zu viele fileTypes (max. 30)" });
      }

      // Vorab-Validierung aller Types + Duplikat-Check
      const uniqueTypes = Array.from(new Set(fileTypes.map((t) => String(t))));
      const invalid = uniqueTypes.filter((t) => !isValidFileType(t));
      if (invalid.length > 0) {
        return apiError("VALIDATION_FAILED", undefined, {
          message: `Ungültige fileTypes: ${invalid.join(", ")}`,
        });
      }
      const validTypes = uniqueTypes as ScadaFileType[];

      // Skip bereits laufende Imports pro Type — kein CONFLICT auf Bulk-Ebene,
      // sondern per-Type im skipped[]-Array.
      const running = await prisma.scadaImportLog.findMany({
        where: {
          tenantId,
          locationCode,
          fileType: { in: validTypes },
          status: "RUNNING",
        },
        select: { fileType: true, id: true },
      });
      const runningSet = new Map(running.map((r) => [r.fileType, r.id]));

      const skipped: Array<{ fileType: string; reason: string; existingId?: string }> = [];
      const toLaunch: ScadaFileType[] = [];
      for (const t of validTypes) {
        const existing = runningSet.get(t);
        if (existing) {
          skipped.push({ fileType: t, reason: "already-running", existingId: existing });
        } else {
          toLaunch.push(t);
        }
      }

      // Alle Jobs parallel starten (die einzelnen createImportLog-Aufrufe sind
      // unabhängig — kein Nutzen einer Transaktion, würde nur Locking bringen).
      const jobs = await Promise.all(
        toLaunch.map((t) => launchImportForType(tenantId, locationCode, t, basePath)),
      );

      return NextResponse.json({ jobs, skipped }, { status: 202 });
    }

    // --- Legacy Single-Type-Modus (Backwards-Compat für n8n etc.) ---

    if (!fileType || typeof fileType !== "string" || !isValidFileType(fileType)) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "fileType ungültig oder fehlt. Alternativ fileTypes: [...] verwenden.",
      });
    }

    const runningImport = await prisma.scadaImportLog.findFirst({
      where: { tenantId, locationCode, fileType, status: "RUNNING" },
    });

    if (runningImport) {
      return apiError("CONFLICT", undefined, {
        message: "Import läuft bereits",
        details: `Für ${locationCode} (${fileType}) läuft bereits ein Import (ID: ${runningImport.id})`,
      });
    }

    const job = await launchImportForType(tenantId, locationCode, fileType, basePath);

    return NextResponse.json({ id: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Starten des SCADA-Imports");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Starten des SCADA-Imports" });
  }
}
