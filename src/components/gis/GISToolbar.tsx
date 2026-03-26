"use client";

import { LandPlot, Ruler, Download, Loader2, Map } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { TileLayerType, MeasureResult } from "./types";

interface GISToolbarProps {
  tileLayer: TileLayerType;
  onTileLayerChange: (v: TileLayerType) => void;
  drawMode: "off" | "plot";
  onToggleDrawMode: () => void;
  isMeasuring: boolean;
  onToggleMeasure: () => void;
  measureResult: MeasureResult | null;
  onExport: (type: "all" | "plots" | "annotations") => void;
  loading: boolean;
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
}: GISToolbarProps) {
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
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
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              tileLayer === btn.key
                ? "bg-primary text-primary-foreground"
                : "bg-white text-muted-foreground hover:bg-muted"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-border" />

      {/* Draw plot button */}
      <button
        onClick={onToggleDrawMode}
        title={drawMode === "plot" ? "Zeichenmodus beenden" : "Flurstück einzeichnen"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
          drawMode === "plot"
            ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
            : "bg-white text-muted-foreground border-border hover:bg-muted"
        }`}
      >
        <LandPlot className="h-3.5 w-3.5" />
        <span>Flurstück</span>
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-border" />

      {/* Measure button */}
      <button
        onClick={onToggleMeasure}
        title={isMeasuring ? "Messen beenden" : "Messen (Strecke/Fläche)"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
          isMeasuring
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-white text-muted-foreground border-border hover:bg-muted"
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

      {/* Divider */}
      <div className="h-5 w-px bg-border" />

      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[2000]">
          <DropdownMenuItem onClick={() => onExport("all")}>
            Alle Layer (GeoJSON)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("plots")}>
            Flurstücke
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("annotations")}>
            Annotationen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
