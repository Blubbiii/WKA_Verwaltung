"use client";

import { useState } from "react";
import type { NetworkNodeType } from "@/types/topology";
import { NODE_TYPE_CONFIG } from "@/types/topology";
import {
  Save,
  Wand2,
  Pencil,
  Eye,
  Plus,
  Link2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =============================================================================
// TYPES
// =============================================================================

interface TopologyToolbarProps {
  editMode: boolean;
  onToggleEditMode: () => void;
  onSave: () => void;
  onAutoLayout: () => void;
  onAddNode: (type: NetworkNodeType) => void;
  onCancelAddNode: () => void;
  onToggleConnectionDrawing: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  addNodeType: NetworkNodeType | null;
  drawingConnection: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  hasChanges: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopologyToolbar({
  editMode,
  onToggleEditMode,
  onSave,
  onAutoLayout,
  onAddNode,
  onCancelAddNode,
  onToggleConnectionDrawing,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  addNodeType,
  drawingConnection,
  isSaving,
  isGenerating,
  hasChanges,
}: TopologyToolbarProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<NetworkNodeType>("TURBINE");

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-background border rounded-lg">
      {/* Edit/View toggle */}
      <Button
        variant={editMode ? "default" : "outline"}
        size="sm"
        onClick={onToggleEditMode}
      >
        {editMode ? (
          <>
            <Eye className="mr-2 h-4 w-4" />
            Ansicht
          </>
        ) : (
          <>
            <Pencil className="mr-2 h-4 w-4" />
            Bearbeiten
          </>
        )}
      </Button>

      {/* Separator */}
      <div className="w-px h-6 bg-border" />

      {/* Edit mode tools */}
      {editMode && (
        <>
          {/* Add node controls */}
          <div className="flex items-center gap-1">
            <Select
              value={selectedNodeType}
              onValueChange={(v) => setSelectedNodeType(v as NetworkNodeType)}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Knotentyp" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(NODE_TYPE_CONFIG) as NetworkNodeType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {NODE_TYPE_CONFIG[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={addNodeType ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                if (addNodeType) {
                  onCancelAddNode();
                } else {
                  onAddNode(selectedNodeType);
                }
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {addNodeType ? "Abbrechen" : "Platzieren"}
            </Button>
          </div>

          {/* Draw connection */}
          <Button
            variant={drawingConnection ? "destructive" : "outline"}
            size="sm"
            onClick={onToggleConnectionDrawing}
          >
            <Link2 className="mr-1 h-3.5 w-3.5" />
            {drawingConnection ? "Abbrechen" : "Verbinden"}
          </Button>

          {/* Separator */}
          <div className="w-px h-6 bg-border" />

          {/* Auto layout */}
          <Button
            variant="outline"
            size="sm"
            onClick={onAutoLayout}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" />
            )}
            Auto-Layout
          </Button>

          {/* Save */}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Speichern
          </Button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
          <span className="sr-only">Herauszoomen</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomReset}>
          <Maximize className="h-4 w-4" />
          <span className="sr-only">Zoom zuruecksetzen</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
          <span className="sr-only">Hineinzoomen</span>
        </Button>
      </div>
    </div>
  );
}
