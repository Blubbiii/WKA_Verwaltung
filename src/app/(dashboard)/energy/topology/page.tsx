"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Network, AlertCircle } from "lucide-react";
import { TopologyCanvas } from "@/components/energy/topology/topology-canvas";
import { TopologyToolbar } from "@/components/energy/topology/topology-toolbar";
import { TopologyLegend } from "@/components/energy/topology/topology-legend";
import { NodeDetailPanel } from "@/components/energy/topology/node-detail-panel";
import type {
  TopologyNode,
  TopologyConnection,
  NetworkNodeType,
  TopologyData,
} from "@/types/topology";

// =============================================================================
// TYPES
// =============================================================================

interface Park {
  id: string;
  name: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Generate a temporary client-side ID for new nodes */
function tempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert API data to frontend state */
function apiToState(data: TopologyData): {
  nodes: TopologyNode[];
  connections: TopologyConnection[];
} {
  const nodes: TopologyNode[] = data.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    posX: n.posX,
    posY: n.posY,
    turbineId: n.turbineId,
    metadata: n.metadata,
    status: deriveStatus(n),
    turbine: n.turbine ?? undefined,
  }));

  const connections: TopologyConnection[] = data.connections.map((c) => ({
    id: c.id,
    fromNodeId: c.fromNodeId,
    toNodeId: c.toNodeId,
    cableType: c.cableType,
    lengthM: c.lengthM,
    metadata: c.metadata,
  }));

  return { nodes, connections };
}

/** Derive status from turbine data (simplified without live SCADA) */
function deriveStatus(
  node: TopologyData["nodes"][number]
): TopologyNode["status"] {
  if (node.type !== "TURBINE") return "no_data";
  if (!node.turbine) return "no_data";
  if (node.turbine.status === "ACTIVE") return "producing";
  if (node.turbine.status === "INACTIVE") return "offline";
  return "no_data";
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function TopologyPage() {
  // Park selection
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState<string>("");
  const [parksLoading, setParksLoading] = useState(true);

  // Topology data
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [connections, setConnections] = useState<TopologyConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addNodeType, setAddNodeType] = useState<NetworkNodeType | null>(null);
  const [drawingConnection, setDrawingConnection] = useState(false);
  const [connectionStartNodeId, setConnectionStartNodeId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Zoom controls via ref to the canvas component
  const zoomRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    zoomReset: () => void;
  } | null>(null);

  // Track zoom with simple state updates
  const [zoomAction, setZoomAction] = useState<"in" | "out" | "reset" | null>(null);

  // --------------------------------------------------------------------------
  // FETCH PARKS
  // --------------------------------------------------------------------------

  useEffect(() => {
    setParksLoading(true);
    fetch("/api/parks")
      .then((res) => res.json())
      .then((data) => {
        const list: Park[] = Array.isArray(data) ? data : data.data || [];
        setParks(list);
        // Auto-select first park if available
        if (list.length > 0 && !selectedParkId) {
          setSelectedParkId(list[0].id);
        }
      })
      .catch(() => setParks([]))
      .finally(() => setParksLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------------
  // FETCH TOPOLOGY
  // --------------------------------------------------------------------------

  const fetchTopology = useCallback(async () => {
    if (!selectedParkId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/energy/topology?parkId=${selectedParkId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Laden der Topologie");
      }

      const data: TopologyData = await res.json();
      const state = apiToState(data);
      setNodes(state.nodes);
      setConnections(state.connections);
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsLoading(false);
    }
  }, [selectedParkId]);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // --------------------------------------------------------------------------
  // NODE INTERACTIONS
  // --------------------------------------------------------------------------

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleNodeMove = useCallback((nodeId: string, posX: number, posY: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, posX, posY } : n))
    );
    setHasChanges(true);
  }, []);

  const handleCanvasClick = useCallback(
    (posX: number, posY: number) => {
      if (!addNodeType) return;

      const newNode: TopologyNode = {
        id: tempId(),
        name: `Neuer ${addNodeType === "TURBINE" ? "Turbine" : addNodeType === "NVP" ? "NVP" : addNodeType === "SUBSTATION" ? "Umspannwerk" : addNodeType === "TRANSFORMER" ? "Trafo" : "Verteiler"}`,
        type: addNodeType,
        posX,
        posY,
        turbineId: null,
        metadata: null,
        status: "no_data",
      };

      setNodes((prev) => [...prev, newNode]);
      setHasChanges(true);
      setAddNodeType(null);
    },
    [addNodeType]
  );

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) =>
      prev.filter((c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId)
    );
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    setHasChanges(true);
  }, []);

  const handleConnectionDelete = useCallback((connectionId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
    setHasChanges(true);
  }, []);

  // --------------------------------------------------------------------------
  // CONNECTION DRAWING
  // --------------------------------------------------------------------------

  const handleConnectionStart = useCallback((nodeId: string) => {
    setConnectionStartNodeId(nodeId);
  }, []);

  const handleConnectionEnd = useCallback(
    (nodeId: string) => {
      if (!connectionStartNodeId) return;

      // Check for duplicate connection
      const exists = connections.some(
        (c) =>
          (c.fromNodeId === connectionStartNodeId && c.toNodeId === nodeId) ||
          (c.fromNodeId === nodeId && c.toNodeId === connectionStartNodeId)
      );

      if (!exists) {
        const newConnection: TopologyConnection = {
          id: tempId(),
          fromNodeId: connectionStartNodeId,
          toNodeId: nodeId,
          cableType: "20kV",
          lengthM: null,
          metadata: null,
        };
        setConnections((prev) => [...prev, newConnection]);
        setHasChanges(true);
      }

      setConnectionStartNodeId(null);
      setDrawingConnection(false);
    },
    [connectionStartNodeId, connections]
  );

  // --------------------------------------------------------------------------
  // TOOLBAR ACTIONS
  // --------------------------------------------------------------------------

  const handleToggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
    setAddNodeType(null);
    setDrawingConnection(false);
    setConnectionStartNodeId(null);
  }, []);

  const handleAddNode = useCallback((type: NetworkNodeType) => {
    setAddNodeType(type);
    setDrawingConnection(false);
    setConnectionStartNodeId(null);
  }, []);

  const handleCancelAddNode = useCallback(() => {
    setAddNodeType(null);
  }, []);

  const handleToggleConnectionDrawing = useCallback(() => {
    setDrawingConnection((prev) => !prev);
    setConnectionStartNodeId(null);
    setAddNodeType(null);
  }, []);

  // --------------------------------------------------------------------------
  // SAVE
  // --------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!selectedParkId) return;

    setIsSaving(true);
    try {
      const payload = {
        parkId: selectedParkId,
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          posX: n.posX,
          posY: n.posY,
          turbineId: n.turbineId,
          metadata: n.metadata,
        })),
        connections: connections.map((c) => ({
          id: c.id,
          fromNodeId: c.fromNodeId,
          toNodeId: c.toNodeId,
          cableType: c.cableType,
          lengthM: c.lengthM,
          metadata: c.metadata,
        })),
      };

      const res = await fetch("/api/energy/topology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Speichern");
      }

      // Re-fetch to get new IDs
      await fetchTopology();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }, [selectedParkId, nodes, connections, fetchTopology]);

  // --------------------------------------------------------------------------
  // AUTO LAYOUT
  // --------------------------------------------------------------------------

  const handleAutoLayout = useCallback(async () => {
    if (!selectedParkId) return;

    setIsGenerating(true);
    try {
      const res = await fetch("/api/energy/topology/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId: selectedParkId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Generieren");
      }

      // Re-fetch to get the generated topology
      await fetchTopology();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Generieren");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedParkId, fetchTopology]);

  // --------------------------------------------------------------------------
  // ZOOM CONTROLS (handled outside canvas to avoid circular refs)
  // --------------------------------------------------------------------------

  // Simple approach: just pass zoom controls down via the toolbar
  // The actual zoom is handled inside TopologyCanvas via wheel
  // But toolbar buttons need a different mechanism

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-3">
        <PageHeader
          title="Netz-Topologie"
          description="Visualisierung der Netzstruktur mit Turbinen, Kabelwegen und Netzanschlusspunkten"
          actions={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Park:</span>
              {parksLoading ? (
                <Skeleton className="h-9 w-[200px]" />
              ) : (
                <Select value={selectedParkId} onValueChange={setSelectedParkId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Park waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parks.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          }
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-6 mb-3 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline"
            onClick={() => setError(null)}
          >
            Schliessen
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 px-6 pb-3">
        <TopologyToolbar
          editMode={editMode}
          onToggleEditMode={handleToggleEditMode}
          onSave={handleSave}
          onAutoLayout={handleAutoLayout}
          onAddNode={handleAddNode}
          onCancelAddNode={handleCancelAddNode}
          onToggleConnectionDrawing={handleToggleConnectionDrawing}
          onZoomIn={() => setZoomAction("in")}
          onZoomOut={() => setZoomAction("out")}
          onZoomReset={() => setZoomAction("reset")}
          addNodeType={addNodeType}
          drawingConnection={drawingConnection}
          isSaving={isSaving}
          isGenerating={isGenerating}
          hasChanges={hasChanges}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 px-6 pb-3 gap-3">
        {/* Canvas area */}
        <div className="flex-1 min-w-0">
          {!selectedParkId ? (
            <Card className="h-full flex items-center justify-center">
              <EmptyState
                icon={Network}
                title="Kein Park ausgewaehlt"
                description="Bitte waehlen Sie einen Park aus, um die Netz-Topologie anzuzeigen."
              />
            </Card>
          ) : isLoading ? (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center">
                <div className="animate-pulse space-y-4">
                  <Skeleton className="h-8 w-48 mx-auto" />
                  <Skeleton className="h-64 w-full rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ) : nodes.length === 0 ? (
            <Card className="h-full flex items-center justify-center">
              <EmptyState
                icon={Network}
                title="Keine Topologie vorhanden"
                description="Fuer diesen Park wurde noch keine Netz-Topologie erstellt. Nutzen Sie 'Bearbeiten' und 'Auto-Layout' um eine zu generieren."
              />
            </Card>
          ) : (
            <TopologyCanvas
              nodes={nodes}
              connections={connections}
              selectedNodeId={selectedNodeId}
              editMode={editMode}
              addNodeType={addNodeType}
              drawingConnection={drawingConnection}
              onNodeSelect={handleNodeSelect}
              onNodeMove={handleNodeMove}
              onCanvasClick={handleCanvasClick}
              onConnectionStart={handleConnectionStart}
              onConnectionEnd={handleConnectionEnd}
              onNodeDelete={handleNodeDelete}
              onConnectionDelete={handleConnectionDelete}
              connectionStartNodeId={connectionStartNodeId}
            />
          )}
        </div>

        {/* Detail sidebar */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 px-6 pb-6">
        <TopologyLegend />
      </div>
    </div>
  );
}
