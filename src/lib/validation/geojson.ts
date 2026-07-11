/**
 * Shared GeoJSON validation schemas.
 *
 * Replaces `z.any()` / free-form JSON in API routes that accept map
 * geometry.  The client is trusted only to submit a well-formed
 * GeoJSON `Geometry` object; deeper coordinate validation happens
 * downstream (e.g. in the map libraries themselves).
 *
 * Used by:
 *   - src/app/api/plots/route.ts        (plot geometry)
 *   - src/app/api/gis/annotations/route.ts (map annotations)
 */

import { z } from "zod";

/** All standard GeoJSON geometry types (RFC 7946 §3.1). */
export const GEO_JSON_GEOMETRY_TYPES = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
] as const;

/**
 * Loose runtime schema for a GeoJSON `Geometry`.
 *
 * We validate the `type` discriminator strictly (prevents the client
 * sending arbitrary JSON blobs), but keep `coordinates`/`geometries`
 * loose (`z.array(z.unknown())`) — nesting rules vary by type and
 * the parsing / rendering libraries downstream perform the actual
 * shape check.
 *
 * `.passthrough()` preserves optional GeoJSON fields (bbox, crs, ...)
 * without dropping them silently.
 */
export const geoJsonGeometrySchema = z
  .object({
    type: z.enum(GEO_JSON_GEOMETRY_TYPES),
    coordinates: z.array(z.unknown()).optional(),
    geometries: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type GeoJsonGeometry = z.infer<typeof geoJsonGeometrySchema>;
