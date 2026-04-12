import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/auth/apiKeyAuth";
import { scanAllFileTypes, startImport, isValidFileType, type ScadaFileType } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const triggerSchema = z.object({
  locationCode: z.string().regex(/^Loc_\d+$/, "Ungültiger Location-Code"),
  fileTypes: z.array(z.string()).optional(),
});

// =============================================================================
// POST /api/energy/scada/n8n/trigger
// Scans a location for available SCADA file types and starts imports.
// Auth: API key (SCADA_API_KEY env var)
//
// Body JSON:
//   - locationCode: string (e.g. "Loc_5842")
//   - fileTypes?: string[] (optional filter, e.g. ["WSD", "UID"])
//
// If fileTypes is omitted, all detected file types are imported.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiKey(request);
    if (!auth.authorized) return auth.error;

    const scadaBasePath = process.env.SCADA_BASE_PATH;
    if (!scadaBasePath) {
      return apiError("INTERNAL_ERROR", undefined, { message: "SCADA_BASE_PATH ist nicht konfiguriert" });
    }

    const body = await request.json();
    const result = triggerSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }
    const { locationCode, fileTypes: requestedTypes } = result.data;

    // Scan for available file types at this location
    const availableTypes = await scanAllFileTypes(scadaBasePath, locationCode);

    if (availableTypes.length === 0) {
      return NextResponse.json({
        locationCode,
        message: "Keine SCADA-Dateien gefunden",
        imports: [],
      });
    }

    // Filter to requested types or import all
    let typesToImport = availableTypes;
    if (requestedTypes && Array.isArray(requestedTypes) && requestedTypes.length > 0) {
      const requestedSet = new Set(requestedTypes.map((t: string) => t.toUpperCase()));
      typesToImport = availableTypes.filter((ft) => requestedSet.has(ft.fileType));
    }

    const imports: Array<{
      fileType: string;
      importId: string;
      fileCount: number;
      status: string;
    }> = [];

    for (const ft of typesToImport) {
      if (!isValidFileType(ft.fileType as ScadaFileType)) continue;

      // Check for already running import
      const running = await prisma.scadaImportLog.findFirst({
        where: {
          tenantId: auth.tenantId,
          locationCode,
          fileType: ft.fileType,
          status: "RUNNING",
        },
      });

      if (running) {
        imports.push({
          fileType: ft.fileType,
          importId: running.id,
          fileCount: ft.fileCount,
          status: "ALREADY_RUNNING",
        });
        continue;
      }

      // Create import log
      const log = await prisma.scadaImportLog.create({
        data: {
          tenantId: auth.tenantId,
          locationCode,
          fileType: ft.fileType,
          status: "RUNNING",
          filesTotal: ft.fileCount,
        },
      });

      // Fire-and-forget import
      startImport({
        tenantId: auth.tenantId,
        locationCode,
        fileType: ft.fileType as ScadaFileType,
        basePath: scadaBasePath,
        importLogId: log.id,
      }).catch(async (err: unknown) => {
        logger.error({ err }, `n8n SCADA-Import fehlgeschlagen (Log: ${log.id})`);
        await prisma.scadaImportLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorDetails: { message: String(err) },
          },
        });
      });

      imports.push({
        fileType: ft.fileType,
        importId: log.id,
        fileCount: ft.fileCount,
        status: "STARTED",
      });
    }

    logger.info(
      { locationCode, imports: imports.length },
      `n8n SCADA trigger: ${imports.length} imports started for ${locationCode}`,
    );

    return NextResponse.json({
      locationCode,
      imports,
      totalFileTypes: availableTypes.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim n8n SCADA-Trigger");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Starten der SCADA-Importe" });
  }
}
