"use client";

import { useState, useRef } from "react";
import {
  LandPlot, Ruler, Download, Loader2, Map, Undo2, Redo2, Printer,
  Search, Upload, Globe, X, PenLine, Layers,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { TileLayerType, MeasureResult } from "./types";

interface GISToolbarProps {
  tileLayer: TileLayerType;
  onTileLayerChange: (v: TileLayerType) => void;
  drawMode: "off" | "plot" | "annotation";
  onToggleDrawMode: (mode?: "plot" | "annotation") => void;
  isMeasuring: boolean;
  onToggleMeasure: () => void;
  measureResult: MeasureResult | null;
  onExport: (type: "all" | "plots" | "annotations") => void;
  loading: boolean;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onCoordinateSearch?: (lat: number, lng: number) => void;
  onImportGeoJSON?: (geojson: GeoJSON.FeatureCollection) => void;
}

const TILE_BUTTONS: { key: TileLayerType; label: string }[] = [
  { key: "osm", label: "OSM" },
  { key: "satellite", label: "Satellit" },
  { key: "topo", label: "Topo" },
];

function formatMeasureResult(result: MeasureResult): string {
  if (result.type === "distance") {
    if (result.value >= 1000) return `${(result.value / 1000).toFixed(2)} km`;
    return `${Math.round(result.value)} m`;
  }
  if (result.value >= 10000) return `${(result.value / 10000).toFixed(2)} ha`;
  return `${Math.round(result.value)} m²`;
}

export function GISToolbar({
  tileLayer,
  onTileLayerChange,
  drawMode,
  onToggleDrawMode,
  isMeasuring,
  onToggleMeasure,
  measureResult,
  onExport,
  loading,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
}: GISToolbarProps) {
  const [showCoordSearch, setShowCoordSearch] = useState(false);
  const [coordInput, setCoordInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoordSearch = () => {
    const parts = coordInput.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) {
      toast.error("Ungültige Koordinaten. Format: 51.1657, 10.4515");
      return;
    }
    const [lat, lng] = parts;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Koordinaten außerhalb gültiger Bereiche (Lat: -90..90, Lng: -180..180)");
      return;
    }
    // Dispatch custom event for map to handle
    window.dispatchEvent(
      new CustomEvent("gis:flyto", { detail: { lat, lng } })
    );
    setShowCoordSearch(false);
    setCoordInput("");
    toast.success(`Karte zentriert auf ${parts[0].toFixed(4)}, ${parts[1].toFixed(4)}`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size limit check (20 MB)
    const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_IMPORT_SIZE) {
      toast.error(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB`);
      e.target.value = "";
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "shp" || ext === "zip") {
        // Shapefile import via shpjs
        const shp = await import("shpjs");
        const buffer = await file.arrayBuffer();
        const geojson = await shp.default(buffer);
        const fc = Array.isArray(geojson) ? geojson[0] : geojson;
        window.dispatchEvent(new CustomEvent("gis:import", { detail: fc }));
        toast.success(`${file.name} importiert (${(fc as GeoJSON.FeatureCollection).features?.length ?? 0} Features)`);
      } else {
        // GeoJSON / JSON import
        const text = await file.text();
        const geojson = JSON.parse(text);
        if (geojson.type === "FeatureCollection" || geojson.type === "Feature") {
          window.dispatchEvent(new CustomEvent("gis:import", { detail: geojson }));
          toast.success(`${file.name} importiert`);
        } else {
          toast.error("Ungültiges GeoJSON-Format");
        }
      }
    } catch {
      toast.error("Datei konnte nicht gelesen werden");
    }

    // Reset input so same file can be imported again
    e.target.value = "";
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

        {/* Map icon */}
        <Map className="h-4 w-4 text-primary shrink-0" />

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Tile layer buttons */}
        <div className="flex items-center gap-0.5 rounded-md border overflow-hidden">
          {TILE_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              onClick={() => onTileLayerChange(btn.key)}
              aria-label={btn.label}
              aria-pressed={tileLayer === btn.key}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                tileLayer === btn.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Draw plot button */}
        <button
          onClick={() => onToggleDrawMode("plot")}
          title={drawMode === "plot" ? "Zeichenmodus beenden" : "Flurstück einzeichnen"}
          aria-label={drawMode === "plot" ? "Zeichenmodus beenden" : "Flurstück einzeichnen"}
          aria-pressed={drawMode === "plot"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            drawMode === "plot"
              ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <LandPlot className="h-3.5 w-3.5" />
          <span>Flurstück</span>
        </button>

        {/* Draw annotation button */}
        <button
          onClick={() => onToggleDrawMode("annotation")}
          title={drawMode === "annotation" ? "Zeichenmodus beenden" : "Kabeltrasse / Zeichnung erstellen"}
          aria-label={drawMode === "annotation" ? "Zeichenmodus beenden" : "Zeichnung erstellen"}
          aria-pressed={drawMode === "annotation"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            drawMode === "annotation"
              ? "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <PenLine className="h-3.5 w-3.5" />
          <span>Zeichnung</span>
        </button>

        {/* Undo button */}
        {canUndo && (
          <button
            onClick={onUndo}
            title="Letzte Zeichnung rückgängig"
            aria-label="Letzte Zeichnung rückgängig"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}

        {canRedo && (
          <button
            onClick={onRedo}
            aria-label="Wiederherstellen"
            title="Wiederherstellen"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="h-5 w-px bg-border" />

        {/* Measure button */}
        <button
          onClick={onToggleMeasure}
          title={isMeasuring ? "Messen beenden" : "Messen (Strecke/Fläche)"}
          aria-label={isMeasuring ? "Messen beenden" : "Messen (Strecke/Fläche)"}
          aria-pressed={isMeasuring}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            isMeasuring
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
          <span>Messen</span>
        </button>
        {measureResult && !isMeasuring && (
          <span className="text-xs font-semibold text-primary">
            {formatMeasureResult(measureResult)}
          </span>
        )}

        <div className="h-5 w-px bg-border" />

        {/* Coordinate search */}
        <button
          onClick={() => setShowCoordSearch(!showCoordSearch)}
          title="Koordinatensuche"
          aria-label="Koordinatensuche"
          aria-expanded={showCoordSearch}
          className={`p-1.5 rounded-md border transition-colors ${
            showCoordSearch
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        {/* Import */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Importieren"
              aria-label="Importieren"
              className="p-1.5 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[2000]">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Globe className="h-3.5 w-3.5 mr-2" />
              GeoJSON / Shapefile (Quick-Import)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = "/gis/import"}>
              <Layers className="h-3.5 w-3.5 mr-2" />
              QGIS-Projekt importieren (Wizard)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,.shp,.zip"
          className="hidden"
          onChange={handleImport}
        />

        {/* Print */}
        <button
          onClick={handlePrint}
          title="Karte drucken"
          aria-label="Karte drucken"
          className="p-1.5 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
        >
          <Printer className="h-3.5 w-3.5" />
        </button>

        <div className="h-5 w-px bg-border" />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2.5" aria-label="Export">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[2000]">
            <DropdownMenuItem onClick={() => onExport("all")}>
              Alle Layer (GeoJSON)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("plots")}>
              Flurstücke
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("annotations")}>
              Annotationen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              window.dispatchEvent(new CustomEvent("gis:export-area-report"));
              toast.info("Flächenreport wird generiert...");
            }}>
              Flächenreport (Excel)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Coordinate search input */}
      {showCoordSearch && (
        <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
          <Input
            value={coordInput}
            onChange={(e) => setCoordInput(e.target.value)}
            placeholder="Lat, Lng (z.B. 51.1657, 10.4515)"
            className="h-7 text-xs w-56"
            onKeyDown={(e) => e.key === "Enter" && handleCoordSearch()}
          />
          <Button size="sm" className="h-7 px-2" onClick={handleCoordSearch}>
            <Search className="h-3 w-3" />
          </Button>
          <button
            onClick={() => { setShowCoordSearch(false); setCoordInput(""); }}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
