"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapAnnotationLayer } from "@/components/maps/MapAnnotationLayer";
import type {
  ParkData,
  TurbineData,
  GISPlotFeature,
  AnnotationData,
  SelectedFeature,
  TileLayerType,
} from "./types";
import { PLOT_AREA_COLORS } from "./types";
import type { Feature } from "geojson";
import type { PathOptions, Layer } from "leaflet";

// -- DrawControl for GIS (polygon-only or polyline-only) --
interface GISDrawControlProps {
  mode: "polygon" | "polyline";
  onCreated: (geometry: GeoJSON.Geometry) => void;
}

function GISDrawControl({ mode, onCreated }: GISDrawControlProps) {
  const map = useMap();
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).L = L;

    let drawControl: L.Control.Draw | null = null;
    const drawnItems = new L.FeatureGroup();
    let cancelled = false;

    import("leaflet-draw").then(() => {
      if (cancelled) return;
      map.addLayer(drawnItems);

      drawControl = new L.Control.Draw({
        position: "topleft",
        draw: {
          polygon:
            mode === "polygon"
              ? {
                  allowIntersection: false,
                  showArea: true,
                  shapeOptions: { color: "#335E99", weight: 2, fillOpacity: 0.15 },
                }
              : false,
          polyline:
            mode === "polyline"
              ? { shapeOptions: { color: "#335E99", weight: 3 } }
              : false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: { featureGroup: drawnItems, remove: false },
      });

      map.addControl(drawControl);

      const handleCreated = (e: L.LeafletEvent) => {
        const event = e as L.DrawEvents.Created;
        const layer = event.layer;
        drawnItems.addLayer(layer);
        const geoJson = (layer as L.Polygon | L.Polyline).toGeoJSON();
        onCreatedRef.current(geoJson.geometry);
        setTimeout(() => drawnItems.removeLayer(layer), 100);
      };

      map.on(L.Draw.Event.CREATED, handleCreated);
    });

    return () => {
      cancelled = true;
      if (drawControl) map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, mode]);

  return null;
}

// -- FitBounds component --
function FitBoundsToData({
  parks,
  turbines,
  plots,
}: {
  parks: ParkData[];
  turbines: TurbineData[];
  plots: GISPlotFeature[];
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const points: [number, number][] = [];

    parks.forEach((p) => {
      if (p.latitude != null && p.longitude != null) {
        points.push([Number(p.latitude), Number(p.longitude)]);
      }
    });

    turbines.forEach((t) => {
      if (t.latitude != null && t.longitude != null) {
        points.push([Number(t.latitude), Number(t.longitude)]);
      }
    });

    plots.forEach((plot) => {
      if (!plot.geometry) return;
      const geom = plot.geometry;
      if (geom.type === "Polygon") {
        geom.coordinates[0].forEach((c) => points.push([c[1], c[0]]));
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach((poly) =>
          poly[0].forEach((c) => points.push([c[1], c[0]]))
        );
      }
    });

    if (points.length > 0) {
      fitted.current = true;
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 });
    }
  }, [map, parks, turbines, plots]);

  return null;
}

// -- Icon factories (reuse ParkMap pattern) --
const createParkIcon = () =>
  L.divIcon({
    className: "custom-gis-park-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:linear-gradient(135deg,#335E99 0%,#1d4ed8 100%);border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

const createTurbineIcon = (active: boolean) =>
  L.divIcon({
    className: "custom-gis-turbine-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:${active ? "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)" : "linear-gradient(135deg,#9ca3af 0%,#6b7280 100%)"};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v8"/>
        <path d="m4.93 10.93 1.41 1.41"/>
        <path d="M2 18h2"/>
        <path d="M20 18h2"/>
        <path d="m19.07 10.93-1.41 1.41"/>
        <path d="M22 22H2"/>
        <path d="m8 22 4-10 4 10"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });

// -- Haversine distance helper --
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPolylineLength(geometry: GeoJSON.Geometry): number {
  if (geometry.type !== "LineString") return 0;
  let total = 0;
  const coords = geometry.coordinates;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  return total;
}

function calcPolygonAreaSqm(geometry: GeoJSON.Geometry): number {
  if (geometry.type !== "Polygon") return 0;
  const ring = geometry.coordinates[0];
  const n = ring.length;
  if (n < 3) return 0;
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
  return Math.abs((area * R * R) / 2);
}

// -- Tile URLs --
const TILE_CONFIGS: Record<TileLayerType, { url: string; attribution: string }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
};

// -- Dominant area type helper --
function getDominantAreaType(plot: GISPlotFeature): string {
  if (!plot.plotAreas || plot.plotAreas.length === 0) return "NONE";
  const sorted = [...plot.plotAreas].sort((a, b) => b.areaSqm - a.areaSqm);
  return sorted[0].areaType;
}

// -- Props --
interface GISMapProps {
  parks: ParkData[];
  turbines: TurbineData[];
  plots: GISPlotFeature[];
  annotations: AnnotationData[];
  tileLayer: TileLayerType;
  showParks: boolean;
  showTurbines: boolean;
  showPlots: boolean;
  showAnnotations: boolean;
  drawMode: "off" | "plot";
  onDrawCreated: (geometry: GeoJSON.Geometry) => void;
  onFeatureClick: (feature: SelectedFeature) => void;
  onMeasureResult: (result: { type: "distance" | "area"; value: number } | null) => void;
  isMeasuring: boolean;
}

// -- Main map component --
export function GISMap({
  parks,
  turbines,
  plots,
  annotations,
  tileLayer,
  showParks,
  showTurbines,
  showPlots,
  showAnnotations,
  drawMode,
  onDrawCreated,
  onFeatureClick,
  onMeasureResult,
  isMeasuring,
}: GISMapProps) {
  const parkIcon = useMemo(() => createParkIcon(), []);
  const turbineActiveIcon = useMemo(() => createTurbineIcon(true), []);
  const turbineInactiveIcon = useMemo(() => createTurbineIcon(false), []);

  const tile = TILE_CONFIGS[tileLayer];

  // Plots GeoJSON
  const plotsGeoJsonKey = useMemo(
    () => plots.map((p) => `${p.id}-${p.activeLease?.status ?? "none"}`).join("|"),
    [plots]
  );

  const plotsGeoJsonData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: plots
      .filter((p) => p.geometry != null)
      .map((plot) => ({
        type: "Feature" as const,
        geometry: plot.geometry!,
        properties: { plotId: plot.id },
      })),
  }), [plots]);

  const plotById = useMemo(() => {
    const map = new Map<string, GISPlotFeature>();
    plots.forEach((p) => map.set(p.id, p));
    return map;
  }, [plots]);

  const stylePlot = useMemo(() => {
    return (feature: Feature | undefined): PathOptions => {
      if (!feature?.properties) return {};
      const plot = plotById.get(feature.properties.plotId);
      if (!plot) return {};

      const hasLease = !!plot.activeLease;
      const dominantType = getDominantAreaType(plot);
      const fillColor = PLOT_AREA_COLORS[dominantType] ?? "#757575";

      if (!hasLease) {
        return {
          color: "#ef4444",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 0.2,
          dashArray: "6 4",
        };
      }

      return {
        color: fillColor,
        weight: 2,
        fillColor,
        fillOpacity: 0.3,
      };
    };
  }, [plotById]);

  const onEachPlot = useMemo(() => {
    return (feature: Feature, layer: Layer) => {
      if (!feature.properties) return;
      const plot = plotById.get(feature.properties.plotId);
      if (!plot) return;

      layer.on("click", () => {
        onFeatureClick({ type: "plot", data: plot });
      });

      const areaHa = plot.areaSqm ? (plot.areaSqm / 10000).toFixed(4) : "?";
      layer.bindTooltip(
        `${plot.cadastralDistrict} ${plot.fieldNumber}/${plot.plotNumber} (${areaHa} ha)`,
        { sticky: true, className: "text-xs" }
      );
    };
  }, [plotById, onFeatureClick]);

  // Measure handler
  const handleMeasureCreated = useCallback((geometry: GeoJSON.Geometry) => {
    if (geometry.type === "LineString") {
      const dist = calcPolylineLength(geometry);
      onMeasureResult({ type: "distance", value: dist });
    } else if (geometry.type === "Polygon") {
      const area = calcPolygonAreaSqm(geometry);
      onMeasureResult({ type: "area", value: area });
    }
  }, [onMeasureResult]);

  // Turbines with coordinates
  const turbinesWithCoords = useMemo(
    () => turbines.filter((t) => t.latitude != null && t.longitude != null),
    [turbines]
  );

  return (
    <MapContainer
      center={[51.1657, 10.4515]}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer url={tile.url} attribution={tile.attribution} />

      <FitBoundsToData parks={parks} turbines={turbines} plots={plots} />

      {/* Plot polygons */}
      {showPlots && plotsGeoJsonData.features.length > 0 && (
        <GeoJSON
          key={`plots-${plotsGeoJsonKey}`}
          data={plotsGeoJsonData}
          style={stylePlot}
          onEachFeature={onEachPlot}
        />
      )}

      {/* Annotations */}
      {showAnnotations && annotations.length > 0 && (
        <MapAnnotationLayer
          annotations={annotations}
          visible={showAnnotations}
        />
      )}

      {/* Park markers */}
      {showParks &&
        parks
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((park) => (
            <Marker
              key={park.id}
              position={[Number(park.latitude), Number(park.longitude)]}
              icon={parkIcon}
              eventHandlers={{
                click: () => onFeatureClick({ type: "park", data: park }),
              }}
            >
              <Popup>
                <div className="font-semibold text-sm">{park.name}</div>
                <div className="text-xs text-muted-foreground">
                  {park._count.turbines} Turbinen
                </div>
              </Popup>
            </Marker>
          ))}

      {/* Turbine markers */}
      {showTurbines &&
        turbinesWithCoords.map((turbine) => (
          <Marker
            key={turbine.id}
            position={[Number(turbine.latitude), Number(turbine.longitude)]}
            icon={turbine.status === "ACTIVE" ? turbineActiveIcon : turbineInactiveIcon}
            eventHandlers={{
              click: () => onFeatureClick({ type: "turbine", data: turbine }),
            }}
          >
            <Popup>
              <div className="font-semibold text-sm">{turbine.designation}</div>
              {turbine.ratedPowerKw && (
                <div className="text-xs">
                  {turbine.ratedPowerKw >= 1000
                    ? `${(turbine.ratedPowerKw / 1000).toFixed(1)} MW`
                    : `${turbine.ratedPowerKw} kW`}
                </div>
              )}
            </Popup>
          </Marker>
        ))}

      {/* Plot draw control */}
      {drawMode === "plot" && (
        <GISDrawControl mode="polygon" onCreated={onDrawCreated} />
      )}

      {/* Measure draw control (polygon for area measurement) */}
      {isMeasuring && (
        <GISDrawControl mode="polygon" onCreated={handleMeasureCreated} />
      )}
    </MapContainer>
  );
}
