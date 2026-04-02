import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { parseMultiLayerShapefile } from "@/lib/shapefile/multi-layer-parser";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// POST /api/gis/import/preview — Parse SHP/ZIP and return multi-layer preview
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Datei zu groß. Maximum: ${MAX_FILE_SIZE / 1024 / 1024} MB` },
        { status: 400 }
      );
    }

    // Validate file extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["shp", "zip", "geojson", "json"].includes(ext)) {
      return NextResponse.json(
        { error: "Ungültiges Dateiformat. Erlaubt: .shp, .zip, .geojson, .json" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Basic content validation
    if (buffer.length < 10) {
      return NextResponse.json({ error: "Datei ist leer oder beschädigt" }, { status: 400 });
    }

    const result = await parseMultiLayerShapefile(buffer, file.name);

    logger.info({
      fileName: file.name,
      layers: result.layers.length,
      totalFeatures: result.layers.reduce((s, l) => s + l.featureCount, 0),
    }, "GIS import preview parsed");

    // Serialize features (limit to prevent huge responses)
    const MAX_FEATURES_PER_LAYER = 5000;
    const layers = result.layers.map((l) => ({
      name: l.name,
      geometryType: l.geometryType,
      featureCount: l.featureCount,
      fields: l.fields,
      suggestedType: l.suggestedType,
      features: l.features.slice(0, MAX_FEATURES_PER_LAYER),
      suggestedPlotMapping: l.suggestedPlotMapping,
      suggestedOwnerMapping: l.suggestedOwnerMapping,
      warnings: l.warnings,
      truncated: l.features.length > MAX_FEATURES_PER_LAYER,
    }));

    return NextResponse.json({ layers, warnings: result.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler beim Parsen der Datei";
    logger.error({ err: error }, "Error parsing GIS import file");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
