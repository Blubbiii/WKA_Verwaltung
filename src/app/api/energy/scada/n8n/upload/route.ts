import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { requireApiKey } from "@/lib/auth/apiKeyAuth";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const locationSchema = z.string().regex(/^Loc_\d+$/, "Ungültiger Location-Code");

// Supported SCADA file extensions
const SCADA_EXTENSIONS = new Set([
  "wsd", "uid",
  "avr", "avw", "avm", "avy",
  "ssm", "swm",
  "pes", "pew", "pet",
  "wsr", "wsw", "wsm", "wsy",
]);

// =============================================================================
// POST /api/energy/scada/n8n/upload
// Receives SCADA files and saves them to SCADA_BASE_PATH on the server.
// Auth: API key (SCADA_API_KEY env var)
//
// FormData:
//   - locationCode: string (e.g. "Loc_5842")
//   - files: File[] (one or more SCADA files)
//
// Files are saved to: SCADA_BASE_PATH/{locationCode}/{YYYY}/{MM}/{filename}
// If the file has a date-based name (YYYYMMDD.ext), it is placed accordingly.
// Otherwise falls back to a flat directory under the locationCode.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiKey(request);
    if (!auth.authorized) return auth.error;

    const scadaBasePath = process.env.SCADA_BASE_PATH;
    if (!scadaBasePath) {
      return apiError("INTERNAL_ERROR", undefined, { message: "SCADA_BASE_PATH ist nicht konfiguriert" });
    }

    const formData = await request.formData();
    const locationCode = formData.get("locationCode") as string | null;

    const locResult = locationSchema.safeParse(locationCode);
    if (!locResult.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiger Location-Code" });
    }
    const validatedLocationCode = locResult.data;

    // Collect files
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Dateien hochgeladen" });
    }

    const saved: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      // Reject filenames containing path separators, null bytes, or dots (beyond the extension dot)
      // path.basename() strips directory components, but we want to reject them outright.
      if (/[/\\\x00]/.test(file.name)) {
        return apiError("BAD_REQUEST", undefined, { message: `Ungültiger Dateiname: ${file.name}` });
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SCADA_EXTENSIONS.has(ext)) {
        skipped.push(file.name);
        continue;
      }

      // Validate that the filename stem contains only safe characters (alphanumeric + underscores/dashes)
      const baseName = path.basename(file.name, `.${ext}`);
      if (!/^[\w\-]+$/.test(baseName)) {
        return apiError("BAD_REQUEST", undefined, { message: `Ungültiger Dateiname: ${file.name}` });
      }

      // Try to extract date from filename (YYYYMMDD format)
      let targetDir: string;
      const dateMatch = baseName.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (dateMatch) {
        const [, year, month] = dateMatch;
        targetDir = path.join(scadaBasePath, validatedLocationCode, year, month);
      } else {
        // Fallback: flat dir under locationCode
        targetDir = path.join(scadaBasePath, validatedLocationCode);
      }

      await fs.mkdir(targetDir, { recursive: true });

      const filePath = path.join(targetDir, `${baseName}.${ext}`);

      // Skip if file already exists and has the same size
      try {
        const existingStat = await fs.stat(filePath);
        if (existingStat.size === file.size) {
          skipped.push(file.name);
          continue;
        }
      } catch {
        // File does not exist — proceed
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      saved.push(file.name);
    }

    logger.info(
      { locationCode: validatedLocationCode, saved: saved.length, skipped: skipped.length },
      `n8n SCADA upload: ${saved.length} saved, ${skipped.length} skipped`,
    );

    return NextResponse.json({
      locationCode: validatedLocationCode,
      saved: saved.length,
      skipped: skipped.length,
      savedFiles: saved,
      skippedFiles: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim n8n SCADA-Upload");
    return apiError("STORAGE_FAILED", undefined, { message: "Fehler beim Speichern der SCADA-Dateien" });
  }
}
