"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Building2,
  Wind,
  Cable,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


// ============================================================================
// Types
// ============================================================================

interface FundCategory {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory?: FundCategory | null;
  childHierarchies?: { ownershipPercentage: number | null; childFundId: string }[];
}

interface TurbineOperatorEntry {
  ownershipPercentage: number | null;
  operatorFund: Fund;
}

interface Turbine {
  id: string;
  designation: string;
  manufacturer: string | null;
  model: string | null;
  ratedPowerKw: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: Fund | null;
  operatorHistory?: TurbineOperatorEntry[];
}

interface NetworkTopologyProps {
  parkName: string;
  turbines: Turbine[];
  billingEntityFund?: Fund | null;
}

// Betreiber within a Netzgesellschaft group
interface BetreiberInNetz {
  fund: Fund;
  turbines: Turbine[];
  avgOwnershipPct: number | null;
}

// Extended Netz group with operator sub-groups
interface NetzWithBetreiber {
  fundId: string | null;
  fund: Fund | null;
  totalCapacityKw: number;
  turbines: Turbine[];
  betreiber: BetreiberInNetz[];
  unassignedTurbines: Turbine[];
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_RING: Record<string, string> = {
  ACTIVE: "#22c55e",
  INACTIVE: "#eab308",
  ARCHIVED: "#9ca3af",
};

const DEFAULT_COLOR = "#94a3b8";
const FUND_NODE_SIZE = 52;
const NVP_SIZE = 64;
const GROUP_SIZE = 44;
const TURBINE_SIZE = 52;
const HUB_SIZE = 14;

const TURBINE_SPACING_X = 88;
const TURBINE_SPACING_Y = 80;
const MAX_ROWS = 5;
const PADDING_Y = 60;
const GROUP_GAP = 50;
const BETREIBER_GAP = 40;

// ============================================================================
// Helpers
// ============================================================================

interface Pt { x: number; y: number }
interface LnData {
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  label?: string;
}

function fmt(kw: number) {
  return kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${kw.toFixed(0)} kW`;
}

// Group turbines by Netzgesellschaft, then sub-group by Betreibergesellschaft
function groupByNetzAndOperator(turbines: Turbine[]): NetzWithBetreiber[] {
  // First group by netzgesellschaftFundId
  const netzMap = new Map<string | null, {
    fundId: string | null;
    fund: Fund | null;
    turbines: Turbine[];
    totalCapacityKw: number;
  }>();

  for (const t of turbines) {
    const k = t.netzgesellschaftFundId;
    if (!netzMap.has(k)) {
      netzMap.set(k, { fundId: k, fund: t.netzgesellschaftFund, turbines: [], totalCapacityKw: 0 });
    }
    const g = netzMap.get(k)!;
    g.turbines.push(t);
    g.totalCapacityKw += t.ratedPowerKw ?? 0;
  }

  // Sort: assigned netz groups first, then unassigned
  const netzGroups = Array.from(netzMap.values()).sort((a, b) => {
    if (!a.fundId && b.fundId) return 1;
    if (a.fundId && !b.fundId) return -1;
    return (a.fund?.name ?? "").localeCompare(b.fund?.name ?? "", "de");
  });

  // Sub-group each netz group by operator
  return netzGroups.map((ng) => {
    const operatorMap = new Map<string, { fund: Fund; turbines: Turbine[] }>();
    const unassigned: Turbine[] = [];

    for (const t of ng.turbines) {
      if (!t.operatorHistory || t.operatorHistory.length === 0) {
        unassigned.push(t);
        continue;
      }
      // Take first active operator for layout purposes
      const op = t.operatorHistory[0];
      const k = op.operatorFund.id;
      if (!operatorMap.has(k)) {
        operatorMap.set(k, { fund: op.operatorFund, turbines: [] });
      }
      operatorMap.get(k)!.turbines.push(t);
    }

    // Look up ownership percentages from FundHierarchy (Netz → Betreiber)
    // childHierarchies on the netzgesellschaftFund tells us each Betreiber's share
    const hierarchyMap = new Map<string, number>();
    if (ng.fund?.childHierarchies) {
      for (const h of ng.fund.childHierarchies) {
        if (h.ownershipPercentage != null) {
          hierarchyMap.set(h.childFundId, Number(h.ownershipPercentage));
        }
      }
    }

    const betreiber = Array.from(operatorMap.values())
      .map(({ fund, turbines: ts }) => ({
        fund,
        turbines: ts,
        // Use FundHierarchy percentage (Beteiligung am Netz), not TurbineOperator percentage
        avgOwnershipPct: hierarchyMap.get(fund.id) ?? null,
      }))
      .sort((a, b) => a.fund.name.localeCompare(b.fund.name, "de"));

    return { ...ng, betreiber, unassignedTurbines: unassigned };
  });
}

// ============================================================================
// Layout computation
// ============================================================================

interface BaseLayout {
  h: number;
  gw: number;
  nvp: Pt;
  hub: Pt;
  netzPos: Pt[];
  betreiberPos: Pt[][];
  turbinePos: { p: Pt; c: string; t: Turbine }[][][];
  unassignedTurbinePos: { p: Pt; c: string; t: Turbine }[][];
}

function computeBase(
  netzGroups: NetzWithBetreiber[],
  cw: number,
): BaseLayout {
  const fallback: BaseLayout = {
    h: 300, gw: cw, nvp: { x: 0, y: 0 }, hub: { x: 0, y: 0 },
    netzPos: [], betreiberPos: [], turbinePos: [], unassignedTurbinePos: [],
  };
  if (!netzGroups.length || cw < 200) return fallback;

  const hasBetreiber = netzGroups.some((ng) => ng.betreiber.length > 0);
  const hasNetz = netzGroups.some((ng) => ng.fundId !== null);

  // X positions: NVP → Hub → Netz → Betreiber → Turbines (left to right)
  const nvpX = Math.max(60, cw * 0.08);
  const netzX = hasNetz
    ? Math.max(200, cw * 0.24)
    : nvpX;
  const hubX = (nvpX + netzX) / 2;
  const betreiberX = hasBetreiber
    ? Math.max(380, cw * 0.44)
    : netzX;
  const turbineBaseX = hasBetreiber
    ? Math.max(540, cw * 0.62)
    : hasNetz
      ? Math.max(320, cw * 0.52)
      : Math.max(200, cw * 0.30);

  // Compute height metrics for each netz group
  const netzMetrics = netzGroups.map((ng) => {
    const betreiberMetrics = ng.betreiber.map((b) => {
      const rows = Math.min(b.turbines.length, MAX_ROWS);
      return {
        rows,
        height: Math.max(FUND_NODE_SIZE + 20, (rows - 1) * TURBINE_SPACING_Y + TURBINE_SIZE + 20),
      };
    });

    const unassignedRows = Math.min(ng.unassignedTurbines.length, MAX_ROWS);
    const unassignedHeight = ng.unassignedTurbines.length > 0
      ? Math.max(TURBINE_SIZE + 20, (unassignedRows - 1) * TURBINE_SPACING_Y + TURBINE_SIZE + 20)
      : 0;

    const betreiberTotalH = betreiberMetrics.reduce((s, m) => s + m.height, 0)
      + Math.max(0, ng.betreiber.length - 1) * BETREIBER_GAP;

    const totalH = betreiberTotalH
      + (ng.unassignedTurbines.length > 0 && ng.betreiber.length > 0 ? BETREIBER_GAP : 0)
      + unassignedHeight;

    return {
      betreiberMetrics,
      unassignedHeight,
      totalH: Math.max(GROUP_SIZE + 30, totalH),
    };
  });

  const groupTotalH = netzMetrics.reduce((s, m) => s + m.totalH, 0)
    + Math.max(0, netzGroups.length - 1) * GROUP_GAP;
  const h = Math.max(380, groupTotalH + PADDING_Y * 2);
  const cy = h / 2;

  const nvp: Pt = { x: nvpX, y: cy };
  const hub: Pt = { x: hubX, y: cy };

  // Position netz groups, betreiber, and turbines vertically
  let curY = (h - groupTotalH) / 2;
  const netzPos: Pt[] = [];
  const betreiberPos: Pt[][] = [];
  const turbinePos: { p: Pt; c: string; t: Turbine }[][][] = [];
  const unassignedTurbinePos: { p: Pt; c: string; t: Turbine }[][] = [];
  let maxX = turbineBaseX;

  for (let ni = 0; ni < netzGroups.length; ni++) {
    const ng = netzGroups[ni];
    const metrics = netzMetrics[ni];
    const groupTop = curY;
    const groupCenterY = groupTop + metrics.totalH / 2;

    netzPos.push({ x: netzX, y: groupCenterY });

    // Position betreiber sub-groups within this netz group
    const bPos: Pt[] = [];
    const bTurbines: { p: Pt; c: string; t: Turbine }[][] = [];
    let betreiberY = groupTop;

    for (let bi = 0; bi < ng.betreiber.length; bi++) {
      const b = ng.betreiber[bi];
      const bm = metrics.betreiberMetrics[bi];
      const bCenterY = betreiberY + bm.height / 2;

      bPos.push({ x: betreiberX, y: bCenterY });

      // Position turbines for this betreiber
      const color = b.fund.fundCategory?.color || DEFAULT_COLOR;
      const tList: { p: Pt; c: string; t: Turbine }[] = [];

      for (let ti = 0; ti < b.turbines.length; ti++) {
        const col = Math.floor(ti / MAX_ROWS);
        const row = ti % MAX_ROWS;
        const inCol = Math.min(b.turbines.length - col * MAX_ROWS, MAX_ROWS);
        const startY = bCenterY - (inCol - 1) * TURBINE_SPACING_Y / 2;
        const x = turbineBaseX + col * TURBINE_SPACING_X;
        if (x > maxX) maxX = x;
        tList.push({
          p: { x, y: startY + row * TURBINE_SPACING_Y },
          c: color,
          t: b.turbines[ti],
        });
      }

      bTurbines.push(tList);
      betreiberY += bm.height + BETREIBER_GAP;
    }

    betreiberPos.push(bPos);
    turbinePos.push(bTurbines);

    // Position unassigned turbines (no operator)
    const uList: { p: Pt; c: string; t: Turbine }[] = [];
    if (ng.unassignedTurbines.length > 0) {
      const uCenterY = ng.betreiber.length > 0
        ? betreiberY + metrics.unassignedHeight / 2
        : groupCenterY;
      const color = ng.fund?.fundCategory?.color || DEFAULT_COLOR;

      for (let ti = 0; ti < ng.unassignedTurbines.length; ti++) {
        const col = Math.floor(ti / MAX_ROWS);
        const row = ti % MAX_ROWS;
        const inCol = Math.min(ng.unassignedTurbines.length - col * MAX_ROWS, MAX_ROWS);
        const startY = uCenterY - (inCol - 1) * TURBINE_SPACING_Y / 2;
        const x = turbineBaseX + col * TURBINE_SPACING_X;
        if (x > maxX) maxX = x;
        uList.push({
          p: { x, y: startY + row * TURBINE_SPACING_Y },
          c: color,
          t: ng.unassignedTurbines[ti],
        });
      }
    }
    unassignedTurbinePos.push(uList);

    curY += metrics.totalH + GROUP_GAP;
  }

  const gw = Math.max(cw, maxX + TURBINE_SIZE / 2 + 24);
  return { h, gw, nvp, hub, netzPos, betreiberPos, turbinePos, unassignedTurbinePos };
}

// ============================================================================
// Component
// ============================================================================

export function NetworkTopology({
  parkName,
  turbines,
  billingEntityFund,
}: NetworkTopologyProps) {
  const netzGroups = useMemo(() => groupByNetzAndOperator(turbines), [turbines]);

  // Unique operator funds for legend
  const operatorFundsForLegend = useMemo(() => {
    const seen = new Map<string, { fund: Fund; count: number }>();
    for (const ng of netzGroups) {
      for (const b of ng.betreiber) {
        if (!seen.has(b.fund.id)) {
          seen.set(b.fund.id, { fund: b.fund, count: b.turbines.length });
        } else {
          seen.get(b.fund.id)!.count += b.turbines.length;
        }
      }
    }
    return Array.from(seen.values());
  }, [netzGroups]);

  // ---- Container sizing ----
  const outerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(800);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const up = () => setCw(el.clientWidth);
    up();
    const obs = new ResizeObserver(up);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---- Base layout ----
  const base = useMemo(
    () => computeBase(netzGroups, cw),
    [netzGroups, cw]
  );

  // ---- Drag & Drop ----
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const offsetsRef = useRef<Record<string, Pt>>({});
  const dragRef = useRef<{
    key: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    offsetsRef.current = offsets;
  }, [offsets]);

  const startDrag = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const o = offsetsRef.current[key] || { x: 0, y: 0 };
    dragRef.current = { key, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      setOffsets((prev) => ({
        ...prev,
        [d.key]: { x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy },
      }));
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        setIsDragging(false);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ---- Final positions (base + drag offsets) + connection lines ----
  const F = useMemo(() => {
    function apply(p: Pt, key: string): Pt {
      const o = offsets[key];
      return o ? { x: p.x + o.x, y: p.y + o.y } : p;
    }

    const nvp = apply(base.nvp, "nvp");
    const hub = apply(base.hub, "hub");

    const nps = base.netzPos.map((p, i) =>
      apply(p, `g-${netzGroups[i].fundId ?? "__u"}`)
    );

    const bps = base.betreiberPos.map((bArr, ni) =>
      bArr.map((p, bi) =>
        apply(p, `op-${netzGroups[ni].betreiber[bi].fund.id}`)
      )
    );

    const tps = base.turbinePos.map((nArr) =>
      nArr.map((bArr) =>
        bArr.map((tp) => ({ ...tp, p: apply(tp.p, `t-${tp.t.id}`) }))
      )
    );

    const utps = base.unassignedTurbinePos.map((uArr) =>
      uArr.map((tp) => ({ ...tp, p: apply(tp.p, `t-${tp.t.id}`) }))
    );

    // Connection lines
    const lines: LnData[] = [];

    const assignedCount = netzGroups.filter((g) => g.fundId !== null).length;
    const showHub = assignedCount > 1;

    if (showHub) {
      lines.push({ x1: nvp.x, y1: nvp.y, x2: hub.x, y2: hub.y, color: DEFAULT_COLOR });
    }

    netzGroups.forEach((ng, ni) => {
      const isUnassigned = !ng.fundId;
      const src = showHub ? hub : nvp;

      if (isUnassigned) {
        // Unassigned netz: betreiber connect directly to NVP/hub
        bps[ni].forEach((bp, bi) => {
          const b = ng.betreiber[bi];
          const color = b.fund.fundCategory?.color || DEFAULT_COLOR;
          const label = b.avgOwnershipPct != null ? `${b.avgOwnershipPct}%` : undefined;
          lines.push({ x1: src.x, y1: src.y, x2: bp.x, y2: bp.y, color, label });
          // Betreiber -> its Turbines
          tps[ni][bi].forEach((tp) => {
            lines.push({ x1: bp.x, y1: bp.y, x2: tp.p.x, y2: tp.p.y, color: tp.c });
          });
        });
        // Unassigned turbines (no operator) connect to NVP/hub directly
        utps[ni].forEach((tp) => {
          lines.push({ x1: src.x, y1: src.y, x2: tp.p.x, y2: tp.p.y, color: DEFAULT_COLOR });
        });
      } else {
        // NVP/Hub -> Netzgesellschaft
        const netzColor = ng.fund?.fundCategory?.color || DEFAULT_COLOR;
        if (showHub) {
          lines.push({ x1: hub.x, y1: hub.y, x2: nps[ni].x, y2: nps[ni].y, color: netzColor });
        } else {
          lines.push({ x1: nvp.x, y1: nvp.y, x2: nps[ni].x, y2: nps[ni].y, color: netzColor });
        }

        // Netzgesellschaft -> Betreibergesellschaft (with ownership %)
        bps[ni].forEach((bp, bi) => {
          const b = ng.betreiber[bi];
          const color = b.fund.fundCategory?.color || DEFAULT_COLOR;
          const label = b.avgOwnershipPct != null ? `${b.avgOwnershipPct}%` : undefined;
          lines.push({ x1: nps[ni].x, y1: nps[ni].y, x2: bp.x, y2: bp.y, color, label });
          // Betreiber -> its Turbines
          tps[ni][bi].forEach((tp) => {
            lines.push({ x1: bp.x, y1: bp.y, x2: tp.p.x, y2: tp.p.y, color: tp.c });
          });
        });

        // Unassigned turbines (no operator) connect to Netz directly
        utps[ni].forEach((tp) => {
          lines.push({ x1: nps[ni].x, y1: nps[ni].y, x2: tp.p.x, y2: tp.p.y, color: tp.c });
        });
      }
    });

    return { nvp, hub, nps, bps, tps, utps, lines, showHub };
  }, [base, offsets, netzGroups]);

  // ---- Stats ----
  const total = turbines.length;
  const active = turbines.filter((t) => t.status === "ACTIVE").length;
  const cap = turbines.reduce((s, t) => s + (t.ratedPowerKw ?? 0), 0);

  // ---- Netzgesellschaft legend ----
  const netzLegend = useMemo(() => {
    const seen = new Map<string, { name: string; color: string; count: number }>();
    for (const ng of netzGroups) {
      const cat = ng.fund?.fundCategory;
      const k = cat?.id || ng.fundId || "__none__";
      const name = cat?.name || ng.fund?.name || "Nicht zugeordnet";
      const color = cat?.color || DEFAULT_COLOR;
      if (!seen.has(k)) seen.set(k, { name, color, count: ng.turbines.length });
      else seen.get(k)!.count += ng.turbines.length;
    }
    return Array.from(seen.values());
  }, [netzGroups]);


  const nodeBase = "absolute flex flex-col items-center z-10 cursor-grab active:cursor-grabbing";

  const showEmptyState = total === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="h-5 w-5" />
          Netz-Topologie
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {parkName} &mdash; {total} {total === 1 ? "Anlage" : "Anlagen"} (
          {active} aktiv){cap > 0 && ` | ${fmt(cap)} gesamt`}
          {operatorFundsForLegend.length > 0 && ` | ${operatorFundsForLegend.length} Betreiber`}
        </p>
      </CardHeader>

      <CardContent>
        {showEmptyState ? (
          <div className="py-12 text-center">
            <Wind className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Keine Anlagen vorhanden. Fuegen Sie Anlagen hinzu, um die
              Netzstruktur zu visualisieren.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ============ Graph canvas ============ */}
            <div
              ref={outerRef}
              className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border overflow-x-auto"
            >
              <div
                className="relative"
                style={{
                  width: base.gw,
                  height: base.h,
                  cursor: isDragging ? "grabbing" : undefined,
                  userSelect: isDragging ? "none" : undefined,
                }}
              >
                {/* SVG connection lines + labels */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={base.gw}
                  height={base.h}
                  aria-hidden="true"
                >
                  {F.lines.map((l, i) => (
                    <g key={i}>
                      <line
                        x1={l.x1}
                        y1={l.y1}
                        x2={l.x2}
                        y2={l.y2}
                        stroke={l.color}
                        strokeWidth={2}
                        strokeOpacity={0.35}
                      />
                      {l.label && (
                        <>
                          <rect
                            x={(l.x1 + l.x2) / 2 - 22}
                            y={(l.y1 + l.y2) / 2 - 9}
                            width={44}
                            height={18}
                            rx={9}
                            fill="white"
                            fillOpacity={0.9}
                            stroke={l.color}
                            strokeWidth={1}
                            strokeOpacity={0.4}
                          />
                          <text
                            x={(l.x1 + l.x2) / 2}
                            y={(l.y1 + l.y2) / 2 + 4}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={600}
                            fill={l.color}
                          >
                            {l.label}
                          </text>
                        </>
                      )}
                    </g>
                  ))}
                </svg>

                {/* ---- NVP node (leftmost) ---- */}
                <div
                  className={nodeBase}
                  style={{ left: F.nvp.x, top: F.nvp.y, transform: "translate(-50%,-50%)" }}
                  onMouseDown={(e) => startDrag(e, "nvp")}
                >
                  {billingEntityFund ? (
                    <>
                      <div
                        className="flex items-center justify-center rounded-full shadow-lg border-2 transition-shadow hover:shadow-xl"
                        style={{
                          width: NVP_SIZE,
                          height: NVP_SIZE,
                          backgroundColor: `${billingEntityFund.fundCategory?.color || "hsl(var(--primary))"}18`,
                          borderColor: billingEntityFund.fundCategory?.color || "hsl(var(--primary))",
                        }}
                      >
                        <Building2
                          className="h-7 w-7"
                          style={{ color: billingEntityFund.fundCategory?.color || "hsl(var(--primary))" }}
                        />
                      </div>
                      <span className="mt-1.5 text-[10px] font-semibold text-center max-w-[120px] leading-tight">
                        {billingEntityFund.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <div
                        className="flex items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/30"
                        style={{ width: NVP_SIZE, height: NVP_SIZE }}
                      >
                        <Building2 className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <span className="mt-1 text-[10px] text-muted-foreground">Kein NVP</span>
                    </>
                  )}
                  <span className="text-[8px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                    Netzverknuepfungspunkt
                  </span>
                </div>

                {/* ---- Hub dot (when multiple netz groups) ---- */}
                {F.showHub && (
                  <div
                    className="absolute z-10 cursor-grab active:cursor-grabbing"
                    style={{ left: F.hub.x, top: F.hub.y, transform: "translate(-50%,-50%)" }}
                    onMouseDown={(e) => startDrag(e, "hub")}
                  >
                    <div
                      className="rounded-full bg-slate-600 dark:bg-slate-400 shadow-sm hover:scale-125 transition-transform"
                      style={{ width: HUB_SIZE, height: HUB_SIZE }}
                    />
                  </div>
                )}

                {/* ---- Netzgesellschaft nodes ---- */}
                {netzGroups.map((ng, ni) => {
                  if (!ng.fundId) return null;
                  const pos = F.nps[ni];
                  const color = ng.fund?.fundCategory?.color || DEFAULT_COLOR;
                  const dragKey = `g-${ng.fundId}`;

                  return (
                    <div
                      key={dragKey}
                      className={nodeBase}
                      style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}
                      onMouseDown={(e) => startDrag(e, dragKey)}
                    >
                      <div
                        className="flex items-center justify-center rounded-full shadow-md transition-shadow hover:shadow-lg"
                        style={{
                          width: GROUP_SIZE,
                          height: GROUP_SIZE,
                          backgroundColor: `${color}20`,
                          border: `2px solid ${color}`,
                        }}
                      >
                        <Cable
                          className="h-5 w-5"
                          style={{ color }}
                        />
                      </div>
                      <span className="mt-1 text-[10px] font-medium text-center max-w-[110px] leading-tight">
                        {ng.fund!.name}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {ng.turbines.length} {ng.turbines.length === 1 ? "WEA" : "WEAs"}
                        {ng.totalCapacityKw > 0 && ` | ${fmt(ng.totalCapacityKw)}`}
                      </span>
                    </div>
                  );
                })}

                {/* ---- Betreibergesellschaft nodes (between Netz and Turbines) ---- */}
                {netzGroups.map((ng, ni) =>
                  ng.betreiber.map((b, bi) => {
                    const pos = F.bps[ni]?.[bi];
                    if (!pos) return null;
                    const color = b.fund.fundCategory?.color || DEFAULT_COLOR;
                    const dragKey = `op-${b.fund.id}`;

                    return (
                      <div
                        key={dragKey}
                        className={nodeBase}
                        style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}
                        onMouseDown={(e) => startDrag(e, dragKey)}
                      >
                        <div
                          className="flex items-center justify-center rounded-lg shadow-md transition-shadow hover:shadow-lg"
                          style={{
                            width: FUND_NODE_SIZE,
                            height: FUND_NODE_SIZE,
                            backgroundColor: `${color}18`,
                            border: `2px solid ${color}`,
                          }}
                        >
                          <Building2
                            className="h-6 w-6"
                            style={{ color }}
                          />
                        </div>
                        <span className="mt-1 text-[10px] font-semibold text-center max-w-[120px] leading-tight">
                          {b.fund.name}
                        </span>
                        {b.fund.legalForm && (
                          <span className="text-[9px] text-muted-foreground">
                            {b.fund.legalForm}
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground">
                          {b.turbines.length} {b.turbines.length === 1 ? "WEA" : "WEAs"}
                        </span>
                      </div>
                    );
                  })
                )}

                {/* ---- Turbine nodes (rightmost) ---- */}
                {F.tps.flat(2).map(({ p, c, t }) => (
                  <div
                    key={t.id}
                    className={nodeBase}
                    style={{ left: p.x, top: p.y, transform: "translate(-50%,-50%)" }}
                    onMouseDown={(e) => startDrag(e, `t-${t.id}`)}
                    title={[t.designation, t.ratedPowerKw ? fmt(t.ratedPowerKw) : null, t.manufacturer]
                      .filter(Boolean)
                      .join(" | ")}
                  >
                    <div
                      className="relative flex items-center justify-center rounded-full shadow-md transition-all hover:scale-110 hover:shadow-lg"
                      style={{
                        width: TURBINE_SIZE,
                        height: TURBINE_SIZE,
                        backgroundColor: c,
                      }}
                    >
                      <Wind className="h-6 w-6 text-white" />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900"
                        style={{ backgroundColor: STATUS_RING[t.status] || "#9ca3af" }}
                      />
                    </div>
                    <span className="mt-1 text-[10px] font-medium text-center max-w-[80px] truncate">
                      {t.designation}
                    </span>
                    {t.ratedPowerKw != null && (
                      <span className="text-[9px] text-muted-foreground">
                        {fmt(t.ratedPowerKw)}
                      </span>
                    )}
                  </div>
                ))}

                {/* ---- Unassigned turbine nodes (no operator) ---- */}
                {F.utps.flat().map(({ p, c, t }) => (
                  <div
                    key={`u-${t.id}`}
                    className={nodeBase}
                    style={{ left: p.x, top: p.y, transform: "translate(-50%,-50%)" }}
                    onMouseDown={(e) => startDrag(e, `t-${t.id}`)}
                    title={[t.designation, t.ratedPowerKw ? fmt(t.ratedPowerKw) : null, t.manufacturer]
                      .filter(Boolean)
                      .join(" | ")}
                  >
                    <div
                      className="relative flex items-center justify-center rounded-full shadow-md transition-all hover:scale-110 hover:shadow-lg"
                      style={{
                        width: TURBINE_SIZE,
                        height: TURBINE_SIZE,
                        backgroundColor: c,
                      }}
                    >
                      <Wind className="h-6 w-6 text-white" />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900"
                        style={{ backgroundColor: STATUS_RING[t.status] || "#9ca3af" }}
                      />
                    </div>
                    <span className="mt-1 text-[10px] font-medium text-center max-w-[80px] truncate">
                      {t.designation}
                    </span>
                    {t.ratedPowerKw != null && (
                      <span className="text-[9px] text-muted-foreground">
                        {fmt(t.ratedPowerKw)}
                      </span>
                    )}
                  </div>
                ))}

              </div>
            </div>

            {/* ============ Legend ============ */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
              {operatorFundsForLegend.length > 0 && (
                <>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Betreiber
                  </span>
                  {operatorFundsForLegend.map((entry) => {
                    const color = entry.fund.fundCategory?.color || DEFAULT_COLOR;
                    return (
                      <div key={entry.fund.id} className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs">
                          {entry.fund.name}
                          <span className="text-muted-foreground"> ({entry.count} WEA)</span>
                        </span>
                      </div>
                    );
                  })}
                  <span className="text-muted-foreground">|</span>
                </>
              )}
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Netzgesellschaften
              </span>
              {netzLegend.map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs">
                    {entry.name}{" "}
                    <span className="text-muted-foreground">({entry.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
