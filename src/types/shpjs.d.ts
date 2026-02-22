/**
 * Type declarations for shpjs v6.
 *
 * shpjs parses ESRI Shapefiles (ZIP archives containing .shp, .dbf, .prj
 * files) and returns GeoJSON FeatureCollections.
 */
declare module "shpjs" {
  /**
   * Parse a shapefile ZIP from a URL string or a binary buffer.
   *
   * - When given a Uint8Array / ArrayBuffer: parses the ZIP in memory.
   * - When given a string URL ending in .zip: fetches and parses the ZIP.
   * - When given a string URL ending in .shp (or without extension): fetches
   *   .shp, .dbf, .prj separately and combines them.
   *
   * Returns a single FeatureCollection when the ZIP contains one layer, or
   * an array of FeatureCollections for multi-layer ZIPs.
   */
  function shp(
    base: string | ArrayBuffer | Uint8Array,
    whiteList?: string[],
  ): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;

  export default shp;

  export function parseZip(
    buffer: ArrayBuffer | Uint8Array,
    whiteList?: string[],
  ): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;

  export function combine(
    arr: [GeoJSON.Geometry[], Record<string, unknown>[]],
  ): GeoJSON.FeatureCollection;

  export function parseShp(
    shp: DataView | ArrayBuffer | Uint8Array,
    prj?: string | false,
  ): GeoJSON.Geometry[];

  export function parseDbf(
    dbf: DataView | ArrayBuffer | Uint8Array,
    cpg?: string,
  ): Record<string, unknown>[];
}
