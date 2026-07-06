/**
 * Dispatcher for GIS shapefile uploads (ZIP or standalone .shp).
 *
 * Called from tus onUploadFinish for uploadType="shapefile". Parses the
 * shapefile, runs field-mapping auto-detection, and returns the same
 * preview shape as POST /api/plots/import-shp so consumers can swap
 * uploaders without touching the review UI.
 *
 * The file is deleted after parsing — plot data will be persisted by a
 * separate confirm step, not by the uploader itself.
 */

import * as fsp from "fs/promises";
import { logger } from "@/lib/logger";
import { parseShapefile } from "@/lib/shapefile/shp-parser";
import {
  autoDetectPlotMapping,
  autoDetectOwnerMapping,
} from "@/lib/shapefile/field-mapping";

const shpLogger = logger.child({ module: "tus-shapefile-dispatcher" });

const ALLOWED_EXTENSIONS = [".zip", ".shp"];

export interface ShapefileDispatchInput {
  uploadId: string;
  tusFilePath: string;
  metadata: Record<string, string | null>;
  tenantId: string;
}

export interface ShapefileDispatchResult {
  ok: boolean;
  reason?: string;
  preview?: unknown;
}

export function validateShapefileMetadata(
  metadata: Record<string, string | null>
): { ok: true } | { ok: false; reason: string } {
  const { filename } = metadata;
  if (!filename) return { ok: false, reason: "filename fehlt in metadata" };

  const name = filename.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasValidExt) {
    return {
      ok: false,
      reason: "Ungültiges Dateiformat. Bitte eine ZIP- oder .shp-Datei hochladen.",
    };
  }
  return { ok: true };
}

export async function dispatchShapefileUpload(
  input: ShapefileDispatchInput
): Promise<ShapefileDispatchResult> {
  const { uploadId, tusFilePath, metadata, tenantId } = input;

  const validation = validateShapefileMetadata(metadata);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const filename = metadata.filename!;

  let buffer: Buffer;
  try {
    buffer = await fsp.readFile(tusFilePath);
  } catch (err) {
    shpLogger.error({ err, uploadId }, "Shapefile: readFile failed");
    return { ok: false, reason: "Datei konnte nicht gelesen werden" };
  }

  let result;
  try {
    result = await parseShapefile(buffer, filename);
  } catch (err) {
    shpLogger.warn({ err, uploadId }, "Shapefile parse error");
    await fsp.unlink(tusFilePath).catch(() => undefined);
    return {
      ok: false,
      reason: `Shapefile konnte nicht gelesen werden: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const suggestedPlotMapping = autoDetectPlotMapping(result.fields);
  const suggestedOwnerMapping = autoDetectOwnerMapping(result.fields);

  await fsp.unlink(tusFilePath).catch(() => undefined);
  await fsp.unlink(tusFilePath + ".json").catch(() => undefined);

  shpLogger.info(
    { uploadId, tenantId, featureCount: result.features.length },
    "Shapefile parsed"
  );

  return {
    ok: true,
    preview: {
      features: result.features,
      fields: result.fields,
      crs: result.crs,
      suggestedPlotMapping,
      suggestedOwnerMapping,
      warnings: result.warnings,
      featureCount: result.features.length,
    },
  };
}
