"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Hide default leaflet-draw toolbar — we use our own toolbar buttons
const HIDE_DRAW_TOOLBAR_CSS = `
  .leaflet-draw-toolbar { display: none !important; }
  .leaflet-draw-actions {
    left: 60px !important;
    top: auto !important;
    bottom: 60px !important;
    position: fixed !important;
    z-index: 1001 !important;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    padding: 4px;
  }
  .leaflet-draw-actions li a {
    font-size: 12px;
    padding: 4px 12px;
    color: #335E99;
    font-weight: 500;
  }
  .leaflet-draw-tooltip {
    z-index: 1001 !important;
  }
`;
import { MapAnnotationLayer } from "@/components/maps/MapAnnotationLayer";
import type {
  ParkData,
  TurbineData,
  GISPlotFeature,
  AnnotationData,
  SelectedFeature,
  TileLayerType,
  LayerVisibility,
  GISSettings,
} from "./types";
import { PLOT_AREA_COLORS, LEASE_STATUS_COLORS } from "./types";
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

    // Inject CSS to hide default draw toolbar
    let styleEl: HTMLStyleElement | null = document.getElementById("gis-draw-css") as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "gis-draw-css";
      styleEl.textContent = HIDE_DRAW_TOOLBAR_CSS;
      document.head.appendChild(styleEl);
    }

    let drawControl: L.Control.Draw | null = null;
    const drawnItems = new L.FeatureGroup();
    let cancelled = false;

    import("leaflet-draw").then(() => {
      if (cancelled) return;
      map.addLayer(drawnItems);

      drawControl = new L.Control.Draw({
        position: "bottomleft",
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

      // Programmatically start drawing (toolbar is hidden via CSS)
      const toolbarContainer = (drawControl as unknown as { _toolbars: Record<string, { _modes: Record<string, { handler: { enable: () => void } }> }> })._toolbars;
      if (mode === "polygon" && toolbarContainer?.draw?._modes?.polygon?.handler) {
        toolbarContainer.draw._modes.polygon.handler.enable();
      } else if (mode === "polyline" && toolbarContainer?.draw?._modes?.polyline?.handler) {
        toolbarContainer.draw._modes.polyline.handler.enable();
      }

      const handleCreated = (e: L.LeafletEvent) => {
        const event = e as L.DrawEvents.Created;
        const layer = event.layer;
        drawnItems.addLayer(layer);
        const geoJson = (layer as L.Polygon | L.Polyline).toGeoJSON();
        onCreatedRef.current(geoJson.geometry);
        // Remove drawn layer immediately — pendingGeometry preview takes over
        drawnItems.removeLayer(layer);
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

// -- Extract points from any GeoJSON geometry type --
function extractPointsFromGeometry(geom: GeoJSON.Geometry): [number, number][] {
  const points: [number, number][] = [];
  switch (geom.type) {
    case "Point":
      points.push([geom.coordinates[1], geom.coordinates[0]]);
      break;
    case "MultiPoint":
      geom.coordinates.forEach((c) => points.push([c[1], c[0]]));
      break;
    case "LineString":
      geom.coordinates.forEach((c) => points.push([c[1], c[0]]));
      break;
    case "MultiLineString":
      geom.coordinates.forEach((line) => line.forEach((c) => points.push([c[1], c[0]])));
      break;
    case "Polygon":
      geom.coordinates[0].forEach((c) => points.push([c[1], c[0]]));
      break;
    case "MultiPolygon":
      geom.coordinates.forEach((poly) => poly[0].forEach((c) => points.push([c[1], c[0]])));
      break;
    case "GeometryCollection":
      geom.geometries.forEach((g) => points.push(...extractPointsFromGeometry(g)));
      break;
  }
  return points;
}

// -- FitBounds component --
function FitBoundsToData({
  parks, turbines, plots,
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
      points.push(...extractPointsFromGeometry(plot.geometry));
    });

    if (points.length > 0) {
      fitted.current = true;
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 });
    }
  }, [map, parks, turbines, plots]);

  return null;
}

// -- Icon factories --
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

// -- Get lease status color --
function getLeaseStatusColor(plot: GISPlotFeature): string {
  if (!plot.activeLease) return LEASE_STATUS_COLORS.NONE;
  return LEASE_STATUS_COLORS[plot.activeLease.status] ?? LEASE_STATUS_COLORS.NONE;
}

// -- Centroid of polygon --
function getPolygonCentroid(geometry: GeoJSON.Geometry): [number, number] | null {
  const points = extractPointsFromGeometry(geometry);
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [lat, lng];
}

// -- Heatmap opacity based on area --
function getHeatmapOpacity(areaSqm: number | null, maxArea: number): number {
  if (!areaSqm || maxArea === 0) return 0.1;
  return 0.1 + 0.6 * (areaSqm / maxArea);
}

// -- Props --
interface GISMapProps {
  parks: ParkData[];
  turbines: TurbineData[];
  plots: GISPlotFeature[];
  annotations: AnnotationData[];
  tileLayer: TileLayerType;
  layers: LayerVisibility;
  settings: GISSettings;
  drawMode: "off" | "plot" | "annotation";
  pendingGeometry: GeoJSON.Geometry | null;
  onDrawCreated: (geometry: GeoJSON.Geometry) => void;
  onFeatureClick: (feature: SelectedFeature) => void;
  onMeasureResult: (result: { type: "distance" | "area"; value: number } | null) => void;
  isMeasuring: boolean;
  selectedFeatureId: string | null;
}

// -- Event handler for coordinate search flyto --
function MapEventHandler() {
  const map = useMap();
  useEffect(() => {
    const handleFlyTo = (e: Event) => {
      const { lat, lng } = (e as CustomEvent).detail;
      map.setView([lat, lng], 16);
      // Add temporary marker at searched coordinates
      const marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(`${lat.toFixed(5)}, ${lng.toFixed(5)}`).openPopup();
      setTimeout(() => map.removeLayer(marker), 10000);
    };

    // Copy map center coordinates to clipboard
    const handleCopyCenter = () => {
      const center = map.getCenter();
      const text = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        window.dispatchEvent(new CustomEvent("gis:center-copied", { detail: text }));
      });
    };

    window.addEventListener("gis:flyto", handleFlyTo);
    window.addEventListener("gis:copy-center", handleCopyCenter);
    return () => {
      window.removeEventListener("gis:flyto", handleFlyTo);
      window.removeEventListener("gis:copy-center", handleCopyCenter);
    };
  }, [map]);
  return null;
}

// -- Main map component --
export function GISMap({
  parks,
  turbines,
  plots,
  annotations,
  tileLayer,
  layers,
  settings,
  drawMode,
  pendingGeometry,
  onDrawCreated,
  onFeatureClick,
  onMeasureResult,
  isMeasuring,
  selectedFeatureId,
}: GISMapProps) {
  const parkIcon = useMemo(() => createParkIcon(), []);
  const turbineActiveIcon = useMemo(() => createTurbineIcon(true), []);
  const turbineInactiveIcon = useMemo(() => createTurbineIcon(false), []);

  const tile = TILE_CONFIGS[tileLayer];

  // Max area for heatmap normalization
  const maxArea = useMemo(() => {
    const areas = plots.map((p) => (typeof p.areaSqm === "number" ? p.areaSqm : 0)).filter((a) => a > 0);
    return areas.length > 0 ? Math.max(...areas) : 1;
  }, [plots]);

  // Plots GeoJSON
  const plotsGeoJsonKey = useMemo(
    () => plots.map((p) => `${p.id}-${p.activeLease?.status ?? "none"}`).join("|")
      + `-sel:${selectedFeatureId}`
      + `-lease:${layers.leaseStatus}`
      + `-heat:${layers.heatmap}`
      + `-op:${settings.plotOpacity}`,
    [plots, selectedFeatureId, layers.leaseStatus, layers.heatmap, settings.plotOpacity]
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

      const isSelected = plot.id === selectedFeatureId;

      // Heatmap mode
      if (layers.heatmap) {
        return {
          color: isSelected ? "#000" : "#ef4444",
          weight: isSelected ? 3 : 1,
          fillColor: "#ef4444",
          fillOpacity: getHeatmapOpacity(plot.areaSqm, maxArea),
        };
      }

      // Lease status mode
      if (layers.leaseStatus) {
        const statusColor = getLeaseStatusColor(plot);
        return {
          color: isSelected ? "#000" : statusColor,
          weight: isSelected ? 3 : 2,
          fillColor: statusColor,
          fillOpacity: isSelected ? 0.5 : settings.plotOpacity + 0.05,
        };
      }

      // Default: area type coloring
      const hasLease = !!plot.activeLease;
      const dominantType = getDominantAreaType(plot);
      const fillColor = PLOT_AREA_COLORS[dominantType] ?? "#757575";

      if (!hasLease) {
        return {
          color: isSelected ? "#000" : "#ef4444",
          weight: isSelected ? 3 : 2,
          fillColor: "#ef4444",
          fillOpacity: isSelected ? 0.4 : settings.plotOpacity * 0.67,
          dashArray: isSelected ? undefined : "6 4",
        };
      }

      return {
        color: isSelected ? "#000" : fillColor,
        weight: isSelected ? 3 : 2,
        fillColor,
        fillOpacity: isSelected ? 0.5 : settings.plotOpacity,
      };
    };
  }, [plotById, selectedFeatureId, layers.leaseStatus, layers.heatmap, maxArea, settings.plotOpacity]);

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
      onMeasureResult({ type: "distance", value: calcPolylineLength(geometry) });
    } else if (geometry.type === "Polygon") {
      onMeasureResult({ type: "area", value: calcPolygonAreaSqm(geometry) });
    }
  }, [onMeasureResult]);

  // Turbines with coordinates
  const turbinesWithCoords = useMemo(
    () => turbines.filter((t) => t.latitude != null && t.longitude != null),
    [turbines]
  );

  // Buffer zones: WEA_STANDORT plots get a 300m circle
  const bufferRadius = settings.bufferRadiusM;
  const bufferCenters = useMemo(() => {
    if (!layers.bufferZones) return [];
    return plots
      .filter((p) => {
        if (!p.geometry) return false;
        return p.plotAreas.some((a) => a.areaType === "WEA_STANDORT");
      })
      .map((p) => {
        const center = getPolygonCentroid(p.geometry!);
        return center ? { id: p.id, center, name: p.plotNumber } : null;
      })
      .filter(Boolean) as { id: string; center: [number, number]; name: string }[];
  }, [plots, layers.bufferZones]);

  return (
    <MapContainer
      center={[51.1657, 10.4515]}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer url={tile.url} attribution={tile.attribution} />

      <MapEventHandler />
      <FitBoundsToData parks={parks} turbines={turbines} plots={plots} />

      {/* Plot polygons */}
      {layers.plots && plotsGeoJsonData.features.length > 0 && (
        <GeoJSON
          key={`plots-${plotsGeoJsonKey}`}
          data={plotsGeoJsonData}
          style={stylePlot}
          onEachFeature={onEachPlot}
        />
      )}

      {/* Buffer zones (300m circles around WEA_STANDORT) */}
      {layers.bufferZones && bufferCenters.map((bc) => (
        <Circle
          key={`buffer-${bc.id}`}
          center={bc.center}
          radius={bufferRadius}
          pathOptions={{
            color: "#335E99",
            weight: 1,
            fillColor: "#335E99",
            fillOpacity: 0.08,
            dashArray: "4 4",
          }}
        />
      ))}

      {/* Annotations */}
      {layers.annotations && annotations.length > 0 && (
        <MapAnnotationLayer
          annotations={annotations}
          visible={layers.annotations}
        />
      )}

      {/* Park markers */}
      {layers.parks &&
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
      {layers.turbines &&
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

      {/* Preview of pending geometry (drawn but not yet saved) */}
      {pendingGeometry && (
        <GeoJSON
          key={`pending-${JSON.stringify(pendingGeometry).slice(0, 50)}`}
          data={{
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: pendingGeometry,
              properties: {},
            }],
          } as GeoJSON.FeatureCollection}
          style={() => ({
            color: "#335E99",
            weight: 3,
            fillColor: "#335E99",
            fillOpacity: 0.2,
            dashArray: "8 4",
          })}
        />
      )}
    </MapContainer>
  );
}
