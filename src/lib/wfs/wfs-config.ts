/**
 * Configuration for German WFS cadastral services (ALKIS / Kataster).
 *
 * These are public, freely available OGC WFS endpoints that provide
 * parcel (Flurstück) geometries and attributes for German federal states.
 */

export interface WfsServiceConfig {
  /** Internal key */
  key: string;
  /** Human-readable label */
  label: string;
  /** WFS GetFeature base URL */
  url: string;
  /** WFS feature type name */
  typeName: string;
  /** Coordinate reference system to request */
  srsName: string;
  /** WFS version */
  version: string;
  /** Output format (prefer GeoJSON if supported) */
  outputFormat: string;
  /** Property name mapping: how this service names cadastral fields */
  fieldMap: {
    cadastralDistrict: string; // Gemarkung
    fieldNumber: string;       // Flur
    plotNumber: string;        // Flurstück
    area?: string;             // Fläche in m²
  };
}

export const WFS_SERVICES: Record<string, WfsServiceConfig> = {
  NIEDERSACHSEN: {
    key: "NIEDERSACHSEN",
    label: "Niedersachsen (INSPIRE)",
    url: "https://www.inspire.niedersachsen.de/doorman/noauth/alkis-dls-cp",
    typeName: "cp:CadastralParcel",
    srsName: "EPSG:4326",
    version: "2.0.0",
    outputFormat: "application/json",
    fieldMap: {
      cadastralDistrict: "cp:nationalCadastralReference",
      fieldNumber: "cp:nationalCadastralReference",
      plotNumber: "cp:nationalCadastralReference",
    },
  },
  NRW: {
    key: "NRW",
    label: "Nordrhein-Westfalen",
    url: "https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht",
    typeName: "ave:Flurstueck",
    srsName: "EPSG:4326",
    version: "2.0.0",
    outputFormat: "application/json",
    fieldMap: {
      cadastralDistrict: "gemarkung",
      fieldNumber: "flur",
      plotNumber: "flurstueck",
      area: "amtlicheFlaeche",
    },
  },
} as const;

/** List of available service keys for frontend dropdown */
export const WFS_SERVICE_KEYS = Object.keys(WFS_SERVICES);

/** Default cache duration for WFS results (7 days in ms) */
export const WFS_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
