/**
 * Multi-layer shapefile parser for QGIS project import.
 * Handles ZIP files containing multiple .shp layers.
 */

import { parseShapefile, type ParsedShpFeature } from "./shp-parser";
import { detectLayerType, type ImportLayerType } from "./type-detector";
import { autoDetectPlotMapping, autoDetectOwnerMapping } from "./field-mapping";
import { logger } from "@/lib/logger";

export interface ParsedLayer {
  name: string;
  geometryType: "Polygon" | "LineString" | "Point" | "Mixed";
  featureCount: number;
  fields: string[];
  suggestedType: ImportLayerType;
  features: ParsedShpFeature[];
  suggestedPlotMapping: Record<string, string | null>;
  suggestedOwnerMapping: Record<string, string | null>;
  crs: string | null;
  warnings: string[];
}

export interface MultiLayerParseResult {
  layers: ParsedLayer[];
  warnings: string[];
}

/**
 * Determine the dominant geometry type of a feature set.
 */
function getGeometryType(features: ParsedShpFeature[]): "Polygon" | "LineString" | "Point" | "Mixed" {
  const types = new Set<string>();
  for (const f of features) {
    if (!f.geometry) continue;
    const t = f.geometry.type;
    if (t === "Polygon" || t === "MultiPolygon") types.add("Polygon");
    else if (t === "LineString" || t === "MultiLineString") types.add("LineString");
    else if (t === "Point" || t === "MultiPoint") types.add("Point");
    else types.add("Mixed");
  }
  if (types.size === 1) return types.values().next().value as "Polygon" | "LineString" | "Point";
  return "Mixed";
}

/**
 * Parse a single SHP file or a ZIP with multiple SHP layers.
 * Returns structured layers with auto-detected types and field mappings.
 */
export async function parseMultiLayerShapefile(
  buffer: Buffer,
  fileName: string
): Promise<MultiLayerParseResult> {
  const warnings: string[] = [];
  const isZip = fileName.endsWith(".zip") || buffer[0] === 0x50; // PK signature

  if (!isZip) {
    // Single SHP file — treat as one layer
    const result = await parseShapefile(buffer, fileName);
    const geomType = getGeometryType(result.features);
    const layerName = fileName.replace(/\.(shp|geojson|json)$/i, "");

    const layer: ParsedLayer = {
      name: layerName,
      geometryType: geomType,
      featureCount: result.features.length,
      fields: result.fields,
      suggestedType: detectLayerType(layerName, geomType),
      features: result.features,
      suggestedPlotMapping: autoDetectPlotMapping(result.fields),
      suggestedOwnerMapping: autoDetectOwnerMapping(result.fields),
      crs: result.crs,
      warnings: result.warnings,
    };

    return { layers: [layer], warnings };
  }

  // ZIP file — try to extract multiple layers
  try {
    const shp = await import("shpjs");
    const geojsonResult = await shp.default(buffer);

    // shpjs returns FeatureCollection for single layer, array for multiple
    const collections = Array.isArray(geojsonResult) ? geojsonResult : [geojsonResult];

    const layers: ParsedLayer[] = [];

    for (let i = 0; i < collections.length; i++) {
      const fc = collections[i] as GeoJSON.FeatureCollection & { fileName?: string };
      if (!fc.features || fc.features.length === 0) continue;

      // Try to get layer name from fileName property or index
      const layerName = fc.fileName
        || `Layer ${i + 1}`;

      // Parse through our parser for consistent feature handling
      // For multi-layer, we build ParsedShpFeature directly from GeoJSON
      const features: ParsedShpFeature[] = fc.features.map((f, idx) => ({
        id: idx,
        geometry: f.geometry,
        properties: (f.properties || {}) as Record<string, unknown>,
        centroid: getCentroid(f.geometry),
        areaSqm: f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
          ? computeArea(f.geometry)
          : null,
      }));

      const fields = features.length > 0
        ? Object.keys(features[0].properties).filter((k) => k !== "")
        : [];

      const geomType = getGeometryType(features);

      layers.push({
        name: layerName.replace(/\.(shp|dbf|prj)$/i, ""),
        geometryType: geomType,
        featureCount: features.length,
        fields,
        suggestedType: detectLayerType(layerName, geomType),
        features,
        suggestedPlotMapping: autoDetectPlotMapping(fields),
        suggestedOwnerMapping: autoDetectOwnerMapping(fields),
        crs: null,
        warnings: [],
      });
    }

    if (layers.length === 0) {
      warnings.push("Keine gültigen Layer im ZIP gefunden");
    }

    return { layers, warnings };
  } catch (err) {
    // Fallback: try single-layer parse
    logger.warn({ err, fileName }, "Multi-layer parse failed, trying single-layer");
    try {
      const result = await parseShapefile(buffer, fileName);
      const geomType = getGeometryType(result.features);
      const layerName = fileName.replace(/\.zip$/i, "");

      return {
        layers: [{
          name: layerName,
          geometryType: geomType,
          featureCount: result.features.length,
          fields: result.fields,
          suggestedType: detectLayerType(layerName, geomType),
          features: result.features,
          suggestedPlotMapping: autoDetectPlotMapping(result.fields),
          suggestedOwnerMapping: autoDetectOwnerMapping(result.fields),
          crs: result.crs,
          warnings: result.warnings,
        }],
        warnings: ["ZIP konnte nicht als Multi-Layer gelesen werden, einzelner Layer importiert"],
      };
    } catch (innerErr) {
      throw new Error(`Shapefile konnte nicht gelesen werden: ${innerErr instanceof Error ? innerErr.message : "Unbekannter Fehler"}`);
    }
  }
}

// -- Geometry helpers --

function getCentroid(geometry: GeoJSON.Geometry): { lat: number; lng: number } {
  const points: [number, number][] = [];
  extractCoords(geometry, points);
  if (points.length === 0) return { lat: 0, lng: 0 };
  const lat = points.reduce((s, p) => s + p[1], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[0], 0) / points.length;
  return { lat, lng };
}

function extractCoords(geom: GeoJSON.Geometry, out: [number, number][]) {
  switch (geom.type) {
    case "Point": out.push(geom.coordinates as [number, number]); break;
    case "MultiPoint": (geom.coordinates as [number, number][]).forEach((c) => out.push(c)); break;
    case "LineString": (geom.coordinates as [number, number][]).forEach((c) => out.push(c)); break;
    case "MultiLineString": geom.coordinates.forEach((line) => (line as [number, number][]).forEach((c) => out.push(c))); break;
    case "Polygon": (geom.coordinates[0] as [number, number][]).forEach((c) => out.push(c)); break;
    case "MultiPolygon": geom.coordinates.forEach((poly) => (poly[0] as [number, number][]).forEach((c) => out.push(c))); break;
  }
}

function computeArea(geometry: GeoJSON.Geometry): number | null {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  let totalArea = 0;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) continue;
    const R = 6378137;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const lng1 = (ring[i][0] * Math.PI) / 180;
      const lat1 = (ring[i][1] * Math.PI) / 180;
      const lng2 = (ring[j][0] * Math.PI) / 180;
      const lat2 = (ring[j][1] * Math.PI) / 180;
      area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    totalArea += Math.abs((area * R * R) / 2);
  }
  return Math.round(totalArea);
}
