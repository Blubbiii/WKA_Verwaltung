// Shared types for GIS components

export interface ParkData {
  id: string;
  name: string;
  shortName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  _count: { turbines: number };
}

export interface TurbineData {
  id: string;
  designation: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  ratedPowerKw: number | null;
  parkId: string;
}

export interface PlotAreaData {
  id?: string;
  areaType: "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL";
  areaSqm: number;
}

export interface GISPlotFeature {
  id: string;
  cadastralDistrict: string;
  fieldNumber: string;
  plotNumber: string;
  areaSqm: number | null;
  geometry: GeoJSON.Geometry | null;
  parkId: string | null;
  park: { id: string; name: string; shortName: string | null } | null;
  plotAreas: PlotAreaData[];
  activeLease: {
    leaseId: string;
    status: string;
    lessorName: string | null;
    lessorId: string;
    startDate?: string;
    endDate?: string;
  } | null;
  allLeases?: {
    leaseId: string;
    status: string;
    lessorName: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
  leaseCount: number;
  status: string;
}

export interface AnnotationData {
  id: string;
  name: string;
  type: "CABLE_ROUTE" | "COMPENSATION_AREA" | "ACCESS_ROAD" | "EXCLUSION_ZONE" | "CUSTOM";
  geometry: GeoJSON.Geometry;
  description: string | null;
  color?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: any | null;
  parkId: string | null;
}

export interface SelectedFeature {
  type: "plot" | "turbine" | "park" | "annotation";
  data: GISPlotFeature | TurbineData | ParkData | AnnotationData;
}

export type TileLayerType = "osm" | "satellite" | "topo";

export interface MeasureResult {
  type: "distance" | "area";
  value: number;
}

// -- Layer visibility --
export interface LayerVisibility {
  parks: boolean;
  turbines: boolean;
  plots: boolean;
  annotations: boolean;
  bufferZones: boolean;
  heatmap: boolean;
  leaseStatus: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  parks: true,
  turbines: true,
  plots: true,
  annotations: true,
  bufferZones: false,
  heatmap: false,
  leaseStatus: false,
};

// -- Drawn features (undo stack) --
export interface DrawnFeature {
  id: string;
  geometry: GeoJSON.Geometry;
}

// -- GIS data from API --
export interface GISData {
  parks: ParkData[];
  turbines: TurbineData[];
  plots: GISPlotFeature[];
  annotations: AnnotationData[];
}

// -- Configurable GIS settings --
export interface GISSettings {
  bufferRadiusM: number;         // Buffer zone radius in meters (default: 300)
  minPlotAreaSqm: number;        // Minimum plot area warning threshold (default: 100)
  plotOpacity: number;            // Plot fill opacity 0-1 (default: 0.3)
  clusterMarkers: boolean;        // Cluster close markers (default: false)
}

export const DEFAULT_GIS_SETTINGS: GISSettings = {
  bufferRadiusM: 300,
  minPlotAreaSqm: 100,
  plotOpacity: 0.3,
  clusterMarkers: false,
};

// -- Reducer state & actions --
export interface GISState {
  data: GISData;
  loading: boolean;
  error: string | null;
  parkFilter: string;
  tileLayer: TileLayerType;
  layers: LayerVisibility;
  settings: GISSettings;
  selectedFeature: SelectedFeature | null;
  drawMode: "off" | "plot" | "annotation";
  pendingGeometry: GeoJSON.Geometry | null;
  showCreatePanel: boolean;
  isMeasuring: boolean;
  measureResult: MeasureResult | null;
  drawnFeatures: DrawnFeature[];
  selectedFeatureId: string | null;
}

export type GISAction =
  | { type: "SET_DATA"; payload: GISData }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_PARK_FILTER"; payload: string }
  | { type: "SET_TILE_LAYER"; payload: TileLayerType }
  | { type: "TOGGLE_LAYER"; payload: keyof LayerVisibility }
  | { type: "SET_SELECTED_FEATURE"; payload: SelectedFeature | null }
  | { type: "SET_DRAW_MODE"; payload: "off" | "plot" | "annotation" }
  | { type: "SET_PENDING_GEOMETRY"; payload: GeoJSON.Geometry | null }
  | { type: "SET_SHOW_CREATE_PANEL"; payload: boolean }
  | { type: "SET_MEASURING"; payload: boolean }
  | { type: "SET_MEASURE_RESULT"; payload: MeasureResult | null }
  | { type: "ADD_DRAWN_FEATURE"; payload: DrawnFeature }
  | { type: "UNDO_LAST_DRAW" }
  | { type: "CLEAR_DRAWN_FEATURES" }
  | { type: "SET_SELECTED_FEATURE_ID"; payload: string | null }
  | { type: "UPDATE_SETTINGS"; payload: Partial<GISSettings> };

// -- Plot area type colors and labels --
export const PLOT_AREA_COLORS: Record<string, string> = {
  WEA_STANDORT: "#335E99",
  POOL: "#4CAF50",
  WEG: "#FF9800",
  AUSGLEICH: "#9C27B0",
  KABEL: "#F44336",
  NONE: "#757575",
};

export const PLOT_AREA_LABELS: Record<string, string> = {
  WEA_STANDORT: "Turbinenstandort",
  POOL: "Pool",
  WEG: "Zuwegung",
  AUSGLEICH: "Ausgleichsfläche",
  KABEL: "Kabeltrasse",
};

// -- Lease status colors --
export const LEASE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  EXPIRING: "#eab308",
  EXPIRED: "#ef4444",
  TERMINATED: "#ef4444",
  DRAFT: "#9ca3af",
  NONE: "#6b7280",
};

export const LEASE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  EXPIRING: "Läuft aus",
  EXPIRED: "Abgelaufen",
  TERMINATED: "Beendet",
  DRAFT: "Entwurf",
  NONE: "Kein Vertrag",
};
