"use client";

import { NODE_TYPE_CONFIG, CABLE_TYPE_COLORS, NODE_STATUS_COLORS, NODE_STATUS_LABELS } from "@/types/topology";
import type { NetworkNodeType, NodeStatus } from "@/types/topology";

// =============================================================================
// COMPONENT
// =============================================================================

export function TopologyLegend() {
  return (
    <div className="flex flex-wrap gap-6 p-3 bg-background border rounded-lg text-xs">
      {/* Node types */}
      <div>
        <p className="font-semibold text-muted-foreground mb-1.5">Knotentypen</p>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(NODE_TYPE_CONFIG) as [NetworkNodeType, typeof NODE_TYPE_CONFIG[NetworkNodeType]][]).map(
            ([type, config]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm border"
                  style={{
                    backgroundColor: config.color + "30",
                    borderColor: config.color,
                  }}
                />
                <span>{config.label}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Cable types */}
      <div>
        <p className="font-semibold text-muted-foreground mb-1.5">Kabeltypen</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(CABLE_TYPE_COLORS)
            .filter(([key]) => !["Mittelspannung", "Niederspannung"].includes(key))
            .map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
                <span>{type}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Status colors */}
      <div>
        <p className="font-semibold text-muted-foreground mb-1.5">Status</p>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(NODE_STATUS_COLORS) as [NodeStatus, string][]).map(
            ([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{NODE_STATUS_LABELS[status]}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
