"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, Layers, Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ParkData, LayerVisibility, GISPlotFeature, GISSettings } from "./types";
import { Input } from "@/components/ui/input";
import {
  PLOT_AREA_COLORS,
  PLOT_AREA_LABELS,
  LEASE_STATUS_COLORS,
  LEASE_STATUS_LABELS,
} from "./types";

interface GISLayerPanelProps {
  parks: ParkData[];
  parkFilter: string;
  onParkFilterChange: (v: string) => void;
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
  plotCount: number;
  turbineCount: number;
  annotationCount: number;
  plots: GISPlotFeature[];
  settings: GISSettings;
  onSettingsChange: (update: Partial<GISSettings>) => void;
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
      <span className="text-sm text-foreground group-hover:text-foreground flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{count}</span>
      )}
    </label>
  );
}

const AREA_TYPE_ENTRIES = Object.entries(PLOT_AREA_LABELS) as [string, string][];
const LEASE_STATUS_ENTRIES = Object.entries(LEASE_STATUS_LABELS) as [string, string][];

export function GISLayerPanel({
  parks,
  parkFilter,
  onParkFilterChange,
  layers,
  onToggleLayer,
  plotCount,
  turbineCount,
  annotationCount,
  plots,
  settings,
  onSettingsChange,
}: GISLayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Area statistics
  const areaStats = useMemo(() => {
    const stats: Record<string, number> = {};
    plots.forEach((p) => {
      p.plotAreas.forEach((a) => {
        stats[a.areaType] = (stats[a.areaType] ?? 0) + a.areaSqm;
      });
    });
    return stats;
  }, [plots]);

  const totalArea = useMemo(
    () => plots.reduce((s, p) => s + (p.areaSqm ?? 0), 0),
    [plots]
  );

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Ebenen einblenden"
        className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-2.5 flex items-center justify-center hover:bg-background transition-colors"
      >
        <Layers className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-3 w-60 max-h-[calc(100vh-160px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Ebenen</span>
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
            {parks.length === 0 && (
              <SelectItem value="_empty" disabled>
                Keine Parks vorhanden
              </SelectItem>
            )}
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
          checked={layers.parks}
          onToggle={() => onToggleLayer("parks")}
          dotColor="#335E99"
          label="Parks"
          count={parks.length}
        />
        <LayerCheckbox
          checked={layers.turbines}
          onToggle={() => onToggleLayer("turbines")}
          dotColor="#22c55e"
          label="Turbinen"
          count={turbineCount}
        />
        <LayerCheckbox
          checked={layers.plots}
          onToggle={() => onToggleLayer("plots")}
          dotColor="#757575"
          label="Flurstücke"
          count={plotCount}
        />
        <LayerCheckbox
          checked={layers.annotations}
          onToggle={() => onToggleLayer("annotations")}
          dotColor="#6366f1"
          label="Zeichnungen"
          count={annotationCount}
        />

        <Separator className="my-1" />

        {/* Special layers */}
        <LayerCheckbox
          checked={layers.leaseStatus}
          onToggle={() => onToggleLayer("leaseStatus")}
          dotColor="#22c55e"
          label="Pachtstatus"
        />
        <LayerCheckbox
          checked={layers.bufferZones}
          onToggle={() => onToggleLayer("bufferZones")}
          dotColor="#335E99"
          label="Abstandszonen"
        />
        <LayerCheckbox
          checked={layers.heatmap}
          onToggle={() => onToggleLayer("heatmap")}
          dotColor="#ef4444"
          label="Heatmap"
        />
      </div>

      <Separator className="my-2" />

      {/* Legend: lease status (when active) */}
      {layers.leaseStatus && (
        <>
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">Pachtstatus</p>
            <div className="space-y-1">
              {LEASE_STATUS_ENTRIES.map(([status, label]) => (
                <div key={status} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: LEASE_STATUS_COLORS[status] }}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-2" />
        </>
      )}

      {/* Legend: plot area types (when not in lease/heatmap mode) */}
      {!layers.leaseStatus && !layers.heatmap && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1.5">Flächentypen</p>
          <div className="space-y-1">
            {AREA_TYPE_ENTRIES.map(([type, label]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: PLOT_AREA_COLORS[type] }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: "#757575" }}
              />
              <span className="text-xs text-muted-foreground">Ohne Typ</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 border border-dashed border-red-400"
                style={{ background: "#ef444430" }}
              />
              <span className="text-xs text-muted-foreground">Kein Vertrag</span>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap legend */}
      {layers.heatmap && (
        <>
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">Heatmap</p>
            <div className="h-2 rounded-full bg-gradient-to-r from-red-100 to-red-600" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>Klein</span>
              <span>Groß</span>
            </div>
          </div>
          <Separator className="my-2" />
        </>
      )}

      {/* Area statistics */}
      {plotCount > 0 && Object.keys(areaStats).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Flächenstatistik</p>
          <div className="space-y-1">
            {AREA_TYPE_ENTRIES.map(([type, label]) => {
              const val = areaStats[type];
              if (!val) return null;
              return (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground font-medium">
                    {(val / 10000).toFixed(2)} ha
                  </span>
                </div>
              );
            })}
            {totalArea > 0 && (
              <div className="flex items-center justify-between text-xs pt-1 border-t mt-1">
                <span className="text-muted-foreground font-medium">Gesamt</span>
                <span className="text-foreground font-semibold">
                  {(totalArea / 10000).toFixed(2)} ha
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <Separator className="my-2" />

      {/* Settings toggle */}
      <div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wide">Einstellungen</span>
        </button>

        {showSettings && (
          <div className="mt-2 space-y-3">
            {/* Buffer radius */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Abstandszone</span>
                <span className="text-foreground font-medium">{settings.bufferRadiusM} m</span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={settings.bufferRadiusM}
                onChange={(e) => onSettingsChange({ bufferRadiusM: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50 m</span>
                <span>1000 m</span>
              </div>
            </div>

            {/* Plot opacity */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Flächen-Deckkraft</span>
                <span className="text-foreground font-medium">{Math.round(settings.plotOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={settings.plotOpacity}
                onChange={(e) => onSettingsChange({ plotOpacity: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Min plot area */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Mindestfläche</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="0"
                  step="10"
                  value={settings.minPlotAreaSqm}
                  onChange={(e) => onSettingsChange({ minPlotAreaSqm: parseInt(e.target.value) || 0 })}
                  className="h-7 text-xs w-20"
                />
                <span className="text-xs text-muted-foreground">m²</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
