/**
 * Auto-detect layer type from SHP layer name, geometry type, or attribute values.
 * Used during QGIS project import to suggest the correct WPM entity type.
 */

export type ImportLayerType =
  | "PLOT"            // Flurstück → Plot model
  | "WEA_STANDORT"    // WEA-Standort → Plot + PlotArea
  | "POOL_AREA"       // Poolgebiet → MapAnnotation overlay
  | "CABLE_ROUTE"     // Kabeltrasse → MapAnnotation line
  | "ACCESS_ROAD"     // Zuwegung → MapAnnotation line
  | "COMPENSATION_AREA" // Ausgleichsfläche → MapAnnotation polygon
  | "EXCLUSION_ZONE"  // Sperrzone → MapAnnotation polygon
  | "CUSTOM";         // Sonstiges → MapAnnotation

export interface ImportLayerTypeInfo {
  type: ImportLayerType;
  label: string;
  color: string;
  isPlot: boolean;       // Creates Plot records
  isAnnotation: boolean; // Creates MapAnnotation records
  geometryHint: "polygon" | "line" | "any";
}

export const IMPORT_LAYER_TYPES: Record<ImportLayerType, ImportLayerTypeInfo> = {
  PLOT: { type: "PLOT", label: "Flurstück", color: "#757575", isPlot: true, isAnnotation: false, geometryHint: "polygon" },
  WEA_STANDORT: { type: "WEA_STANDORT", label: "WEA-Standort", color: "#335E99", isPlot: true, isAnnotation: false, geometryHint: "polygon" },
  POOL_AREA: { type: "POOL_AREA", label: "Poolgebiet", color: "#4CAF50", isPlot: false, isAnnotation: true, geometryHint: "polygon" },
  CABLE_ROUTE: { type: "CABLE_ROUTE", label: "Kabeltrasse", color: "#F44336", isPlot: false, isAnnotation: true, geometryHint: "line" },
  ACCESS_ROAD: { type: "ACCESS_ROAD", label: "Zuwegung", color: "#FF9800", isPlot: false, isAnnotation: true, geometryHint: "line" },
  COMPENSATION_AREA: { type: "COMPENSATION_AREA", label: "Ausgleichsfläche", color: "#9C27B0", isPlot: false, isAnnotation: true, geometryHint: "polygon" },
  EXCLUSION_ZONE: { type: "EXCLUSION_ZONE", label: "Sperrzone", color: "#ef4444", isPlot: false, isAnnotation: true, geometryHint: "polygon" },
  CUSTOM: { type: "CUSTOM", label: "Sonstiges", color: "#6366f1", isPlot: false, isAnnotation: true, geometryHint: "any" },
};

// Keyword patterns for auto-detection (case-insensitive)
const TYPE_KEYWORDS: [ImportLayerType, string[]][] = [
  ["POOL_AREA", ["pool", "poolgebiet", "poolflaeche", "poolfläche", "poolarea"]],
  ["WEA_STANDORT", ["standort", "wea", "turbine", "anlage", "anlagen"]],
  ["CABLE_ROUTE", ["kabel", "cable", "leitung", "trasse", "kabeltrasse"]],
  ["ACCESS_ROAD", ["weg", "zuweg", "zuwegung", "road", "access", "zufahrt", "wege"]],
  ["COMPENSATION_AREA", ["ausgleich", "kompensation", "compensation", "oekoflaeche", "ökofläche"]],
  ["EXCLUSION_ZONE", ["sperr", "exclusion", "sperrzone", "sperrgebiet", "tabu"]],
  ["PLOT", ["flurst", "flur", "parzelle", "grundst", "grundstück", "grundstueck", "plot", "parcel"]],
];

/**
 * Detect the import layer type from a layer name and geometry type.
 */
export function detectLayerType(
  layerName: string,
  geometryType: string
): ImportLayerType {
  const name = layerName.toLowerCase().replace(/[_\-\s.]+/g, "");

  // Check keywords in priority order
  for (const [type, keywords] of TYPE_KEYWORDS) {
    for (const keyword of keywords) {
      if (name.includes(keyword)) {
        return type;
      }
    }
  }

  // Fallback by geometry type
  if (geometryType === "LineString" || geometryType === "MultiLineString") {
    return "CABLE_ROUTE"; // Lines are most likely cables or roads
  }

  // Default for polygons
  return "PLOT";
}

/**
 * Detect type from a feature's attribute value (e.g. "Typ" or "Nutzung" column).
 */
export function detectTypeFromAttribute(value: string): ImportLayerType | null {
  const v = String(value).toLowerCase().trim();

  for (const [type, keywords] of TYPE_KEYWORDS) {
    for (const keyword of keywords) {
      if (v.includes(keyword)) return type;
    }
  }

  return null;
}
