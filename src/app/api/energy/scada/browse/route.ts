import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import * as fs from "fs/promises";
import * as path from "path";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/energy/scada/browse - Verzeichnisse durchsuchen
// Liefert Unterverzeichnisse eines Pfads für den Ordner-Browser
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { currentPath } = body;

    // Ohne Pfad: Laufwerke/Root-Verzeichnisse zurückgeben
    if (!currentPath || typeof currentPath !== "string") {
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
      return NextResponse.json(
        { error: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" },
        { status: 400 }
      );
    }

    // Absoluten Pfad normalisieren
    const normalizedPath = path.resolve(currentPath);

    // Security: Restrict browsing to SCADA_BASE_PATH if configured
    const scadaBasePath = process.env.SCADA_BASE_PATH;
    if (scadaBasePath) {
      const allowedBase = path.resolve(scadaBasePath);
      if (!normalizedPath.startsWith(allowedBase + path.sep) && normalizedPath !== allowedBase) {
        return NextResponse.json(
          { error: "Zugriff verweigert: Pfad liegt ausserhalb des erlaubten Verzeichnisses" },
          { status: 403 }
        );
      }
    }

    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: "Der angegebene Pfad ist kein Verzeichnis" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Verzeichnis nicht gefunden" },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: "Zugriff verweigert: Keine Leseberechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Durchsuchen des Verzeichnisses" },
      { status: 500 }
    );
  }
}
