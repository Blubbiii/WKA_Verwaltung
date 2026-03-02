"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PlotGeoJsonLayer,
  buildOwnerColorMap,
  OWNER_PALETTE,
} from "./PlotGeoJsonLayer";
import type { PlotFeature } from "./PlotGeoJsonLayer";
import { MapLayerControl } from "./MapLayerControl";
import { WfsCadastralLayer } from "./WfsCadastralLayer";
import { MapAnnotationLayer } from "./MapAnnotationLayer";
import type { MapAnnotationData } from "./MapAnnotationLayer";
import { DrawControl } from "./DrawControl";
import { AnnotationSaveDialog } from "./AnnotationSaveDialog";
import type { Feature, Geometry } from "geojson";

// Types
interface TurbineLocation {
  id: string;
  designation: string;
  latitude: number | null;
  longitude: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  ratedPowerKw: number | null;
}

interface ParkMapProps {
  parkName: string;
  parkId?: string;
  parkLatitude: number | null;
  parkLongitude: number | null;
  turbines: TurbineLocation[];
  plots?: PlotFeature[];
  wfsFeatures?: Feature<Geometry>[];
  annotations?: MapAnnotationData[];
  onAnnotationSaved?: () => void;
  className?: string;
  height?: string;
}

// Custom DivIcon for park center
const createParkIcon = () =>
  L.divIcon({
    className: "custom-park-marker",
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #335E99 0%, #1d4ed8 100%);
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

// Custom DivIcon for active turbine
const createTurbineIcon = () =>
  L.divIcon({
    className: "custom-turbine-marker",
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    ">
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

// Custom DivIcon for inactive turbine
const createInactiveTurbineIcon = () =>
  L.divIcon({
    className: "custom-turbine-marker-inactive",
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    ">
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

/** Extract all [lat, lng] points from a GeoJSON geometry. */
function extractCoordsFromGeometry(
  geometry: GeoJSON.Geometry
): [number, number][] {
  const points: [number, number][] = [];

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const coord of ring) {
        points.push([coord[1], coord[0]]); // GeoJSON is [lng, lat]
      }
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const coord of ring) {
          points.push([coord[1], coord[0]]);
        }
      }
    }
  }

  return points;
}

// Component to fit bounds automatically (now includes plot geometry)
function FitBoundsToMarkers({
  parkLat,
  parkLng,
  turbines,
  plots,
}: {
  parkLat: number | null;
  parkLng: number | null;
  turbines: TurbineLocation[];
  plots?: PlotFeature[];
}) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    if (parkLat != null && parkLng != null) {
      points.push([parkLat, parkLng]);
    }

    turbines.forEach((t) => {
      if (t.latitude != null && t.longitude != null) {
        points.push([Number(t.latitude), Number(t.longitude)]);
      }
    });

    // Include plot geometry bounds
    if (plots && plots.length > 0) {
      for (const plot of plots) {
        if (plot.geometry) {
          const plotPoints = extractCoordsFromGeometry(plot.geometry);
          points.push(...plotPoints);
        }
      }
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, parkLat, parkLng, turbines, plots]);

  return null;
}

export function ParkMap({
  parkName,
  parkId,
  parkLatitude,
  parkLongitude,
  turbines,
  plots,
  wfsFeatures,
  annotations,
  onAnnotationSaved,
  className,
  height = "400px",
}: ParkMapProps) {
  // Layer visibility state
  const [showTurbines, setShowTurbines] = useState(true);
  const [showPlots, setShowPlots] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showWfsLayer, setShowWfsLayer] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Draw mode state
  const [drawMode, setDrawMode] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const handleDrawCreated = useCallback((geometry: GeoJSON.Geometry) => {
    setPendingGeometry(geometry);
    setSaveDialogOpen(true);
  }, []);

  // Create icons once
  const parkIcon = useMemo(() => createParkIcon(), []);
  const turbineIcon = useMemo(() => createTurbineIcon(), []);
  const inactiveTurbineIcon = useMemo(() => createInactiveTurbineIcon(), []);

  // Filter turbines with valid coordinates
  const turbinesWithCoords = useMemo(
    () => turbines.filter((t) => t.latitude != null && t.longitude != null),
    [turbines]
  );

  // Build owner legend from plots data
  const ownerLegend = useMemo(() => {
    if (!plots || plots.length === 0) return [];

    const colorMap = buildOwnerColorMap(plots);
    const legend: { name: string; color: string }[] = [];

    // Build a name->color mapping, using sorted unique lessorIds
    const seenIds = new Set<string>();
    // Sort plots by lessorId so order is consistent
    const sortedPlots = [...plots].sort((a, b) =>
      (a.lessorId || "").localeCompare(b.lessorId || "")
    );

    for (const plot of sortedPlots) {
      if (plot.lessorId && !seenIds.has(plot.lessorId)) {
        seenIds.add(plot.lessorId);
        legend.push({
          name: plot.lessorName || "Unbekannt",
          color: colorMap.get(plot.lessorId) || OWNER_PALETTE[0],
        });
      }
    }

    return legend;
  }, [plots]);

  // Determine whether we have plots to show
  const hasPlots = plots && plots.length > 0;

  // Determine map center
  const hasValidParkCoords = parkLatitude != null && parkLongitude != null;
  const hasAnyCoords = hasValidParkCoords || turbinesWithCoords.length > 0;

  // Default center (Germany) if no coordinates
  const defaultCenter: [number, number] = [51.1657, 10.4515];

  let center: [number, number] = defaultCenter;
  if (hasValidParkCoords) {
    center = [Number(parkLatitude), Number(parkLongitude)];
  } else if (turbinesWithCoords.length > 0) {
    center = [
      Number(turbinesWithCoords[0].latitude),
      Number(turbinesWithCoords[0].longitude),
    ];
  }

  // Show placeholder if no coordinates at all
  if (!hasAnyCoords) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border bg-muted ${className || ""}`}
        style={{ height }}
      >
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Keine Koordinaten verfügbar</p>
          <p className="text-xs mt-1">
            Fuegen Sie Koordinaten hinzu, um die Karte anzuzeigen
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        className={`rounded-lg border ${className || ""}`}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Mitwirkende'
          url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
        />

        <FitBoundsToMarkers
          parkLat={parkLatitude}
          parkLng={parkLongitude}
          turbines={turbines}
          plots={plots}
        />

        {/* WFS cadastral parcels (lowest z-order) */}
        {wfsFeatures && wfsFeatures.length > 0 && (
          <WfsCadastralLayer features={wfsFeatures} visible={showWfsLayer} />
        )}

        {/* Annotations layer */}
        {annotations && annotations.length > 0 && (
          <MapAnnotationLayer annotations={annotations} visible={showAnnotations} />
        )}

        {/* Plot polygons (rendered before markers so polygons appear behind) */}
        {hasPlots && (
          <PlotGeoJsonLayer
            plots={plots!}
            visible={showPlots}
            showLabels={showLabels}
          />
        )}

        {/* Park center marker */}
        {showTurbines && hasValidParkCoords && (
          <Marker
            position={[Number(parkLatitude), Number(parkLongitude)]}
            icon={parkIcon}
          >
            <Popup>
              <div className="font-semibold">{parkName}</div>
              <div className="text-xs text-muted-foreground">Parkzentrum</div>
            </Popup>
          </Marker>
        )}

        {/* Turbine markers */}
        {showTurbines &&
          turbinesWithCoords.map((turbine) => (
            <Marker
              key={turbine.id}
              position={[Number(turbine.latitude), Number(turbine.longitude)]}
              icon={
                turbine.status === "ACTIVE" ? turbineIcon : inactiveTurbineIcon
              }
            >
              <Popup>
                <div className="font-semibold">{turbine.designation}</div>
                {turbine.ratedPowerKw && (
                  <div className="text-xs">
                    {turbine.ratedPowerKw >= 1000
                      ? `${(turbine.ratedPowerKw / 1000).toFixed(1)} MW`
                      : `${turbine.ratedPowerKw} kW`}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {turbine.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Draw control (only when parkId is provided and draw mode active) */}
        {parkId && drawMode && (
          <DrawControl onCreated={handleDrawCreated} />
        )}
      </MapContainer>

      {/* Draw mode toggle button */}
      {parkId && (
        <button
          className={`absolute bottom-3 left-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-medium shadow-md border transition-colors ${
            drawMode
              ? "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
          onClick={() => setDrawMode(!drawMode)}
          title={drawMode ? "Zeichenmodus beenden" : "Zeichenmodus starten"}
        >
          {drawMode ? "Zeichnen beenden" : "Zeichnen"}
        </button>
      )}

      {/* Layer control overlay */}
      <MapLayerControl
        showTurbines={showTurbines}
        onToggleTurbines={setShowTurbines}
        showPlots={showPlots}
        onTogglePlots={setShowPlots}
        showLabels={showLabels}
        onToggleLabels={setShowLabels}
        ownerLegend={ownerLegend}
        hasWfsFeatures={!!wfsFeatures && wfsFeatures.length > 0}
        showWfsLayer={showWfsLayer}
        onToggleWfsLayer={setShowWfsLayer}
        hasAnnotations={!!annotations && annotations.length > 0}
        showAnnotations={showAnnotations}
        onToggleAnnotations={setShowAnnotations}
      />

      {/* Annotation save dialog */}
      {parkId && (
        <AnnotationSaveDialog
          open={saveDialogOpen}
          onOpenChange={(open) => {
            setSaveDialogOpen(open);
            if (!open) setPendingGeometry(null);
          }}
          geometry={pendingGeometry}
          parkId={parkId}
          onSaved={() => {
            setPendingGeometry(null);
            onAnnotationSaved?.();
          }}
        />
      )}
    </div>
  );
}
