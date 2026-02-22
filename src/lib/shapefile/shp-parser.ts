/**
 * Server-side shapefile parser using shpjs.
 *
 * Accepts a ZIP buffer containing .shp, .dbf, .prj (and optionally .cpg)
 * files and returns parsed GeoJSON features with computed centroids and areas.
 */

import shp from "shpjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedShpFeature {
  id: number;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  centroid: { lat: number; lng: number };
  areaSqm: number | null;
}

export interface ShpParseResult {
  features: ParsedShpFeature[];
  fields: string[];
  crs: string | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/**
 * Fix "mojibake" caused by reading UTF-8 encoded bytes as Latin-1/ISO-8859-1.
 * This is extremely common with German ALKIS shapefiles whose DBF files use
 * UTF-8 but lack a .cpg encoding declaration.
 *
 * Example: "Böttcher" stored as UTF-8 → bytes 0xC3 0xB6 → read as Latin-1
 * → "BÃ¶ttcher". This function reverses that: take each char code as a byte,
 * then re-decode as UTF-8.
 */
function fixMojibake(text: string): string {
  // Quick check: if no characters in the Latin-1 supplement range, skip
  if (!/[\x80-\xff]/.test(text)) return text;

  try {
    // Convert each character's code point back to a raw byte
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 255) return text; // Non-Latin-1 char → not mojibake
      bytes[i] = code;
    }

    // Try decoding these bytes as UTF-8 (fatal = throw on invalid sequences)
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const decoded = decoder.decode(bytes);

    // If it decoded successfully and differs from the original, it was mojibake
    if (decoded !== text) {
      return decoded;
    }
  } catch {
    // UTF-8 decoding failed → not mojibake, return original
  }

  return text;
}

/**
 * Fix encoding for all string property values (and keys) in a feature.
 * Returns true if any fixes were applied.
 */
function fixPropertyEncoding(
  properties: Record<string, unknown>,
): { fixed: Record<string, unknown>; hadMojibake: boolean } {
  const fixed: Record<string, unknown> = {};
  let hadMojibake = false;

  for (const [key, value] of Object.entries(properties)) {
    const fixedKey = fixMojibake(key);
    if (fixedKey !== key) hadMojibake = true;

    if (typeof value === "string") {
      const fixedVal = fixMojibake(value);
      if (fixedVal !== value) hadMojibake = true;
      fixed[fixedKey] = fixedVal;
    } else {
      fixed[fixedKey] = value;
    }
  }

  return { fixed, hadMojibake };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Collect all coordinate pairs from any GeoJSON geometry type into a flat
 * array of [lng, lat] tuples.
 */
function extractCoordinates(geometry: GeoJSON.Geometry): number[][] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as number[]];

    case "MultiPoint":
    case "LineString":
      return geometry.coordinates as number[][];

    case "MultiLineString":
    case "Polygon":
      return (geometry.coordinates as number[][][]).flat();

    case "MultiPolygon":
      return (geometry.coordinates as number[][][][]).flat(2);

    case "GeometryCollection":
      return geometry.geometries.flatMap(extractCoordinates);

    default:
      return [];
  }
}

/**
 * Compute the centroid of a geometry as the arithmetic mean of all its
 * coordinate points. Returns { lat, lng }.
 */
function computeCentroid(geometry: GeoJSON.Geometry): { lat: number; lng: number } {
  const coords = extractCoordinates(geometry);
  if (coords.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }

  return {
    lng: sumLng / coords.length,
    lat: sumLat / coords.length,
  };
}

/**
 * Compute the area of a single polygon ring using the Shoelace formula.
 * Expects an array of [lng, lat] coordinate pairs forming a closed ring.
 * Returns the absolute area in square degrees (unsigned).
 */
function shoelaceArea(ring: number[][]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Approximate conversion factor from square degrees to square metres at a
 * given latitude. Uses the WGS-84 approximation where 1 degree of latitude
 * is ~111,320 m and 1 degree of longitude is ~111,320 * cos(lat) m.
 */
function sqDegreesToSqMetres(areaDeg2: number, latDeg: number): number {
  const latRad = (latDeg * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  return areaDeg2 * mPerDegLat * mPerDegLng;
}

/**
 * Compute the approximate area in square metres for Polygon and MultiPolygon
 * geometries. For other geometry types returns null.
 *
 * The calculation uses the Shoelace formula in geographic (degree)
 * coordinates and then converts to square metres using a latitude-dependent
 * approximation. This is sufficient for the small-scale cadastral parcels
 * we are dealing with.
 */
function computeAreaSqm(geometry: GeoJSON.Geometry): number | null {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    if (rings.length === 0) return null;

    // Outer ring area minus holes
    const centroid = computeCentroid(geometry);
    let areaDeg2 = shoelaceArea(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      areaDeg2 -= shoelaceArea(rings[i]);
    }
    return sqDegreesToSqMetres(Math.abs(areaDeg2), centroid.lat);
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    if (polygons.length === 0) return null;

    const centroid = computeCentroid(geometry);
    let totalDeg2 = 0;
    for (const rings of polygons) {
      let polyDeg2 = shoelaceArea(rings[0]);
      for (let i = 1; i < rings.length; i++) {
        polyDeg2 -= shoelaceArea(rings[i]);
      }
      totalDeg2 += Math.abs(polyDeg2);
    }
    return sqDegreesToSqMetres(totalDeg2, centroid.lat);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a shapefile ZIP buffer and return structured feature data.
 *
 * @param buffer  - The raw ZIP file contents as a Node Buffer.
 * @param fileName - Original file name (used in error / warning messages).
 */
export async function parseShapefile(
  buffer: Buffer,
  fileName: string,
): Promise<ShpParseResult> {
  const warnings: string[] = [];

  // Convert Node Buffer to Uint8Array (which shpjs accepts)
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let geojson: GeoJSON.FeatureCollection;

  try {
    const result = await shp(uint8);

    // shpjs returns a single FeatureCollection when the ZIP contains one
    // layer, or an array of FeatureCollections for multi-layer ZIPs.
    if (Array.isArray(result)) {
      if (result.length === 0) {
        throw new Error("The shapefile ZIP contains no layers.");
      }
      if (result.length > 1) {
        warnings.push(
          `The ZIP file "${fileName}" contains ${result.length} layers. Only the first layer will be used.`,
        );
      }
      geojson = result[0] as GeoJSON.FeatureCollection;
    } else {
      geojson = result as GeoJSON.FeatureCollection;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse shapefile "${fileName}": ${msg}`,
    );
  }

  if (!geojson.features || geojson.features.length === 0) {
    throw new Error(
      `The shapefile "${fileName}" contains no features.`,
    );
  }

  // Extract field names from the first feature's properties
  let fields: string[] = geojson.features[0]?.properties
    ? Object.keys(geojson.features[0].properties)
    : [];

  // Attempt to extract CRS information
  let crs: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = geojson as any;
  if (raw.crs?.properties?.name) {
    crs = String(raw.crs.properties.name);
  }

  // Process each feature
  const features: ParsedShpFeature[] = [];
  let encodingFixed = false;

  for (let i = 0; i < geojson.features.length; i++) {
    const f = geojson.features[i];
    if (!f.geometry) {
      warnings.push(`Feature ${i} has no geometry and was skipped.`);
      continue;
    }

    const centroid = computeCentroid(f.geometry);
    const areaSqm = computeAreaSqm(f.geometry);

    // Fix mojibake encoding (UTF-8 bytes misread as Latin-1)
    const rawProps = (f.properties ?? {}) as Record<string, unknown>;
    const { fixed: fixedProps, hadMojibake } = fixPropertyEncoding(rawProps);
    if (hadMojibake) encodingFixed = true;

    features.push({
      id: i,
      geometry: f.geometry,
      properties: fixedProps,
      centroid,
      areaSqm,
    });
  }

  if (encodingFixed) {
    warnings.push(
      "Zeichenkodierung wurde automatisch korrigiert (UTF-8 Mojibake erkannt).",
    );
    // Also fix the field names list
    fields = fields.map(fixMojibake);
  }

  if (features.length === 0) {
    throw new Error(
      `All features in "${fileName}" were skipped (no valid geometries).`,
    );
  }

  if (features.length < geojson.features.length) {
    const skipped = geojson.features.length - features.length;
    warnings.push(
      `${skipped} feature(s) without geometry were skipped out of ${geojson.features.length} total.`,
    );
  }

  return {
    features,
    fields,
    crs,
    warnings,
  };
}
