"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface OwnerLegendEntry {
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
}: MapLayerControlProps) {
  return (
    <div
      className="absolute top-3 right-3 z-[1000] bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px] max-h-[calc(100%-24px)] overflow-y-auto"
      // Prevent map drag/scroll events from firing when interacting with this panel
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Ebenen
      </p>

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

      {/* Owner Legend */}
      {ownerLegend.length > 0 && (
        <>
          <Separator className="my-2" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Eigentuemer
          </p>
          <ul className="space-y-1">
            {ownerLegend.map((entry) => (
              <li key={entry.name} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span className="text-xs text-gray-700 truncate">
                  {entry.name}
                </span>
              </li>
            ))}
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
  );
}
