"use client";

import { useReducer, useEffect, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, AlertTriangle, MapPinOff, RefreshCw, Undo2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GISToolbar } from "./GISToolbar";
import { GISLayerPanel } from "./GISLayerPanel";
import { GISFeatureInfo } from "./GISFeatureInfo";
import { GISPlotCreatePanel } from "./GISPlotCreatePanel";
import { GISAnnotationCreatePanel } from "./GISAnnotationCreatePanel";
import type {
  GISState,
  GISAction,
  GISData,
  GISSettings,
  SelectedFeature,
  TileLayerType,
  MeasureResult,
  LayerVisibility,
} from "./types";
import { DEFAULT_LAYER_VISIBILITY, DEFAULT_GIS_SETTINGS } from "./types";

// Load the Leaflet map without SSR
const GISMap = dynamic(
  () => import("./GISMap").then((m) => m.GISMap),
  { ssr: false, loading: () => <div className="flex-1 bg-muted animate-pulse" /> }
);

const EMPTY_DATA: GISData = { parks: [], turbines: [], plots: [], annotations: [] };

const INITIAL_STATE: GISState = {
  data: EMPTY_DATA,
  loading: false,
  error: null,
  parkFilter: "all",
  tileLayer: "osm",
  layers: DEFAULT_LAYER_VISIBILITY,
  settings: DEFAULT_GIS_SETTINGS,
  selectedFeature: null,
  drawMode: "off",
  pendingGeometry: null,
  showCreatePanel: false,
  isMeasuring: false,
  measureResult: null,
  drawnFeatures: [],
  redoStack: [],
  selectedFeatureId: null,
};

function gisReducer(state: GISState, action: GISAction): GISState {
  switch (action.type) {
    case "SET_DATA":
      return { ...state, data: action.payload, error: null };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_PARK_FILTER":
      return { ...state, parkFilter: action.payload };
    case "SET_TILE_LAYER":
      return { ...state, tileLayer: action.payload };
    case "TOGGLE_LAYER":
      return {
        ...state,
        layers: { ...state.layers, [action.payload]: !state.layers[action.payload] },
      };
    case "SET_SELECTED_FEATURE":
      return {
        ...state,
        selectedFeature: action.payload,
        showCreatePanel: false,
        selectedFeatureId: action.payload
          ? ("id" in action.payload.data ? (action.payload.data as { id: string }).id : null)
          : null,
      };
    case "SET_DRAW_MODE":
      return {
        ...state,
        drawMode: action.payload,
        ...(action.payload === "off" ? { pendingGeometry: null, showCreatePanel: false } : {}),
      };
    case "SET_PENDING_GEOMETRY":
      return { ...state, pendingGeometry: action.payload };
    case "SET_SHOW_CREATE_PANEL":
      return { ...state, showCreatePanel: action.payload };
    case "SET_MEASURING":
      return {
        ...state,
        isMeasuring: action.payload,
        ...(action.payload ? {} : { measureResult: null }),
      };
    case "SET_MEASURE_RESULT":
      return { ...state, measureResult: action.payload, isMeasuring: false };
    case "ADD_DRAWN_FEATURE":
      // Adding a new draw clears the redo stack
      return { ...state, drawnFeatures: [...state.drawnFeatures, action.payload], redoStack: [] };
    case "UNDO_LAST_DRAW": {
      if (state.drawnFeatures.length === 0) return state;
      const undone = state.drawnFeatures[state.drawnFeatures.length - 1];
      return {
        ...state,
        drawnFeatures: state.drawnFeatures.slice(0, -1),
        redoStack: [...state.redoStack, undone],
      };
    }
    case "REDO_LAST_DRAW": {
      if (state.redoStack.length === 0) return state;
      const redone = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        drawnFeatures: [...state.drawnFeatures, redone],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    case "CLEAR_DRAWN_FEATURES":
      return { ...state, drawnFeatures: [], redoStack: [] };
    case "SET_SELECTED_FEATURE_ID":
      return { ...state, selectedFeatureId: action.payload };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    default:
      return state;
  }
}

function handleExport(type: "all" | "plots" | "annotations", data: GISData) {
  const features: GeoJSON.Feature[] = [];

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

// Validate API response shape
function isValidGISData(d: unknown): d is GISData {
  if (!d || typeof d !== "object") return false;
  const obj = d as Record<string, unknown>;
  return (
    Array.isArray(obj.parks) &&
    Array.isArray(obj.turbines) &&
    Array.isArray(obj.plots) &&
    Array.isArray(obj.annotations)
  );
}

export function GISClient() {
  const [state, dispatch] = useReducer(gisReducer, INITIAL_STATE);
  const { data, loading, error, parkFilter, tileLayer, layers, settings,
    selectedFeature, drawMode, pendingGeometry, showCreatePanel, isMeasuring,
    measureResult, drawnFeatures, redoStack, selectedFeatureId } = state;

  // Fetch GIS data — returns a promise so callers can await it
  const fetchData = useCallback((filter: string): Promise<void> => {
    const url = filter === "all"
      ? "/api/gis/features"
      : `/api/gis/features?parkId=${filter}`;

    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    return fetch(url)
      .then((r) => r.json())
      .then((d: unknown) => {
        if (isValidGISData(d)) {
          dispatch({ type: "SET_DATA", payload: d });
        } else {
          const errMsg = (d as { error?: string })?.error ?? "Ungültiges Antwortformat";
          dispatch({ type: "SET_ERROR", payload: errMsg });
          toast.error(errMsg);
        }
      })
      .catch((err: Error) => {
        dispatch({ type: "SET_ERROR", payload: err.message });
        toast.error("Netzwerkfehler beim Laden der GIS-Daten");
      })
      .finally(() => {
        dispatch({ type: "SET_LOADING", payload: false });
      });
  }, []);

  useEffect(() => {
    fetchData(parkFilter);
  }, [parkFilter, fetchData]);

  // Listen for center-copied events from map (Fix 3: copy coordinates)
  useEffect(() => {
    const handleCopied = (e: Event) => {
      toast.success(`Koordinaten kopiert: ${(e as CustomEvent).detail}`);
    };
    window.addEventListener("gis:center-copied", handleCopied);
    return () => window.removeEventListener("gis:center-copied", handleCopied);
  }, []);

  // Listen for area report export event from toolbar
  useEffect(() => {
    const handleExportAreaReport = () => {
      const url = parkFilter === "all"
        ? "/api/gis/area-report"
        : `/api/gis/area-report?parkId=${parkFilter}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = "flaechenreport.xlsx";
      a.click();
    };
    window.addEventListener("gis:export-area-report", handleExportAreaReport);
    return () => window.removeEventListener("gis:export-area-report", handleExportAreaReport);
  }, [parkFilter]);

  // Track which draw mode created the geometry (for panel selection)
  const [pendingDrawType, setPendingDrawType] = useState<"plot" | "annotation">("plot");

  const handleDrawCreated = useCallback((geometry: GeoJSON.Geometry) => {
    setPendingDrawType(drawMode === "annotation" ? "annotation" : "plot");
    dispatch({ type: "SET_PENDING_GEOMETRY", payload: geometry });
    dispatch({ type: "SET_SHOW_CREATE_PANEL", payload: true });
    dispatch({ type: "SET_DRAW_MODE", payload: "off" });
    dispatch({ type: "ADD_DRAWN_FEATURE", payload: { id: crypto.randomUUID(), geometry } });
  }, [drawMode]);

  const handleFeatureClick = useCallback((feature: SelectedFeature) => {
    dispatch({ type: "SET_SELECTED_FEATURE", payload: feature });
  }, []);

  const handleMeasureResult = useCallback((result: MeasureResult | null) => {
    dispatch({ type: "SET_MEASURE_RESULT", payload: result });
  }, []);

  const handleToggleMeasure = useCallback(() => {
    dispatch({ type: "SET_MEASURING", payload: !isMeasuring });
  }, [isMeasuring]);

  const handleToggleDrawMode = useCallback((mode?: "plot" | "annotation") => {
    const target = mode ?? "plot";
    dispatch({ type: "SET_DRAW_MODE", payload: drawMode === target ? "off" : target });
  }, [drawMode]);

  const handlePlotSaved = useCallback(() => {
    dispatch({ type: "SET_SHOW_CREATE_PANEL", payload: false });
    dispatch({ type: "SET_DRAW_MODE", payload: "off" });
    // Keep pendingGeometry visible as preview until new data is loaded
    fetchData(parkFilter).then(() => {
      dispatch({ type: "SET_PENDING_GEOMETRY", payload: null });
      dispatch({ type: "CLEAR_DRAWN_FEATURES" });
    });
  }, [parkFilter, fetchData]);

  const handleAnnotationDeleted = useCallback(() => {
    dispatch({ type: "SET_SELECTED_FEATURE", payload: null });
    fetchData(parkFilter);
  }, [parkFilter, fetchData]);

  const handleUndo = useCallback(() => {
    dispatch({ type: "UNDO_LAST_DRAW" });
  }, []);

  const handleRedo = useCallback(() => {
    dispatch({ type: "REDO_LAST_DRAW" });
  }, []);

  const handleTileLayerChange = useCallback((v: TileLayerType) => {
    dispatch({ type: "SET_TILE_LAYER", payload: v });
  }, []);

  const handleParkFilterChange = useCallback((v: string) => {
    dispatch({ type: "SET_PARK_FILTER", payload: v });
  }, []);

  const handleToggleLayer = useCallback((layer: keyof LayerVisibility) => {
    dispatch({ type: "TOGGLE_LAYER", payload: layer });
  }, []);

  const handleSettingsChange = useCallback((update: Partial<GISSettings>) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: update });
  }, []);

  const plotsWithGeometry = data.plots.filter((p) => p.geometry).length;
  const totalHa = data.plots.reduce((s, p) => s + (p.areaSqm ?? 0), 0) / 10000;
  const isEmpty = !loading && !error &&
    data.parks.length === 0 && data.turbines.length === 0 &&
    data.plots.length === 0 && data.annotations.length === 0;

  return (
    <div className="relative" style={{ height: "calc(100vh - 64px)" }}>
      <style>{`
        @media print {
          .leaflet-control-container,
          [class*="absolute top-"],
          [class*="absolute bottom-"] {
            display: none !important;
          }
          .leaflet-container {
            width: 100% !important;
            height: 100vh !important;
          }
        }
      `}</style>
      {/* Map fills 100% */}
      <div className="absolute inset-0">
        <GISMap
          parks={data.parks}
          turbines={data.turbines}
          plots={data.plots}
          annotations={data.annotations}
          tileLayer={tileLayer}
          layers={layers}
          settings={settings}
          drawMode={drawMode}
          pendingGeometry={pendingGeometry}
          onDrawCreated={handleDrawCreated}
          onFeatureClick={handleFeatureClick}
          onMeasureResult={handleMeasureResult}
          isMeasuring={isMeasuring}
          selectedFeatureId={selectedFeatureId}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-destructive/90 text-destructive-foreground rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg max-w-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs hover:bg-white/20"
            onClick={() => fetchData(parkFilter)}
            aria-label="Erneut laden"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-xl border shadow-lg p-8 text-center pointer-events-auto max-w-sm">
            <MapPinOff className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-sm mb-1">Keine Geodaten vorhanden</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Es sind noch keine Parks, Turbinen oder Flurstücke mit Koordinaten angelegt.
            </p>
            <Button size="sm" variant="outline" onClick={() => fetchData(parkFilter)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Erneut laden
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar — top center */}
      {!error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
          <GISToolbar
            tileLayer={tileLayer}
            onTileLayerChange={handleTileLayerChange}
            drawMode={drawMode}
            onToggleDrawMode={handleToggleDrawMode}
            isMeasuring={isMeasuring}
            onToggleMeasure={handleToggleMeasure}
            measureResult={measureResult}
            onExport={(type) => handleExport(type, data)}
            loading={loading}
            canUndo={drawnFeatures.length > 0}
            onUndo={handleUndo}
            canRedo={redoStack.length > 0}
            onRedo={handleRedo}
          />
        </div>
      )}

      {/* Layer panel — left center */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-[1000]">
        <GISLayerPanel
          parks={data.parks}
          parkFilter={parkFilter}
          onParkFilterChange={handleParkFilterChange}
          layers={layers}
          onToggleLayer={handleToggleLayer}
          plotCount={plotsWithGeometry}
          turbineCount={data.turbines.length}
          annotationCount={data.annotations.length}
          plots={data.plots}
          settings={settings}
          onSettingsChange={handleSettingsChange}
        />
      </div>

      {/* Right panel — feature info OR plot create */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-[1000]">
        {showCreatePanel && pendingGeometry && pendingDrawType === "annotation" ? (
          <GISAnnotationCreatePanel
            geometry={pendingGeometry}
            parks={data.parks}
            onSaved={() => {
              dispatch({ type: "SET_SHOW_CREATE_PANEL", payload: false });
              fetchData(parkFilter).then(() => {
                dispatch({ type: "SET_PENDING_GEOMETRY", payload: null });
                dispatch({ type: "CLEAR_DRAWN_FEATURES" });
              });
            }}
            onCancel={() => {
              dispatch({ type: "SET_SHOW_CREATE_PANEL", payload: false });
              dispatch({ type: "SET_PENDING_GEOMETRY", payload: null });
            }}
          />
        ) : showCreatePanel && pendingGeometry ? (
          <GISPlotCreatePanel
            geometry={pendingGeometry}
            parks={data.parks}
            minAreaSqm={settings.minPlotAreaSqm}
            onSaved={handlePlotSaved}
            onCancel={() => {
              dispatch({ type: "SET_SHOW_CREATE_PANEL", payload: false });
              dispatch({ type: "SET_PENDING_GEOMETRY", payload: null });
              dispatch({ type: "SET_DRAW_MODE", payload: "off" });
            }}
          />
        ) : (
          <GISFeatureInfo
            feature={selectedFeature}
            onClose={() => dispatch({ type: "SET_SELECTED_FEATURE", payload: null })}
            onAnnotationDeleted={handleAnnotationDeleted}
            onRefresh={() => fetchData(parkFilter)}
          />
        )}
      </div>

      {/* Status bar — bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm border rounded-full px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-3 pointer-events-none">
        <span>{data.parks.length} Parks</span>
        <span>&middot;</span>
        <span>{data.turbines.length} Turbinen</span>
        <span>&middot;</span>
        <span>{plotsWithGeometry} Flurstücke</span>
        <span>&middot;</span>
        <span>{data.annotations.length} Zeichnungen</span>
        {totalHa > 0 && (
          <>
            <span>&middot;</span>
            <span>{totalHa.toFixed(1)} ha</span>
          </>
        )}
        {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        <button
          className="pointer-events-auto ml-1 p-0.5 rounded hover:bg-muted/50 transition-colors"
          aria-label="Koordinaten kopieren"
          title="Karten-Koordinaten kopieren"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("gis:copy-center"));
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>

      {/* Undo button — bottom left */}
      {drawnFeatures.length > 0 && (
        <div className="absolute bottom-4 left-3 z-[1000]">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 bg-background/90 backdrop-blur-sm shadow-md"
            onClick={handleUndo}
            aria-label={`Rückgängig (${drawnFeatures.length})`}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Rückgängig ({drawnFeatures.length})
          </Button>
        </div>
      )}

      {/* Draw mode hint */}
      {drawMode === "plot" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white rounded-full px-4 py-1.5 text-xs font-medium shadow-lg pointer-events-none">
          Klicke auf die Karte, um ein Flurstück einzuzeichnen (Polygon)
        </div>
      )}
      {drawMode === "annotation" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600 text-white rounded-full px-4 py-1.5 text-xs font-medium shadow-lg pointer-events-none">
          Linie zeichnen für Kabeltrasse/Zuwegung (Doppelklick zum Beenden)
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
