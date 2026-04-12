/**
 * POST /api/plots/import-shp
 *
 * Preview endpoint: parses a shapefile (ZIP or standalone .shp) and returns
 * the extracted features, field names, and auto-detected mapping suggestions.
 * Does NOT persist anything to the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { parseShapefile } from "@/lib/shapefile/shp-parser";
import {
  autoDetectPlotMapping,
  autoDetectOwnerMapping,
} from "@/lib/shapefile/field-mapping";
import { apiLogger as logger } from "@/lib/logger";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";
import { apiError } from "@/lib/api-errors";

// Maximum upload size: 50 MB
const MAX_FILE_SIZE = UPLOAD_LIMITS.large;

export async function POST(request: NextRequest) {
  try {
    // -- Auth & permission check --
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    // -- Parse multipart form data --
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Formular. Bitte eine Datei hochladen." });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Datei hochgeladen. Bitte eine ZIP- oder SHP-Datei auswählen." });
    }

    // -- File size check --
    if (file.size > MAX_FILE_SIZE) {
      return apiError("INTERNAL_ERROR", 413, { message: `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal erlaubt: ${MAX_FILE_SIZE / 1024 / 1024} MB.` });
    }

    // -- Validate file type (must be .zip or .shp) --
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".zip") && !fileName.endsWith(".shp")) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Dateiformat. Bitte eine ZIP-Datei (enthält .shp, .dbf, .prj) oder eine einzelne .shp-Datei hochladen." });
    }

    // -- Read file into Buffer --
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // -- Parse shapefile --
    let result;
    try {
      result = await parseShapefile(buffer, file.name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Shapefile parse error");
      return apiError("INTERNAL_ERROR", 422, { message: `Shapefile konnte nicht gelesen werden: ${msg}` });
    }

    // -- Auto-detect field mappings --
    const suggestedPlotMapping = autoDetectPlotMapping(result.fields);
    const suggestedOwnerMapping = autoDetectOwnerMapping(result.fields);

    // -- Return preview data --
    return NextResponse.json({
      features: result.features,
      fields: result.fields,
      crs: result.crs,
      suggestedPlotMapping,
      suggestedOwnerMapping,
      warnings: result.warnings,
      featureCount: result.features.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Unexpected error in SHP import preview");
    return apiError("PROCESS_FAILED", undefined, { message: "Interner Serverfehler beim Verarbeiten der Shapefile-Datei." });
  }
}
