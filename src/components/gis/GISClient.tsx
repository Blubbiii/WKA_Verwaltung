"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { GISToolbar } from "./GISToolbar";
import { GISLayerPanel } from "./GISLayerPanel";
import { GISFeatureInfo } from "./GISFeatureInfo";
import { GISPlotCreatePanel } from "./GISPlotCreatePanel";
import type {
  ParkData,
  TurbineData,
  GISPlotFeature,
  AnnotationData,
  SelectedFeature,
  TileLayerType,
  MeasureResult,
} from "./types";

// Load the Leaflet map without SSR
const GISMap = dynamic(
  () => import("./GISMap").then((m) => m.GISMap),
  { ssr: false, loading: () => <div className="flex-1 bg-muted animate-pulse" /> }
);

interface GISData {
  parks: ParkData[];
  turbines: TurbineData[];
  plots: GISPlotFeature[];
  annotations: AnnotationData[];
}

const EMPTY_DATA: GISData = { parks: [], turbines: [], plots: [], annotations: [] };

function handleExport(
  type: "all" | "plots" | "annotations",
  data: GISData
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = [];

  if (type === "all" || type === "plots") {
    data.plots.forEach((p) => {
      if (!p.geometry) return;
      features.push({
        type: "Feature",
        geometry: p.geometry,
        properties: {
          id: p.id,
          cadastralDistrict: p.cadastralDistrict,
          fieldNumber: p.fieldNumber,
          plotNumber: p.plotNumber,
          areaSqm: p.areaSqm,
          parkName: p.park?.name ?? null,
          leaseStatus: p.activeLease?.status ?? null,
          lessorName: p.activeLease?.lessorName ?? null,
        },
      });
    });
  }

  if (type === "all" || type === "annotations") {
    data.annotations.forEach((a) => {
      features.push({
        type: "Feature",
        geometry: a.geometry,
        properties: { id: a.id, name: a.name, type: a.type, description: a.description },
      });
    });
  }

  const geojson = JSON.stringify({ type: "FeatureCollection", features }, null, 2);
  const blob = new Blob([geojson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}-export.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GISClient() {
  const [data, setData] = useState<GISData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [parkFilter, setParkFilter] = useState("all");

  // Layer visibility
  const [showParks, setShowParks] = useState(true);
  const [showTurbines, setShowTurbines] = useState(true);
  const [showPlots, setShowPlots] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Tile layer
  const [tileLayer, setTileLayer] = useState<TileLayerType>("osm");

  // Feature selection
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature | null>(null);

  // Draw mode
  const [drawMode, setDrawMode] = useState<"off" | "plot">("off");
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // Measure
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);

  // Fetch GIS data
  useEffect(() => {
    const url =
      parkFilter === "all"
        ? "/api/gis/features"
        : `/api/gis/features?parkId=${parkFilter}`;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: GISData) => {
        if (!cancelled && Array.isArray(d.parks)) setData(d);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [parkFilter]);

  const handleDrawCreated = useCallback((geometry: GeoJSON.Geometry) => {
    setPendingGeometry(geometry);
    setShowCreatePanel(true);
    setDrawMode("off");
  }, []);

  const handleFeatureClick = useCallback((feature: SelectedFeature) => {
    setSelectedFeature(feature);
    setShowCreatePanel(false);
  }, []);

  const handleMeasureResult = useCallback(
    (result: { type: "distance" | "area"; value: number } | null) => {
      setMeasureResult(result);
      setIsMeasuring(false);
    },
    []
  );

  const handleToggleMeasure = useCallback(() => {
    setIsMeasuring((v) => {
      if (v) setMeasureResult(null);
      return !v;
    });
  }, []);

  const handleToggleDrawMode = useCallback(() => {
    setDrawMode((v) => (v === "off" ? "plot" : "off"));
    setShowCreatePanel(false);
    setPendingGeometry(null);
  }, []);

  const handlePlotSaved = useCallback(
    (plotId: string) => {
      setShowCreatePanel(false);
      setPendingGeometry(null);
      setDrawMode("off");
      // Refresh data
      const url =
        parkFilter === "all"
          ? "/api/gis/features"
          : `/api/gis/features?parkId=${parkFilter}`;
      fetch(url)
        .then((r) => r.json())
        .then((d: GISData) => { if (Array.isArray(d.parks)) setData(d); })
        .catch(console.error);
      void plotId;
    },
    [parkFilter]
  );

  return (
    <div className="relative overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      {/* Map fills 100% */}
      <div className="absolute inset-0">
        <GISMap
          parks={data.parks}
          turbines={data.turbines}
          plots={data.plots}
          annotations={data.annotations}
          tileLayer={tileLayer}
          showParks={showParks}
          showTurbines={showTurbines}
          showPlots={showPlots}
          showAnnotations={showAnnotations}
          drawMode={drawMode}
          onDrawCreated={handleDrawCreated}
          onFeatureClick={handleFeatureClick}
          onMeasureResult={handleMeasureResult}
          isMeasuring={isMeasuring}
        />
      </div>

      {/* Toolbar — top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
        <GISToolbar
          tileLayer={tileLayer}
          onTileLayerChange={setTileLayer}
          drawMode={drawMode}
          onToggleDrawMode={handleToggleDrawMode}
          isMeasuring={isMeasuring}
          onToggleMeasure={handleToggleMeasure}
          measureResult={measureResult}
          onExport={(type) => handleExport(type, data)}
          loading={loading}
        />
      </div>

      {/* Layer panel — top left */}
      <div className="absolute top-16 left-3 z-[1000]">
        <GISLayerPanel
          parks={data.parks}
          parkFilter={parkFilter}
          onParkFilterChange={setParkFilter}
          showParks={showParks}
          onToggleParks={() => setShowParks((v) => !v)}
          showTurbines={showTurbines}
          onToggleTurbines={() => setShowTurbines((v) => !v)}
          showPlots={showPlots}
          onTogglePlots={() => setShowPlots((v) => !v)}
          showAnnotations={showAnnotations}
          onToggleAnnotations={() => setShowAnnotations((v) => !v)}
          plotCount={data.plots.filter((p) => p.geometry).length}
          turbineCount={data.turbines.length}
        />
      </div>

      {/* Right panel — feature info OR plot create */}
      <div className="absolute top-16 right-3 z-[1000]">
        {showCreatePanel && pendingGeometry ? (
          <GISPlotCreatePanel
            geometry={pendingGeometry}
            parks={data.parks}
            onSaved={handlePlotSaved}
            onCancel={() => {
              setShowCreatePanel(false);
              setPendingGeometry(null);
              setDrawMode("off");
            }}
          />
        ) : (
          <GISFeatureInfo
            feature={selectedFeature}
            onClose={() => setSelectedFeature(null)}
          />
        )}
      </div>

      {/* Status bar — bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm border rounded-full px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-3 pointer-events-none">
        <span>{data.parks.length} Parks</span>
        <span>&middot;</span>
        <span>{data.turbines.length} Turbinen</span>
        <span>&middot;</span>
        <span>{data.plots.filter((p) => p.geometry).length} Flurstücke</span>
        <span>&middot;</span>
        <span>{data.annotations.length} Zeichnungen</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
      </div>

      {/* Draw mode hint */}
      {drawMode === "plot" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white rounded-full px-4 py-1.5 text-xs font-medium shadow-lg pointer-events-none">
          Klicke auf die Karte, um ein Flurstück einzuzeichnen
        </div>
      )}

      {/* Measure hint */}
      {isMeasuring && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-xs font-medium shadow-lg pointer-events-none">
          Fläche einzeichnen zum Messen (Doppelklick zum Beenden)
        </div>
      )}
    </div>
  );
}
