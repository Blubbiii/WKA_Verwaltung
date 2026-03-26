"use client";

import { useState } from "react";
import { ChevronLeft, Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ParkData } from "./types";
import { PLOT_AREA_COLORS, PLOT_AREA_LABELS } from "./types";

interface GISLayerPanelProps {
  parks: ParkData[];
  parkFilter: string;
  onParkFilterChange: (v: string) => void;
  showParks: boolean;
  onToggleParks: () => void;
  showTurbines: boolean;
  onToggleTurbines: () => void;
  showPlots: boolean;
  onTogglePlots: () => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  plotCount: number;
  turbineCount: number;
}

interface LayerCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  dotColor: string;
  label: string;
  count?: number;
}

function LayerCheckbox({ checked, onToggle, dotColor, label, count }: LayerCheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
      />
      <span
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: dotColor }}
      />
      <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{count}</span>
      )}
    </label>
  );
}

const AREA_TYPE_ENTRIES = Object.entries(PLOT_AREA_LABELS) as [string, string][];

export function GISLayerPanel({
  parks,
  parkFilter,
  onParkFilterChange,
  showParks,
  onToggleParks,
  showTurbines,
  onToggleTurbines,
  showPlots,
  onTogglePlots,
  showAnnotations,
  onToggleAnnotations,
  plotCount,
  turbineCount,
}: GISLayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Ebenen einblenden"
        className="bg-white/95 backdrop-blur-sm border rounded-lg shadow-lg p-2.5 flex items-center justify-center hover:bg-white transition-colors"
      >
        <Layers className="h-4 w-4 text-gray-600" />
      </button>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-lg shadow-lg p-3 w-56">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Ebenen</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded hover:bg-muted transition-colors"
          title="Einklappen"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Park filter */}
      <div className="mb-2">
        <label className="text-xs text-muted-foreground mb-1 block">Park</label>
        <Select value={parkFilter} onValueChange={onParkFilterChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Alle Parks" />
          </SelectTrigger>
          <SelectContent className="z-[2000]">
            <SelectItem value="all">Alle Parks</SelectItem>
            {parks.map((park) => (
              <SelectItem key={park.id} value={park.id}>
                {park.shortName || park.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="my-2" />

      {/* Layer checkboxes */}
      <div className="space-y-2 mb-3">
        <LayerCheckbox
          checked={showParks}
          onToggle={onToggleParks}
          dotColor="#335E99"
          label="Parks"
          count={parks.length}
        />
        <LayerCheckbox
          checked={showTurbines}
          onToggle={onToggleTurbines}
          dotColor="#22c55e"
          label="Turbinen"
          count={turbineCount}
        />
        <LayerCheckbox
          checked={showPlots}
          onToggle={onTogglePlots}
          dotColor="#757575"
          label="Flurstücke"
          count={plotCount}
        />
        <LayerCheckbox
          checked={showAnnotations}
          onToggle={onToggleAnnotations}
          dotColor="#6366f1"
          label="Zeichnungen"
        />
      </div>

      <Separator className="my-2" />

      {/* Plot area type legend */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Flächentypen</p>
        <div className="space-y-1">
          {AREA_TYPE_ENTRIES.map(([type, label]) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: PLOT_AREA_COLORS[type] }}
              />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ background: "#757575" }}
            />
            <span className="text-xs text-gray-600">Ohne Typ</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 border border-dashed border-red-400"
              style={{ background: "#ef444430" }}
            />
            <span className="text-xs text-gray-600">Kein Vertrag</span>
          </div>
        </div>
      </div>
    </div>
  );
}
