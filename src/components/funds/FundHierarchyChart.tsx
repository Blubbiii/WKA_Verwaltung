"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Wind, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface FundCategoryInfo {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface HierarchyFund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory: FundCategoryInfo | null;
}

export interface HierarchyRelation {
  fund: HierarchyFund;
  ownershipPercentage: number | null;
}

export interface OperatedTurbineInfo {
  id: string;
  ownershipPercentage: number | null;
  turbine: {
    id: string;
    designation: string;
    manufacturer: string | null;
    model: string | null;
    ratedPowerKw: number | null;
    status: string;
    park: { id: string; name: string };
  };
}

export interface FundHierarchyChartProps {
  currentFund: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory?: FundCategoryInfo | null;
  };
  parentFunds: HierarchyRelation[];
  childFunds: HierarchyRelation[];
  operatedTurbines?: OperatedTurbineInfo[];
}

// ============================================================================
// Constants
// ============================================================================

const NODE_W = 180;
const NODE_H = 76;
const TURBINE_SIZE = 46;
const COL_GAP = 160;
const ROW_GAP = 20;
const TURB_GAP = 16;
const PADDING = 40;
const DEFAULT_COLOR = "#94a3b8";

// ============================================================================
// Layout types
// ============================================================================

interface Pt { x: number; y: number }
interface LnData { x1: number; y1: number; x2: number; y2: number; color: string; label?: string }

interface BaseLayout {
  width: number;
  height: number;
  parents: Pt[];
  current: Pt;
  children: Pt[];
  turbines: Pt[];
}

// ============================================================================
// Layout computation - horizontal: Parents | Current | Children + Turbines
// ============================================================================

function computeLayout(
  parentCount: number,
  childCount: number,
  turbineCount: number,
  containerWidth: number
): BaseLayout {
  const hasLeft = parentCount > 0;
  const hasRight = childCount > 0 || turbineCount > 0;

  // Column X positions
  let colX: number[];
  if (hasLeft && hasRight) {
    colX = [
      PADDING + NODE_W / 2,
      PADDING + NODE_W + COL_GAP,
      PADDING + NODE_W + COL_GAP + NODE_W + COL_GAP,
    ];
  } else if (hasLeft) {
    colX = [PADDING + NODE_W / 2, PADDING + NODE_W + COL_GAP];
  } else if (hasRight) {
    colX = [PADDING + NODE_W / 2, PADDING + NODE_W + COL_GAP];
  } else {
    colX = [PADDING + NODE_W / 2];
  }

  // Right column: compute heights for children and turbines separately
  const childrenTotalH = childCount > 0
    ? childCount * NODE_H + (childCount - 1) * ROW_GAP
    : 0;
  const turbinesTotalH = turbineCount > 0
    ? turbineCount * (TURBINE_SIZE + TURB_GAP) - TURB_GAP
    : 0;
  const sectionGap = childCount > 0 && turbineCount > 0 ? 30 : 0;
  const rightTotalH = childrenTotalH + sectionGap + turbinesTotalH;

  // Left column
  const leftTotalH = parentCount > 0
    ? parentCount * NODE_H + (parentCount - 1) * ROW_GAP
    : 0;

  const contentHeight = Math.max(leftTotalH, NODE_H, rightTotalH);
  const height = Math.max(contentHeight + PADDING * 2, 180);

  // Width
  const lastColX = colX[colX.length - 1];
  const contentWidth = lastColX + NODE_W / 2 + PADDING;
  const width = Math.max(contentWidth, containerWidth);

  const cy = height / 2;

  // Parent positions (left column)
  const parents: Pt[] = [];
  if (parentCount > 0) {
    const px = colX[0];
    const startY = cy - leftTotalH / 2 + NODE_H / 2;
    for (let i = 0; i < parentCount; i++) {
      parents.push({ x: px, y: startY + i * (NODE_H + ROW_GAP) });
    }
  }

  // Current fund (center column)
  const currentColIdx = hasLeft ? 1 : 0;
  const current: Pt = { x: colX[currentColIdx], y: cy };

  // Right column: children then turbines
  const rightColIdx = colX.length - 1;
  const rightX = colX.length > 1 ? colX[rightColIdx] : colX[0] + COL_GAP + NODE_W;
  const rightStartY = cy - rightTotalH / 2;

  const children: Pt[] = [];
  let curY = rightStartY + NODE_H / 2;
  for (let i = 0; i < childCount; i++) {
    children.push({ x: rightX, y: curY });
    curY += NODE_H + ROW_GAP;
  }

  // Turbines below children
  const turbines: Pt[] = [];
  if (turbineCount > 0) {
    let turbStartY: number;
    if (childCount > 0) {
      // Continue after children + section gap
      turbStartY = curY - ROW_GAP + sectionGap + TURBINE_SIZE / 2;
    } else {
      // Turbines only - center them
      turbStartY = cy - turbinesTotalH / 2 + TURBINE_SIZE / 2;
    }
    for (let i = 0; i < turbineCount; i++) {
      turbines.push({ x: rightX, y: turbStartY + i * (TURBINE_SIZE + TURB_GAP) });
    }
  }

  return { width, height, parents, current, children, turbines };
}

// ============================================================================
// Helpers
// ============================================================================

function formatPercentage(value: number): string {
  return Number(value).toFixed(2).replace(".", ",") + "%";
}

function fmt(kw: number) {
  return kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${kw.toFixed(0)} kW`;
}

// ============================================================================
// Main component
// ============================================================================

export function FundHierarchyChart({
  currentFund,
  parentFunds,
  childFunds,
  operatedTurbines = [],
}: FundHierarchyChartProps) {
  const router = useRouter();

  // ---- Container sizing ----
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---- Layout ----
  const base = useMemo(
    () => computeLayout(parentFunds.length, childFunds.length, operatedTurbines.length, containerWidth),
    [parentFunds.length, childFunds.length, operatedTurbines.length, containerWidth]
  );

  // ---- Persistence: localStorage key per fund ----
  const storageKey = `fund-hierarchy-positions-${currentFund.id}`;

  // ---- Drag state ----
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const offsetsRef = useRef<Record<string, Pt>>({});
  const dragRef = useRef<{ key: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Track if the user actually moved the mouse during drag (to distinguish click from drag)
  const didMoveRef = useRef(false);

  // Load saved positions on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Object.keys(saved).length > 0) {
          setOffsets(saved);
          offsetsRef.current = saved;
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFund.id]);

  useEffect(() => { offsetsRef.current = offsets; }, [offsets]);

  const startDrag = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const o = offsetsRef.current[key] || { x: 0, y: 0 };
    dragRef.current = { key, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
    didMoveRef.current = false;
    setIsDragging(true);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      // Mark as moved if more than 3px (distinguishes click from drag)
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didMoveRef.current = true;
      }
      setOffsets((prev) => ({
        ...prev,
        [d.key]: { x: d.ox + dx, y: d.oy + dy },
      }));
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        setIsDragging(false);
        // Save positions to localStorage when drag ends
        try {
          localStorage.setItem(storageKey, JSON.stringify(offsetsRef.current));
        } catch { /* ignore */ }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Navigate on click (not on drag). Uses programmatic navigation instead of <Link>
  // to avoid the event-timing race condition with isDragging state.
  const handleNodeClick = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Only navigate if the user didn't drag
    if (!didMoveRef.current) {
      router.push(href);
    }
  }, [router]);

  // ---- Final positions (base + offsets) ----
  const F = useMemo(() => {
    function apply(p: Pt, key: string): Pt {
      const o = offsets[key];
      return o ? { x: p.x + o.x, y: p.y + o.y } : p;
    }

    const parents = base.parents.map((p, i) => apply(p, `p-${parentFunds[i]?.fund.id}`));
    const current = apply(base.current, "current");
    const children = base.children.map((p, i) => apply(p, `c-${childFunds[i]?.fund.id}`));
    const turbines = base.turbines.map((p, i) => apply(p, `t-${operatedTurbines[i]?.turbine.id}`));

    // Connection lines
    const lines: LnData[] = [];

    // Parents -> current
    parentFunds.forEach((rel, i) => {
      const from = parents[i];
      if (!from) return;
      const color = rel.fund.fundCategory?.color || DEFAULT_COLOR;
      const label = rel.ownershipPercentage != null ? formatPercentage(rel.ownershipPercentage) : undefined;
      lines.push({ x1: from.x + NODE_W / 2, y1: from.y, x2: current.x - NODE_W / 2, y2: current.y, color, label });
    });

    // Current -> children
    childFunds.forEach((rel, i) => {
      const to = children[i];
      if (!to) return;
      const color = rel.fund.fundCategory?.color || DEFAULT_COLOR;
      const label = rel.ownershipPercentage != null ? formatPercentage(rel.ownershipPercentage) : undefined;
      lines.push({ x1: current.x + NODE_W / 2, y1: current.y, x2: to.x - NODE_W / 2, y2: to.y, color, label });
    });

    // Current -> turbines
    operatedTurbines.forEach((op, i) => {
      const to = turbines[i];
      if (!to) return;
      lines.push({
        x1: current.x + NODE_W / 2, y1: current.y,
        x2: to.x - TURBINE_SIZE / 2, y2: to.y,
        color: "#22c55e",
        label: op.ownershipPercentage != null ? formatPercentage(op.ownershipPercentage) : undefined,
      });
    });

    return { parents, current, children, turbines, lines };
  }, [base, offsets, parentFunds, childFunds, operatedTurbines]);

  // ---- Empty state ----
  const isEmpty = parentFunds.length === 0 && childFunds.length === 0 && operatedTurbines.length === 0;

  if (isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Unternehmensstruktur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Keine verbundenen Gesellschaften oder Anlagen
          </p>
        </CardContent>
      </Card>
    );
  }

  const nodeBase = "absolute flex flex-col items-center z-10 cursor-grab active:cursor-grabbing";

  const hasCustomPositions = Object.keys(offsets).length > 0;

  function resetPositions() {
    setOffsets({});
    offsetsRef.current = {};
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }

  // Reusable fund node renderer (no <Link> - uses programmatic navigation)
  function renderFundNode(
    fund: { id: string; name: string; legalForm: string | null; fundCategory?: FundCategoryInfo | null },
    pos: Pt,
    dragKey: string,
    isCurrent = false,
  ) {
    const color = fund.fundCategory?.color || DEFAULT_COLOR;
    return (
      <div
        key={dragKey}
        className={nodeBase}
        style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}
        onMouseDown={(e) => startDrag(e, dragKey)}
        onClick={isCurrent ? undefined : (e) => handleNodeClick(e, `/funds/${fund.id}`)}
      >
        <div
          className={cn(
            "bg-card rounded-lg border shadow-sm p-3 flex flex-col gap-0.5",
            isCurrent
              ? "ring-2 ring-primary shadow-md"
              : "hover:shadow-md transition-shadow"
          )}
          style={{ width: NODE_W, height: NODE_H, borderLeftWidth: 4, borderLeftColor: color }}
        >
          <div className="flex items-start gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color }} />
            <span className="text-sm font-semibold truncate">{fund.name}</span>
          </div>
          {fund.legalForm && (
            <span className="text-xs text-muted-foreground truncate pl-6">{fund.legalForm}</span>
          )}
          {fund.fundCategory && (
            <Badge variant="outline" className="text-[10px] w-fit ml-6" style={{ borderColor: color, color }}>
              {fund.fundCategory.name}
            </Badge>
          )}
        </div>
        {isCurrent && (
          <span className="text-[10px] text-muted-foreground font-medium mt-1 whitespace-nowrap">
            Aktuelle Gesellschaft
          </span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Unternehmensstruktur
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {parentFunds.length > 0 && `${parentFunds.length} übergeordnete`}
            {parentFunds.length > 0 && (childFunds.length > 0 || operatedTurbines.length > 0) && " | "}
            {childFunds.length > 0 && `${childFunds.length} untergeordnete`}
            {childFunds.length > 0 && operatedTurbines.length > 0 && " | "}
            {operatedTurbines.length > 0 && `${operatedTurbines.length} Anlagen`}
          </p>
        </div>
        {hasCustomPositions && (
          <Button variant="ghost" size="sm" onClick={resetPositions}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Zurücksetzen
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div
          ref={outerRef}
          className="rounded-xl bg-muted/30 border overflow-x-auto"
        >
          <div
            className="relative"
            style={{
              width: base.width,
              height: base.height,
              cursor: isDragging ? "grabbing" : undefined,
              userSelect: isDragging ? "none" : undefined,
            }}
          >
            {/* SVG connection lines */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={base.width}
              height={base.height}
              aria-hidden="true"
            >
              {F.lines.map((l, i) => {
                const midX = (l.x1 + l.x2) / 2;
                const path = `M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`;
                const labelX = (l.x1 + l.x2) / 2;
                const labelY = (l.y1 + l.y2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={path}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={2}
                      strokeOpacity={0.5}
                    />
                    {l.label && (
                      <>
                        <rect
                          x={labelX - 28}
                          y={labelY - 9}
                          width={56}
                          height={18}
                          rx={4}
                          fill="hsl(var(--card))"
                          stroke={l.color}
                          strokeWidth={1}
                          strokeOpacity={0.3}
                        />
                        <text
                          x={labelX}
                          y={labelY + 4}
                          textAnchor="middle"
                          className="text-[11px] font-medium"
                          fill={l.color}
                        >
                          {l.label}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Parent fund nodes */}
            {parentFunds.map((rel, i) => {
              const pos = F.parents[i];
              if (!pos) return null;
              return renderFundNode(rel.fund, pos, `p-${rel.fund.id}`);
            })}

            {/* Current fund node (center) */}
            {renderFundNode(currentFund, F.current, "current", true)}

            {/* Child fund nodes */}
            {childFunds.map((rel, i) => {
              const pos = F.children[i];
              if (!pos) return null;
              return renderFundNode(rel.fund, pos, `c-${rel.fund.id}`);
            })}

            {/* Turbine nodes (circular, like NetworkTopology) */}
            {operatedTurbines.map((op, i) => {
              const pos = F.turbines[i];
              if (!pos) return null;
              const statusColor = op.turbine.status === "ACTIVE" || op.turbine.status === "OPERATING"
                ? "#22c55e" : op.turbine.status === "INACTIVE" ? "#eab308" : "#9ca3af";
              return (
                <div
                  key={`t-${op.turbine.id}`}
                  className={nodeBase}
                  style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}
                  onMouseDown={(e) => startDrag(e, `t-${op.turbine.id}`)}
                  title={[op.turbine.designation, op.turbine.manufacturer, op.turbine.ratedPowerKw ? fmt(op.turbine.ratedPowerKw) : null].filter(Boolean).join(" | ")}
                >
                  <div
                    className={cn(
                      "relative flex items-center justify-center rounded-full shadow-md transition-all hover:scale-110 hover:shadow-lg",
                    )}
                    style={{
                      width: TURBINE_SIZE,
                      height: TURBINE_SIZE,
                      backgroundColor: "#22c55e",
                    }}
                  >
                    <Wind className="h-5 w-5 text-white" />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900"
                      style={{ backgroundColor: statusColor }}
                    />
                  </div>
                  <span className="mt-1 text-[10px] font-medium text-center max-w-[80px] truncate">
                    {op.turbine.designation}
                  </span>
                  {op.turbine.ratedPowerKw != null && (
                    <span className="text-[9px] text-muted-foreground">
                      {fmt(op.turbine.ratedPowerKw)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 mt-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Legende
          </span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-primary bg-transparent shrink-0" />
            <span className="text-xs">Aktuelle Gesellschaft</span>
          </div>
          {operatedTurbines.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
              <span className="text-xs">Anlagen ({operatedTurbines.length})</span>
            </div>
          )}
          {[...new Map(
            [...parentFunds, ...childFunds]
              .filter((r) => r.fund.fundCategory)
              .map((r) => [r.fund.fundCategory!.id, r.fund.fundCategory!])
          ).values()].map((cat) => (
            <div key={cat.id} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-xs">{cat.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
