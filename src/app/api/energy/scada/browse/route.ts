import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import * as fs from "fs/promises";
import * as path from "path";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const browseSchema = z.object({
  currentPath: z.string().optional(),
});

// =============================================================================
// POST /api/energy/scada/browse - Verzeichnisse durchsuchen
// Liefert Unterverzeichnisse eines Pfads für den Ordner-Browser
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = browseSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { currentPath } = parsed.data;

    // Security: SCADA_BASE_PATH must be set in production
    const scadaBasePath = process.env.SCADA_BASE_PATH;
    if (!scadaBasePath && process.env.NODE_ENV === "production") {
      logger.error("SCADA_BASE_PATH is not configured — filesystem browsing disabled for security");
      return apiError("INTERNAL_ERROR", 503, { message: "SCADA-Verzeichnis nicht konfiguriert. Bitte SCADA_BASE_PATH in der Umgebung setzen." });
    }

    // Ohne Pfad: Laufwerke/Root-Verzeichnisse zurückgeben
    if (!currentPath) {
      // Auf Windows: Gaengige Laufwerke prüfen
      const drives: Array<{ name: string; path: string }> = [];
      for (const letter of ["C", "D", "E", "F", "G", "H"]) {
        try {
          await fs.access(`${letter}:\\`);
          drives.push({ name: `${letter}:\\`, path: `${letter}:\\` });
        } catch {
          // Laufwerk nicht vorhanden
        }
      }
      return NextResponse.json({ directories: drives, currentPath: "" });
    }

    // Sicherheitsprüfung
    if (currentPath.includes("..") || currentPath.includes("\0")) {
      return apiError("FORBIDDEN", 400, { message: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" });
    }

    // Absoluten Pfad normalisieren
    const normalizedPath = path.resolve(currentPath);

    // Security: Restrict browsing to SCADA_BASE_PATH if configured
    if (scadaBasePath) {
      const allowedBase = path.resolve(scadaBasePath);
      if (!normalizedPath.startsWith(allowedBase + path.sep) && normalizedPath !== allowedBase) {
        return apiError("FORBIDDEN", undefined, { message: "Zugriff verweigert: Pfad liegt ausserhalb des erlaubten Verzeichnisses" });
      }
    }

    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return apiError("BAD_REQUEST", undefined, { message: "Der angegebene Pfad ist kein Verzeichnis" });
      }
    } catch {
      return apiError("NOT_FOUND", undefined, { message: "Verzeichnis nicht gefunden" });
    }

    // Unterverzeichnisse lesen
    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        // Versteckte Ordner und Systemordner ausblenden
        if (entry.name.startsWith(".") || entry.name.startsWith("$")) return false;
        return true;
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Parent-Pfad berechnen
    const parentPath = path.dirname(normalizedPath);
    const hasParent = parentPath !== normalizedPath;

    return NextResponse.json({
      directories,
      currentPath: normalizedPath,
      parentPath: hasParent ? parentPath : null,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Durchsuchen des Verzeichnisses");

    if (error instanceof Error && error.message.includes("EACCES")) {
      return apiError("FORBIDDEN", undefined, { message: "Zugriff verweigert: Keine Leseberechtigung" });
    }

    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Durchsuchen des Verzeichnisses" });
  }
}
