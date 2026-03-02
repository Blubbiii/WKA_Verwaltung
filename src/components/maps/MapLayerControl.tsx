"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface OwnerLegendEntry {
  id: string;
  name: string;
  color: string;
}

interface MapLayerControlProps {
  showTurbines: boolean;
  onToggleTurbines: (show: boolean) => void;
  showPlots: boolean;
  onTogglePlots: (show: boolean) => void;
  showLabels: boolean;
  onToggleLabels: (show: boolean) => void;
  ownerLegend: OwnerLegendEntry[];
  hiddenOwnerIds: Set<string>;
  onToggleOwner: (ownerId: string) => void;
  hasAnnotations?: boolean;
  showAnnotations?: boolean;
  onToggleAnnotations?: (show: boolean) => void;
}

// Small inline SVG icons for each toggle row
function TurbineIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-600"
    >
      <path d="M12 2v8" />
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      <path d="m19.07 10.93-1.41 1.41" />
      <path d="M22 22H2" />
      <path d="m8 22 4-10 4 10" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-600"
    >
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" x2="9" y1="3" y2="18" />
      <line x1="15" x2="15" y1="6" y2="21" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-600"
    >
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

export function MapLayerControl({
  showTurbines,
  onToggleTurbines,
  showPlots,
  onTogglePlots,
  showLabels,
  onToggleLabels,
  ownerLegend,
  hiddenOwnerIds,
  onToggleOwner,
  hasAnnotations,
  showAnnotations,
  onToggleAnnotations,
}: MapLayerControlProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute top-3 right-3 z-[1000] bg-white rounded-lg shadow-lg border border-gray-200 min-w-[180px]"
      style={collapsed ? undefined : { resize: "vertical", overflow: "auto", maxHeight: "calc(100% - 24px)", minHeight: "80px" }}
      // Prevent map drag/scroll events from firing when interacting with this panel
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header — always visible, click to collapse/expand */}
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded-t-lg"
        onClick={() => setCollapsed(!collapsed)}
      >
        Ebenen
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {collapsed ? null : (
      <div className="px-3 pb-3">

      {/* Turbines toggle */}
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div className="flex items-center gap-2">
          <TurbineIcon />
          <Label
            htmlFor="toggle-turbines"
            className="text-sm font-medium cursor-pointer select-none"
          >
            WEA-Standorte
          </Label>
        </div>
        <Switch
          id="toggle-turbines"
          checked={showTurbines}
          onCheckedChange={onToggleTurbines}
          aria-label="WEA-Standorte ein-/ausblenden"
        />
      </div>

      {/* Plots toggle */}
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div className="flex items-center gap-2">
          <MapIcon />
          <Label
            htmlFor="toggle-plots"
            className="text-sm font-medium cursor-pointer select-none"
          >
            Flurstuecke
          </Label>
        </div>
        <Switch
          id="toggle-plots"
          checked={showPlots}
          onCheckedChange={onTogglePlots}
          aria-label="Flurstuecke ein-/ausblenden"
        />
      </div>

      {/* Labels toggle */}
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div className="flex items-center gap-2">
          <TagIcon />
          <Label
            htmlFor="toggle-labels"
            className="text-sm font-medium cursor-pointer select-none"
          >
            Beschriftungen
          </Label>
        </div>
        <Switch
          id="toggle-labels"
          checked={showLabels}
          onCheckedChange={onToggleLabels}
          aria-label="Beschriftungen ein-/ausblenden"
        />
      </div>

      {/* Annotations layer toggle */}
      {hasAnnotations && onToggleAnnotations && (
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-indigo-600"
            >
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
            <Label
              htmlFor="toggle-annotations"
              className="text-sm font-medium cursor-pointer select-none"
            >
              Zeichnungen
            </Label>
          </div>
          <Switch
            id="toggle-annotations"
            checked={showAnnotations ?? true}
            onCheckedChange={onToggleAnnotations}
            aria-label="Zeichnungen ein-/ausblenden"
          />
        </div>
      )}

      {/* Owner Legend (clickable toggles) */}
      {ownerLegend.length > 0 && (
        <>
          <Separator className="my-2" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Eigentuemer
          </p>
          <ul className="space-y-0.5">
            {ownerLegend.map((entry) => {
              const isHidden = hiddenOwnerIds.has(entry.id);
              return (
                <li key={entry.id}>
                  <button
                    className="flex items-center gap-2 w-full px-1 py-0.5 rounded hover:bg-gray-50 transition-colors text-left"
                    onClick={() => onToggleOwner(entry.id)}
                    title={isHidden ? `${entry.name} einblenden` : `${entry.name} ausblenden`}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full shrink-0 border"
                      style={{
                        backgroundColor: isHidden ? "transparent" : entry.color,
                        borderColor: entry.color,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-xs truncate ${isHidden ? "text-gray-400 line-through" : "text-gray-700"}`}
                    >
                      {entry.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Status Legend */}
      <Separator className="my-2" />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Vertragsstatus
      </p>
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0 border-2"
            style={{
              backgroundColor: "rgba(34,197,94,0.3)",
              borderColor: "#22c55e",
            }}
            aria-hidden="true"
          />
          <span className="text-xs text-gray-700">Aktiver Vertrag</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{
              backgroundColor: "rgba(245,158,11,0.2)",
              border: "2px dashed #f59e0b",
            }}
            aria-hidden="true"
          />
          <span className="text-xs text-gray-700">Entwurf</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{
              backgroundColor: "rgba(239,68,68,0.2)",
              border: "2px dashed #ef4444",
            }}
            aria-hidden="true"
          />
          <span className="text-xs text-gray-700">Ohne Vertrag</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0 border-2"
            style={{
              backgroundColor: "rgba(156,163,175,0.15)",
              borderColor: "#9ca3af",
            }}
            aria-hidden="true"
          />
          <span className="text-xs text-gray-700">Abgelaufen</span>
        </li>
      </ul>
      </div>
      )}
    </div>
  );
}
