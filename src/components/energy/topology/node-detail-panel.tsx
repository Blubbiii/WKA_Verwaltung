"use client";

import type { TopologyNode } from "@/types/topology";
import { NODE_TYPE_CONFIG, NODE_STATUS_LABELS, NODE_STATUS_COLORS } from "@/types/topology";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// =============================================================================
// TYPES
// =============================================================================

interface NodeDetailPanelProps {
  node: TopologyNode | null;
  onClose: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  if (!node) return null;

  const typeConfig = NODE_TYPE_CONFIG[node.type];
  const statusLabel = NODE_STATUS_LABELS[node.status];
  const statusColor = NODE_STATUS_COLORS[node.status];

  return (
    <div className="w-80 border-l bg-background p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold truncate">{node.name}</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
          <X className="h-4 w-4" />
          <span className="sr-only">Schliessen</span>
        </Button>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2 mb-4">
        <Badge
          variant="outline"
          style={{ borderColor: typeConfig.color, color: typeConfig.color }}
        >
          {typeConfig.label}
        </Badge>
        <Badge
          variant="secondary"
          style={{ backgroundColor: statusColor + "20", color: statusColor }}
        >
          {statusLabel}
        </Badge>
      </div>

      {/* Position */}
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Position</p>
          <p className="text-sm font-mono">
            X: {node.posX.toFixed(1)}% / Y: {node.posY.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Turbine details */}
      {node.turbine && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold">Turbinen-Details</h4>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Bezeichnung</p>
            <p className="text-sm">{node.turbine.designation}</p>
          </div>

          {node.turbine.manufacturer && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Hersteller</p>
              <p className="text-sm">{node.turbine.manufacturer}</p>
            </div>
          )}

          {node.turbine.model && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Modell</p>
              <p className="text-sm">{node.turbine.model}</p>
            </div>
          )}

          {node.turbine.ratedPowerKw != null && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Nennleistung</p>
              <p className="text-sm font-mono">
                {Number(node.turbine.ratedPowerKw).toLocaleString("de-DE")} kW
              </p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Gerätetyp</p>
            <p className="text-sm">{node.turbine.deviceType}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Anlagen-Status</p>
            <Badge variant={node.turbine.status === "ACTIVE" ? "default" : "secondary"}>
              {node.turbine.status === "ACTIVE" ? "Aktiv" : node.turbine.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Metadata */}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold">Metadaten</h4>
          {Object.entries(node.metadata).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground mb-0.5">{key}</p>
              <p className="text-sm font-mono">{String(value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
