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
  } | null;
  leaseCount: number;
  status: string;
}

export interface AnnotationData {
  id: string;
  name: string;
  type: "CABLE_ROUTE" | "COMPENSATION_AREA" | "ACCESS_ROAD" | "EXCLUSION_ZONE" | "CUSTOM";
  geometry: GeoJSON.Geometry;
  description: string | null;
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

// Plot area type colors and labels
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
