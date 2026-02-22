import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { scanAllLocations } from "@/lib/scada/dbf-reader";
import { scanAllFileTypes } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/energy/scada/scan - SCADA-Quellordner scannen
// Scannt den SCADA-Basisordner und liefert gefundene Standorte zurueck
//
// Body: { basePath: string }
//   -> Scannt alle Loc_XXXX Ordner unter basePath
//
// Body: { basePath: string, locationCode: string }
//   -> Scannt einen spezifischen Standort und liefert alle verfuegbaren Dateitypen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { basePath, locationCode } = body;

    // --- Validierung ---

    if (!basePath || typeof basePath !== "string") {
      return NextResponse.json(
        { error: "basePath ist erforderlich (z.B. 'C:\\Enercon')" },
        { status: 400 }
      );
    }

    // Minimale Sicherheitspruefung: Pfad darf keine gefaehrlichen Zeichen enthalten
    if (basePath.includes("..") || basePath.includes("\0")) {
      return NextResponse.json(
        { error: "Ungueltiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" },
        { status: 400 }
      );
    }

    // Detail-Scan fuer einen spezifischen Standort (alle Dateitypen)
    if (locationCode && typeof locationCode === "string") {
      if (!locationCode.startsWith("Loc_")) {
        return NextResponse.json(
          { error: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" },
          { status: 400 }
        );
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

    // Standard-Scan: alle Standorte unter basePath
    const locations = await scanAllLocations(basePath);

    return NextResponse.json({
      data: locations,
      count: locations.length,
      basePath,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Scannen des SCADA-Ordners");

    // Spezifische Fehlerbehandlung fuer Dateisystem-Fehler
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return NextResponse.json(
        { error: `Verzeichnis nicht gefunden: Der angegebene Pfad existiert nicht` },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes("EACCES")) {
      return NextResponse.json(
        { error: "Zugriff verweigert: Keine Leseberechtigung fuer das Verzeichnis" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Scannen des SCADA-Ordners" },
      { status: 500 }
    );
  }
}
