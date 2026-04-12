import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { scanAllLocations } from "@/lib/scada/dbf-reader";
import { scanAllFileTypes } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";
import * as path from "path";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// POST /api/energy/scada/scan - SCADA-Quellordner scannen
// Scannt den SCADA-Basisordner und liefert gefundene Standorte zurück
//
// Body: { basePath: string }
//   -> Scannt alle Loc_XXXX Ordner unter basePath
//
// Body: { basePath: string, locationCode: string }
//   -> Scannt einen spezifischen Standort und liefert alle verfügbaren Dateitypen
// =============================================================================

// GET /api/energy/scada/scan - Returns configured default scan path
export async function GET() {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const defaultPath = process.env.SCADA_BASE_PATH || "";
    return NextResponse.json({ defaultPath });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des SCADA-Pfads");
    return NextResponse.json({ defaultPath: "" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { locationCode } = body;
    // Use provided basePath, fall back to SCADA_BASE_PATH env
    const basePath = body.basePath || process.env.SCADA_BASE_PATH;

    // --- Validierung ---

    if (!basePath || typeof basePath !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "basePath ist erforderlich (z.B. '/data/scada') oder SCADA_BASE_PATH muss gesetzt sein" });
    }

    // Minimale Sicherheitsprüfung: Pfad darf keine gefaehrlichen Zeichen enthalten
    if (basePath.includes("..") || basePath.includes("\0")) {
      return apiError("FORBIDDEN", 400, { message: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" });
    }

    // Security: Restrict scanning to SCADA_BASE_PATH if configured
    const scadaBasePath = process.env.SCADA_BASE_PATH;
    if (scadaBasePath) {
      const allowedBase = path.resolve(scadaBasePath);
      const normalizedInput = path.resolve(basePath);
      if (!normalizedInput.startsWith(allowedBase + path.sep) && normalizedInput !== allowedBase) {
        return apiError("FORBIDDEN", undefined, { message: "Zugriff verweigert: Pfad liegt ausserhalb des erlaubten Verzeichnisses" });
      }
    }

    // Detail-Scan für einen spezifischen Standort (alle Dateitypen)
    if (locationCode && typeof locationCode === "string") {
      if (!locationCode.startsWith("Loc_")) {
        return apiError("BAD_REQUEST", undefined, { message: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" });
      }

      const fileTypes = await scanAllFileTypes(basePath, locationCode);

      return NextResponse.json({
        locationCode,
        basePath,
        fileTypes,
        totalFileTypes: fileTypes.length,
        totalFiles: fileTypes.reduce((sum, ft) => sum + ft.fileCount, 0),
      });
    }

    // Check if basePath itself is a Loc_XXXX directory
    const baseDir = path.basename(basePath);
    if (/^Loc_\d+$/i.test(baseDir)) {
      // User pointed directly to a Loc_ directory — scan parent with this locationCode
      const parentPath = path.dirname(basePath);
      const fileTypes = await scanAllFileTypes(parentPath, baseDir);

      return NextResponse.json({
        data: [{
          locationCode: baseDir,
          plantNumbers: [],
          fileCount: fileTypes.reduce((sum, ft) => sum + ft.fileCount, 0),
          dateRange: { from: null, to: null },
          fileTypes: fileTypes.map((ft) => ft.fileType),
        }],
        count: 1,
        basePath: parentPath,
      });
    }

    // Standard-Scan: alle Standorte unter basePath
    const locations = await scanAllLocations(basePath);

    return NextResponse.json({
      data: locations,
      count: locations.length,
      basePath,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Scannen des SCADA-Ordners");

    // Spezifische Fehlerbehandlung für Dateisystem-Fehler
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return apiError("NOT_FOUND", undefined, { message: `Verzeichnis nicht gefunden: Der angegebene Pfad existiert nicht` });
    }

    if (error instanceof Error && error.message.includes("EACCES")) {
      return apiError("FORBIDDEN", undefined, { message: "Zugriff verweigert: Keine Leseberechtigung für das Verzeichnis" });
    }

    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Scannen des SCADA-Ordners" });
  }
}
