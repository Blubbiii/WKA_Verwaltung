"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  TopologyNode,
  TopologyConnection,
  NetworkNodeType,
  NodeStatus,
} from "@/types/topology";
import {
  CABLE_TYPE_COLORS,
  NODE_TYPE_CONFIG,
  NODE_STATUS_COLORS,
} from "@/types/topology";

// =============================================================================
// TYPES
// =============================================================================

interface TopologyCanvasProps {
  nodes: TopologyNode[];
  connections: TopologyConnection[];
  selectedNodeId: string | null;
  editMode: boolean;
  addNodeType: NetworkNodeType | null;
  drawingConnection: boolean;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeMove: (nodeId: string, posX: number, posY: number) => void;
  onCanvasClick: (posX: number, posY: number) => void;
  onConnectionStart: (nodeId: string) => void;
  onConnectionEnd: (nodeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onConnectionDelete: (connectionId: string) => void;
  connectionStartNodeId: string | null;
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const NODE_RADIUS = 20;
const JUNCTION_RADIUS = 8;

// =============================================================================
// SVG NODE RENDERERS
// =============================================================================

function TurbineIcon({ x, y, status }: { x: number; y: number; status: NodeStatus }) {
  const fillColor = NODE_STATUS_COLORS[status];
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Base circle */}
      <circle r={NODE_RADIUS} fill={fillColor} opacity={0.2} stroke={fillColor} strokeWidth={2} />
      {/* Turbine tower */}
      <line x1={0} y1={2} x2={0} y2={14} stroke={fillColor} strokeWidth={2.5} strokeLinecap="round" />
      {/* Rotor blades (3-blade style) */}
      <line x1={0} y1={2} x2={0} y2={-12} stroke={fillColor} strokeWidth={2} strokeLinecap="round" />
      <line x1={0} y1={2} x2={10} y2={8} stroke={fillColor} strokeWidth={2} strokeLinecap="round" />
      <line x1={0} y1={2} x2={-10} y2={8} stroke={fillColor} strokeWidth={2} strokeLinecap="round" />
      {/* Hub */}
      <circle r={2.5} fill={fillColor} />
    </g>
  );
}

function NvpIcon({ x, y }: { x: number; y: number }) {
  const color = NODE_TYPE_CONFIG.NVP.color;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-NODE_RADIUS}
        y={-NODE_RADIUS}
        width={NODE_RADIUS * 2}
        height={NODE_RADIUS * 2}
        rx={4}
        fill={color}
        opacity={0.2}
        stroke={color}
        strokeWidth={2}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight="bold"
        fill={color}
      >
        NVP
      </text>
    </g>
  );
}

function SubstationIcon({ x, y }: { x: number; y: number }) {
  const color = NODE_TYPE_CONFIG.SUBSTATION.color;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-NODE_RADIUS - 4}
        y={-NODE_RADIUS}
        width={(NODE_RADIUS + 4) * 2}
        height={NODE_RADIUS * 2}
        rx={4}
        fill={color}
        opacity={0.2}
        stroke={color}
        strokeWidth={2}
      />
      {/* Lightning bolt */}
      <path
        d="M-3,-10 L3,-2 L-1,-2 L3,10 L-3,2 L1,2 Z"
        fill={color}
        opacity={0.8}
      />
    </g>
  );
}

function TransformerIcon({ x, y }: { x: number; y: number }) {
  const color = NODE_TYPE_CONFIG.TRANSFORMER.color;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={NODE_RADIUS} fill={color} opacity={0.2} stroke={color} strokeWidth={2} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fontWeight="bold"
        fill={color}
      >
        T
      </text>
    </g>
  );
}

function JunctionIcon({ x, y }: { x: number; y: number }) {
  const color = NODE_TYPE_CONFIG.CABLE_JUNCTION.color;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={JUNCTION_RADIUS} fill={color} opacity={0.6} stroke={color} strokeWidth={2} />
    </g>
  );
}

function renderNodeIcon(node: TopologyNode, x: number, y: number) {
  switch (node.type) {
    case "TURBINE":
      return <TurbineIcon x={x} y={y} status={node.status} />;
    case "NVP":
      return <NvpIcon x={x} y={y} />;
    case "SUBSTATION":
      return <SubstationIcon x={x} y={y} />;
    case "TRANSFORMER":
      return <TransformerIcon x={x} y={y} />;
    case "CABLE_JUNCTION":
      return <JunctionIcon x={x} y={y} />;
    default:
      return <circle cx={x} cy={y} r={NODE_RADIUS} fill="#9ca3af" />;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TopologyCanvas({
  nodes,
  connections,
  selectedNodeId,
  editMode,
  addNodeType,
  drawingConnection,
  onNodeSelect,
  onNodeMove,
  onCanvasClick,
  onConnectionStart,
  onConnectionEnd,
  onNodeDelete,
  onConnectionDelete,
  connectionStartNodeId,
}: TopologyCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // View transform (pan + zoom)
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const transformStartRef = useRef({ x: 0, y: 0 });

  // Drag state
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragNodeStartRef = useRef({ posX: 0, posY: 0 });

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Connection drawing mouse position
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    connectionId?: string;
  } | null>(null);

  // Measure container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Convert canvas percent coordinates to SVG pixel coordinates
  const toPixel = useCallback(
    (posX: number, posY: number) => ({
      x: (posX / 100) * canvasSize.width,
      y: (posY / 100) * canvasSize.height,
    }),
    [canvasSize]
  );

  // Convert SVG pixel coordinates to canvas percent coordinates
  const toPercent = useCallback(
    (pixelX: number, pixelY: number) => ({
      posX: Math.max(0, Math.min(100, (pixelX / canvasSize.width) * 100)),
      posY: Math.max(0, Math.min(100, (pixelY / canvasSize.height) * 100)),
    }),
    [canvasSize]
  );

  // Convert screen coordinates to SVG coordinates (accounting for transform)
  const screenToSvg = useCallback(
    (screenX: number, screenY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (screenX - rect.left - transform.x) / transform.scale,
        y: (screenY - rect.top - transform.y) / transform.scale,
      };
    },
    [transform]
  );

  // --------------------------------------------------------------------------
  // ZOOM
  // --------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setTransform((prev) => {
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.scale + delta));

        // Zoom toward mouse position
        const svg = svgRef.current;
        if (!svg) return { ...prev, scale: newScale };
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleRatio = newScale / prev.scale;
        return {
          x: mouseX - (mouseX - prev.x) * scaleRatio,
          y: mouseY - (mouseY - prev.y) * scaleRatio,
          scale: newScale,
        };
      });
    },
    []
  );

  // --------------------------------------------------------------------------
  // PAN (right-click drag or middle-click, or left-click when not in edit mode on empty canvas)
  // --------------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      // Close context menu on any click
      if (contextMenu) {
        setContextMenu(null);
        return;
      }

      // Middle mouse button or space-click: always pan
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        transformStartRef.current = { x: transform.x, y: transform.y };
        return;
      }

      // Left click on SVG background
      if (e.button === 0) {
        const target = e.target as SVGElement;
        const isBackground = target === svgRef.current || target.classList.contains("topology-bg");

        if (isBackground) {
          if (editMode && addNodeType) {
            // Place new node
            const svgCoords = screenToSvg(e.clientX, e.clientY);
            const { posX, posY } = toPercent(svgCoords.x, svgCoords.y);
            onCanvasClick(posX, posY);
            return;
          }

          // Deselect node
          onNodeSelect(null);

          // Start panning
          setIsPanning(true);
          panStartRef.current = { x: e.clientX, y: e.clientY };
          transformStartRef.current = { x: transform.x, y: transform.y };
        }
      }
    },
    [editMode, addNodeType, transform, screenToSvg, toPercent, onCanvasClick, onNodeSelect, contextMenu]
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      // Update mouse position for connection drawing
      if (drawingConnection && connectionStartNodeId) {
        const svgCoords = screenToSvg(e.clientX, e.clientY);
        setMousePos(svgCoords);
      }

      // Handle panning
      if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setTransform((prev) => ({
          ...prev,
          x: transformStartRef.current.x + dx,
          y: transformStartRef.current.y + dy,
        }));
        return;
      }

      // Handle node dragging
      if (dragNodeId && editMode) {
        const svgCoords = screenToSvg(e.clientX, e.clientY);
        const { posX, posY } = toPercent(svgCoords.x, svgCoords.y);
        onNodeMove(dragNodeId, posX, posY);
      }
    },
    [isPanning, dragNodeId, editMode, drawingConnection, connectionStartNodeId, screenToSvg, toPercent, onNodeMove]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragNodeId(null);
  }, []);

  // --------------------------------------------------------------------------
  // NODE INTERACTIONS
  // --------------------------------------------------------------------------

  const handleNodeMouseDown = useCallback(
    (e: ReactMouseEvent, nodeId: string) => {
      e.stopPropagation();

      if (e.button === 0) {
        // If drawing connection, handle connection endpoints
        if (editMode && drawingConnection) {
          if (!connectionStartNodeId) {
            onConnectionStart(nodeId);
          } else if (connectionStartNodeId !== nodeId) {
            onConnectionEnd(nodeId);
          }
          return;
        }

        // Select the node
        onNodeSelect(nodeId);

        // If in edit mode, start dragging
        if (editMode && !addNodeType) {
          setDragNodeId(nodeId);
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            dragNodeStartRef.current = { posX: node.posX, posY: node.posY };
          }
        }
      }
    },
    [editMode, drawingConnection, connectionStartNodeId, addNodeType, nodes, onNodeSelect, onConnectionStart, onConnectionEnd]
  );

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent, nodeId?: string, connectionId?: string) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId,
        connectionId,
      });
    },
    [editMode]
  );

  // Close context menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --------------------------------------------------------------------------
  // RENDER CONNECTIONS
  // --------------------------------------------------------------------------

  const renderConnections = () => {
    return connections.map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
      const toNode = nodes.find((n) => n.id === conn.toNodeId);
      if (!fromNode || !toNode) return null;

      const from = toPixel(fromNode.posX, fromNode.posY);
      const to = toPixel(toNode.posX, toNode.posY);
      const color = conn.cableType
        ? CABLE_TYPE_COLORS[conn.cableType] ?? "#6b7280"
        : "#6b7280";

      // Calculate midpoint for label
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;

      return (
        <g
          key={conn.id}
          className="cursor-pointer"
          onContextMenu={(e) => handleContextMenu(e, undefined, conn.id)}
        >
          {/* Invisible wider line for easier clicking */}
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="transparent"
            strokeWidth={12}
          />
          {/* Visible line */}
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={conn.metadata?.planned ? "6 3" : undefined}
            opacity={0.7}
          />
          {/* Cable type label */}
          {conn.cableType && (
            <g transform={`translate(${midX}, ${midY})`}>
              <rect
                x={-20}
                y={-8}
                width={40}
                height={16}
                rx={3}
                fill="white"
                stroke={color}
                strokeWidth={0.5}
                opacity={0.9}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fill={color}
                fontWeight={500}
              >
                {conn.cableType}
              </text>
            </g>
          )}
        </g>
      );
    });
  };

  // --------------------------------------------------------------------------
  // RENDER NODES
  // --------------------------------------------------------------------------

  const renderNodes = () => {
    return nodes.map((node) => {
      const pos = toPixel(node.posX, node.posY);
      const isSelected = node.id === selectedNodeId;
      const isConnectionSource = node.id === connectionStartNodeId;

      return (
        <g
          key={node.id}
          className={editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
        >
          {/* Selection highlight */}
          {isSelected && (
            <circle
              cx={pos.x}
              cy={pos.y}
              r={node.type === "CABLE_JUNCTION" ? JUNCTION_RADIUS + 6 : NODE_RADIUS + 6}
              fill="none"
              stroke="#335E99"
              strokeWidth={2}
              strokeDasharray="4 2"
              className="animate-pulse"
            />
          )}
          {/* Connection source highlight */}
          {isConnectionSource && (
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_RADIUS + 8}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              className="animate-pulse"
            />
          )}

          {/* Node icon */}
          {renderNodeIcon(node, pos.x, pos.y)}

          {/* Node label */}
          <text
            x={pos.x}
            y={pos.y + (node.type === "CABLE_JUNCTION" ? JUNCTION_RADIUS + 14 : NODE_RADIUS + 16)}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            className="select-none pointer-events-none"
            fontWeight={isSelected ? 600 : 400}
          >
            {node.name}
          </text>
        </g>
      );
    });
  };

  // --------------------------------------------------------------------------
  // RENDER DRAWING LINE (for connection in progress)
  // --------------------------------------------------------------------------

  const renderDrawingLine = () => {
    if (!drawingConnection || !connectionStartNodeId) return null;

    const startNode = nodes.find((n) => n.id === connectionStartNodeId);
    if (!startNode) return null;

    const from = toPixel(startNode.posX, startNode.posY);
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={mousePos.x}
        y2={mousePos.y}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="6 3"
        opacity={0.6}
        className="pointer-events-none"
      />
    );
  };

  // --------------------------------------------------------------------------
  // CONTEXT MENU
  // --------------------------------------------------------------------------

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    return (
      <div
        className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        {contextMenu.nodeId && (
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-destructive"
            onClick={() => {
              onNodeDelete(contextMenu.nodeId!);
              setContextMenu(null);
            }}
          >
            Knoten löschen
          </button>
        )}
        {contextMenu.connectionId && (
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-destructive"
            onClick={() => {
              onConnectionDelete(contextMenu.connectionId!);
              setContextMenu(null);
            }}
          >
            Verbindung löschen
          </button>
        )}
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-muted/30 rounded-lg border"
    >
      <svg
        ref={svgRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? "grabbing" : drawingConnection ? "crosshair" : addNodeType ? "crosshair" : "default" }}
      >
        {/* Background grid pattern */}
        <defs>
          <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeWidth={0.3}
              opacity={0.15}
            />
          </pattern>
        </defs>

        {/* Transform group */}
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Background */}
          <rect
            className="topology-bg"
            width={canvasSize.width}
            height={canvasSize.height}
            fill="url(#grid)"
            rx={8}
          />

          {/* Connections */}
          {renderConnections()}

          {/* Drawing line */}
          {renderDrawingLine()}

          {/* Nodes */}
          {renderNodes()}
        </g>
      </svg>

      {/* Context Menu (rendered outside SVG for proper HTML rendering) */}
      {renderContextMenu()}

      {/* Zoom level indicator */}
      <div className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm border rounded px-2 py-1 text-xs text-muted-foreground">
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  );
}
