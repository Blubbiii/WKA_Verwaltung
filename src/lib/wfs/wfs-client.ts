/**
 * WFS Client — fetches cadastral parcel data from German WFS services.
 *
 * Server-side only (Node.js). Queries WFS endpoints, parses the response
 * (GeoJSON or GML), and returns normalized GeoJSON FeatureCollections.
 */

import { XMLParser } from "fast-xml-parser";
import { type WfsServiceConfig, WFS_SERVICES } from "./wfs-config";
import { logger } from "@/lib/logger";

const wfsLogger = logger.child({ module: "wfs" });

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface WfsParcelFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    cadastralDistrict: string; // Gemarkung
    fieldNumber: string;       // Flur
    plotNumber: string;        // Flurstück
    area?: number;             // Fläche m²
    /** All raw properties from the WFS response */
    raw: Record<string, unknown>;
  };
}

export interface WfsQueryParams {
  /** WFS service key (e.g. "NRW", "NIEDERSACHSEN") */
  serviceKey: string;
  /** Gemarkung name or number */
  cadastralDistrict?: string;
  /** Flur number */
  fieldNumber?: string;
  /** Bounding box [minLon, minLat, maxLon, maxLat] */
  bbox?: [number, number, number, number];
  /** Max features to return */
  maxFeatures?: number;
}

// ---------------------------------------------------------------
// Core
// ---------------------------------------------------------------

/**
 * Fetch parcel features from a WFS service.
 * Returns a GeoJSON FeatureCollection with normalized properties.
 */
export async function fetchWfsParcels(
  params: WfsQueryParams,
): Promise<WfsParcelFeature[]> {
  const config = WFS_SERVICES[params.serviceKey];
  if (!config) {
    throw new Error(`Unknown WFS service: ${params.serviceKey}`);
  }

  const url = buildWfsUrl(config, params);
  wfsLogger.info({ url: url.toString(), service: params.serviceKey }, "WFS GetFeature request");

  const response = await fetch(url.toString(), {
    headers: { Accept: config.outputFormat },
    signal: AbortSignal.timeout(30_000), // 30s timeout
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    wfsLogger.error(
      { status: response.status, body: text.slice(0, 500) },
      "WFS request failed",
    );
    throw new Error(`WFS request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  // Try parsing as GeoJSON first
  if (contentType.includes("json") || contentType.includes("geojson")) {
    return parseGeoJsonResponse(body, config);
  }

  // Fall back to GML/XML parsing
  if (contentType.includes("xml") || contentType.includes("gml") || body.trimStart().startsWith("<")) {
    return parseGmlResponse(body, config);
  }

  // Unknown format — try GeoJSON
  try {
    return parseGeoJsonResponse(body, config);
  } catch {
    throw new Error(`Unsupported WFS response format: ${contentType}`);
  }
}

// ---------------------------------------------------------------
// URL Builder
// ---------------------------------------------------------------

function buildWfsUrl(config: WfsServiceConfig, params: WfsQueryParams): URL {
  const url = new URL(config.url);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", config.version);
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", config.typeName);
  url.searchParams.set("SRSNAME", config.srsName);
  url.searchParams.set("OUTPUTFORMAT", config.outputFormat);
  url.searchParams.set("COUNT", String(params.maxFeatures ?? 500));

  // Build CQL/OGC filter for cadastral query
  const filters: string[] = [];

  if (params.cadastralDistrict && config.fieldMap.cadastralDistrict) {
    filters.push(
      `<PropertyIsEqualTo><PropertyName>${config.fieldMap.cadastralDistrict}</PropertyName><Literal>${escapeXml(params.cadastralDistrict)}</Literal></PropertyIsEqualTo>`,
    );
  }

  if (params.fieldNumber && config.fieldMap.fieldNumber !== config.fieldMap.cadastralDistrict) {
    filters.push(
      `<PropertyIsEqualTo><PropertyName>${config.fieldMap.fieldNumber}</PropertyName><Literal>${escapeXml(params.fieldNumber)}</Literal></PropertyIsEqualTo>`,
    );
  }

  if (params.bbox) {
    const [minLon, minLat, maxLon, maxLat] = params.bbox;
    url.searchParams.set("BBOX", `${minLat},${minLon},${maxLat},${maxLon},${config.srsName}`);
  }

  if (filters.length > 0) {
    const filterBody =
      filters.length === 1
        ? filters[0]
        : `<And>${filters.join("")}</And>`;
    const filterXml = `<Filter xmlns="http://www.opengis.net/ogc">${filterBody}</Filter>`;
    url.searchParams.set("FILTER", filterXml);
  }

  return url;
}

// ---------------------------------------------------------------
// GeoJSON Parser
// ---------------------------------------------------------------

function parseGeoJsonResponse(body: string, config: WfsServiceConfig): WfsParcelFeature[] {
  const json = JSON.parse(body);

  if (!json.features || !Array.isArray(json.features)) {
    wfsLogger.warn({ keys: Object.keys(json) }, "WFS GeoJSON response has no features array");
    return [];
  }

  return json.features
    .filter((f: { geometry?: unknown }) => f.geometry)
    .map((f: { geometry: GeoJSON.Geometry; properties?: Record<string, unknown> }) =>
      normalizeFeature(f.geometry, f.properties ?? {}, config),
    );
}

// ---------------------------------------------------------------
// GML Parser (fallback for services that don't support GeoJSON)
// ---------------------------------------------------------------

function parseGmlResponse(body: string, config: WfsServiceConfig): WfsParcelFeature[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    isArray: (name) => ["member", "featureMember", "coordinates", "pos", "posList"].includes(name),
  });

  const parsed = parser.parse(body);

  // Navigate to feature members (various WFS formats)
  const root = parsed.FeatureCollection ?? parsed.wfs_FeatureCollection ?? parsed;
  let members = root.member ?? root.featureMember ?? [];
  if (!Array.isArray(members)) members = [members];

  const features: WfsParcelFeature[] = [];

  for (const member of members) {
    try {
      // The actual feature is nested under the member (e.g. member > ave:Flurstueck)
      const featureObj = Object.values(member)[0] as Record<string, unknown> | undefined;
      if (!featureObj || typeof featureObj !== "object") continue;

      const geometry = extractGmlGeometry(featureObj);
      if (!geometry) continue;

      features.push(normalizeFeature(geometry, featureObj as Record<string, unknown>, config));
    } catch (err) {
      wfsLogger.warn({ err }, "Failed to parse GML feature member");
    }
  }

  return features;
}

/**
 * Extract GeoJSON geometry from a GML feature object.
 * Handles common GML geometry patterns (Polygon, MultiSurface).
 */
function extractGmlGeometry(obj: Record<string, unknown>): GeoJSON.Geometry | null {
  // Look for geometry fields
  const geomKeys = ["geometry", "Geometry", "the_geom", "geom", "MultiSurface", "Polygon", "Surface"];
  let geomObj: Record<string, unknown> | null = null;

  for (const key of Object.keys(obj)) {
    if (geomKeys.some((gk) => key.toLowerCase().includes(gk.toLowerCase()))) {
      geomObj = obj[key] as Record<string, unknown>;
      break;
    }
  }

  if (!geomObj) return null;

  // Try to find coordinates in various GML structures
  const coords = extractCoordinates(geomObj);
  if (!coords || coords.length === 0) return null;

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

/**
 * Recursively extract coordinate arrays from GML structures.
 */
function extractCoordinates(obj: unknown): Array<[number, number]> | null {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  // posList: "lat1 lon1 lat2 lon2 ..."
  if (typeof record.posList === "string") {
    return parsePosList(record.posList);
  }

  // pos: ["lat lon", "lat lon", ...]
  if (Array.isArray(record.pos)) {
    return record.pos
      .filter((p): p is string => typeof p === "string")
      .map((p) => {
        const [a, b] = p.split(/\s+/).map(Number);
        return [b, a] as [number, number]; // GML is lat/lon, GeoJSON is lon/lat
      });
  }

  // coordinates: "lon,lat lon,lat ..."
  if (typeof record.coordinates === "string") {
    return record.coordinates
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [lon, lat] = pair.split(",").map(Number);
        return [lon, lat] as [number, number];
      });
  }

  // Recurse into child objects
  for (const val of Object.values(record)) {
    const result = extractCoordinates(val);
    if (result) return result;
  }

  return null;
}

function parsePosList(posList: string): Array<[number, number]> {
  const nums = posList.trim().split(/\s+/).map(Number);
  const coords: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    // GML posList is typically lat/lon for EPSG:4326
    coords.push([nums[i + 1], nums[i]]);
  }
  return coords;
}

// ---------------------------------------------------------------
// Feature Normalization
// ---------------------------------------------------------------

function normalizeFeature(
  geometry: GeoJSON.Geometry,
  rawProps: Record<string, unknown>,
  config: WfsServiceConfig,
): WfsParcelFeature {
  const { fieldMap } = config;

  return {
    type: "Feature",
    geometry,
    properties: {
      cadastralDistrict: String(rawProps[fieldMap.cadastralDistrict] ?? ""),
      fieldNumber: String(rawProps[fieldMap.fieldNumber] ?? ""),
      plotNumber: String(rawProps[fieldMap.plotNumber] ?? ""),
      area: fieldMap.area ? Number(rawProps[fieldMap.area]) || undefined : undefined,
      raw: rawProps,
    },
  };
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
