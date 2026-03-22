/**
 * PDF-native Network Topology component with SVG connecting lines.
 *
 * Renders the Gesellschafts-Struktur (NVP → Netzgesellschaft → Betreiber → WEA)
 * using @react-pdf/renderer SVG primitives for connecting lines and View/Text
 * for node labels. This mirrors the interactive NetworkTopology.tsx component
 * from the park detail page in a static, print-friendly format.
 */

import { View, Text, StyleSheet, Svg, Line, Circle, Rect, G, Text as SvgText, Path } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types (matching the data shape provided by the annual report generator)
// ---------------------------------------------------------------------------

interface TopologyFundCategory {
  color: string | null;
}

interface TopologyFund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory?: TopologyFundCategory | null;
  childHierarchies?: Array<{
    ownershipPercentage: number | null;
    childFundId: string;
  }>;
}

export interface TopologyTurbine {
  id: string;
  designation: string;
  ratedPowerKw: number | null;
  status: string;
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: TopologyFund | null;
  operatorHistory?: Array<{
    ownershipPercentage: number | null;
    operatorFund: TopologyFund;
  }>;
}

export interface PdfNetworkTopologyProps {
  parkName: string;
  turbines: TopologyTurbine[];
  billingEntityName?: string | null;
}

// ---------------------------------------------------------------------------
// Grouping logic (same as NetworkTopology.tsx, adapted for server-side)
// ---------------------------------------------------------------------------

interface BetreiberInNetz {
  fund: TopologyFund;
  turbines: TopologyTurbine[];
  avgOwnershipPct: number | null;
}

interface NetzWithBetreiber {
  fundId: string | null;
  fund: TopologyFund | null;
  totalCapacityKw: number;
  betreiber: BetreiberInNetz[];
  unassignedTurbines: TopologyTurbine[];
}

function groupByNetzAndOperator(turbines: TopologyTurbine[]): NetzWithBetreiber[] {
  const netzMap = new Map<
    string | null,
    {
      fundId: string | null;
      fund: TopologyFund | null;
      turbines: TopologyTurbine[];
      totalCapacityKw: number;
    }
  >();

  for (const t of turbines) {
    const k = t.netzgesellschaftFundId;
    if (!netzMap.has(k)) {
      netzMap.set(k, {
        fundId: k,
        fund: t.netzgesellschaftFund,
        turbines: [],
        totalCapacityKw: 0,
      });
    }
    const g = netzMap.get(k)!;
    g.turbines.push(t);
    g.totalCapacityKw += t.ratedPowerKw ? Number(t.ratedPowerKw) : 0;
  }

  const netzGroups = Array.from(netzMap.values()).sort((a, b) => {
    if (!a.fundId && b.fundId) return 1;
    if (a.fundId && !b.fundId) return -1;
    return (a.fund?.name ?? "").localeCompare(b.fund?.name ?? "", "de");
  });

  return netzGroups.map((ng) => {
    const operatorMap = new Map<string, { fund: TopologyFund; turbines: TopologyTurbine[] }>();
    const unassigned: TopologyTurbine[] = [];

    for (const t of ng.turbines) {
      if (!t.operatorHistory || t.operatorHistory.length === 0) {
        unassigned.push(t);
        continue;
      }
      const op = t.operatorHistory[0];
      const k = op.operatorFund.id;
      if (!operatorMap.has(k)) {
        operatorMap.set(k, { fund: op.operatorFund, turbines: [] });
      }
      operatorMap.get(k)!.turbines.push(t);
    }

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
        avgOwnershipPct: hierarchyMap.get(fund.id) ?? null,
      }))
      .sort((a, b) => a.fund.name.localeCompare(b.fund.name, "de"));

    return {
      fundId: ng.fundId,
      fund: ng.fund,
      totalCapacityKw: ng.totalCapacityKw,
      betreiber,
      unassignedTurbines: unassigned,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = "#94a3b8";

function fmtPower(kw: number) {
  return kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${kw.toFixed(0)} kW`;
}

function fundLabel(fund: TopologyFund): string {
  const norm = (s: string) => s.replace(/[+&]/g, "").toLowerCase();
  return `${fund.name}${fund.legalForm && !norm(fund.name).includes(norm(fund.legalForm)) ? ` ${fund.legalForm}` : ""}`;
}

// ---------------------------------------------------------------------------
// Layout computation (simplified version of the interactive component)
// ---------------------------------------------------------------------------

interface Pt { x: number; y: number }
interface LnData {
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  label?: string;
}
interface NodeData {
  p: Pt;
  color: string;
  label: string;
  sublabel?: string;
  type: "nvp" | "netz" | "betreiber" | "turbine";
  status?: string;
}

// Node dimensions for rectangular cards
const NVP_W = 72; const NVP_H = 24;
const NETZ_W = 76; const NETZ_H = 28;
const BET_W = 78; const BET_H = 28;
const TURB_W = 40; const TURB_H = 16;
const TURBINE_COLS = 4;
const TURBINE_SPACING_X = 50;
const TURBINE_SPACING_Y = 28;
const BETREIBER_GAP = 22;
const GROUP_GAP = 26;
// Keep NODE_R for layout position calculations (use half-widths)
const NODE_R = { nvp: NVP_W / 2, netz: NETZ_W / 2, betreiber: BET_W / 2, turbine: TURB_W / 2 };

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  INACTIVE: "#eab308",
  ARCHIVED: "#9ca3af",
};

interface LayoutResult {
  width: number;
  height: number;
  nodes: NodeData[];
  lines: LnData[];
}

function computeLayout(
  netzGroups: NetzWithBetreiber[],
  billingEntityName: string | null,
  parkName: string,
): LayoutResult {
  const nodes: NodeData[] = [];
  const lines: LnData[] = [];

  if (!netzGroups.length) return { width: 400, height: 100, nodes, lines };

  const hasBetreiber = netzGroups.some((ng) => ng.betreiber.length > 0);
  const hasNetz = netzGroups.some((ng) => ng.fundId !== null);

  // X columns
  const nvpX = 40;
  const netzX = hasNetz ? 140 : nvpX;
  const betreiberX = hasBetreiber ? (hasNetz ? 260 : 140) : netzX;
  const turbineBaseX = hasBetreiber
    ? (hasNetz ? 370 : 250)
    : hasNetz ? 240 : 130;

  // Compute vertical heights
  let totalH = 0;
  const groupMetrics: Array<{
    betreiberH: number[];
    unassignedH: number;
    totalH: number;
  }> = [];

  for (const ng of netzGroups) {
    const betreiberH = ng.betreiber.map((b) => {
      const rows = Math.ceil(b.turbines.length / TURBINE_COLS);
      return Math.max(30, rows * TURBINE_SPACING_Y + 10);
    });
    const unassignedRows = Math.ceil(ng.unassignedTurbines.length / TURBINE_COLS);
    const unassignedH = ng.unassignedTurbines.length > 0
      ? Math.max(30, unassignedRows * TURBINE_SPACING_Y + 10)
      : 0;

    const betreiberTotal = betreiberH.reduce((s, h) => s + h, 0)
      + Math.max(0, ng.betreiber.length - 1) * BETREIBER_GAP;

    const gH = betreiberTotal
      + (ng.unassignedTurbines.length > 0 && ng.betreiber.length > 0 ? BETREIBER_GAP : 0)
      + unassignedH;

    const grpTotal = Math.max(40, gH);
    groupMetrics.push({ betreiberH, unassignedH, totalH: grpTotal });
    totalH += grpTotal;
  }

  totalH += Math.max(0, netzGroups.length - 1) * GROUP_GAP;
  const canvasH = Math.max(120, totalH + 40);
  const cy = canvasH / 2;

  // NVP node
  const nvp: Pt = { x: nvpX, y: cy };
  nodes.push({
    p: nvp,
    color: "#F59E0B",
    label: billingEntityName || parkName,
    sublabel: "NVP",
    type: "nvp",
  });

  // Position groups vertically
  let curY = (canvasH - totalH) / 2 + 20;
  let maxTurbineX = turbineBaseX;

  for (let ni = 0; ni < netzGroups.length; ni++) {
    const ng = netzGroups[ni];
    const metrics = groupMetrics[ni];
    const groupCenterY = curY + metrics.totalH / 2;
    const netzColor = ng.fund?.fundCategory?.color || DEFAULT_COLOR;

    // Netz node
    let netzPt: Pt;
    if (ng.fundId) {
      netzPt = { x: netzX, y: groupCenterY };
      nodes.push({
        p: netzPt,
        color: netzColor,
        label: fundLabel(ng.fund!),
        sublabel: `${ng.totalCapacityKw > 0 ? fmtPower(ng.totalCapacityKw) : ""}`,
        type: "netz",
      });
      lines.push({ x1: nvp.x, y1: nvp.y, x2: netzPt.x, y2: netzPt.y, color: netzColor });
    } else {
      netzPt = nvp;
    }

    // Betreiber + Turbines
    let betreiberY = curY;
    for (let bi = 0; bi < ng.betreiber.length; bi++) {
      const b = ng.betreiber[bi];
      const bHeight = metrics.betreiberH[bi];
      const bCenterY = betreiberY + bHeight / 2;
      const opColor = b.fund.fundCategory?.color || DEFAULT_COLOR;

      const bPt: Pt = { x: betreiberX, y: bCenterY };
      nodes.push({
        p: bPt,
        color: opColor,
        label: fundLabel(b.fund),
        sublabel: b.fund.legalForm || undefined,
        type: "betreiber",
      });

      const pctLabel = b.avgOwnershipPct != null ? `${b.avgOwnershipPct.toFixed(0)}%` : undefined;
      lines.push({
        x1: netzPt.x, y1: netzPt.y,
        x2: bPt.x, y2: bPt.y,
        color: opColor,
        label: pctLabel,
      });

      // Turbines
      for (let ti = 0; ti < b.turbines.length; ti++) {
        const col = ti % TURBINE_COLS;
        const row = Math.floor(ti / TURBINE_COLS);
        const tx = turbineBaseX + col * TURBINE_SPACING_X;
        const ty = betreiberY + 8 + row * TURBINE_SPACING_Y;
        if (tx > maxTurbineX) maxTurbineX = tx;

        const t = b.turbines[ti];
        const tPt: Pt = { x: tx, y: ty };
        nodes.push({
          p: tPt,
          color: opColor,
          label: t.designation,
          sublabel: t.ratedPowerKw ? fmtPower(Number(t.ratedPowerKw)) : undefined,
          type: "turbine",
          status: t.status,
        });
        lines.push({ x1: bPt.x, y1: bPt.y, x2: tPt.x, y2: tPt.y, color: opColor });
      }

      betreiberY += bHeight + BETREIBER_GAP;
    }

    // Unassigned turbines
    if (ng.unassignedTurbines.length > 0) {
      const uStartY = ng.betreiber.length > 0 ? betreiberY : curY;
      for (let ti = 0; ti < ng.unassignedTurbines.length; ti++) {
        const col = ti % TURBINE_COLS;
        const row = Math.floor(ti / TURBINE_COLS);
        const tx = turbineBaseX + col * TURBINE_SPACING_X;
        const ty = uStartY + 8 + row * TURBINE_SPACING_Y;
        if (tx > maxTurbineX) maxTurbineX = tx;

        const t = ng.unassignedTurbines[ti];
        const tPt: Pt = { x: tx, y: ty };
        nodes.push({
          p: tPt,
          color: DEFAULT_COLOR,
          label: t.designation,
          sublabel: t.ratedPowerKw ? fmtPower(Number(t.ratedPowerKw)) : undefined,
          type: "turbine",
          status: t.status,
        });
        lines.push({ x1: netzPt.x, y1: netzPt.y, x2: tPt.x, y2: tPt.y, color: DEFAULT_COLOR });
      }
    }

    curY += metrics.totalH + GROUP_GAP;
  }

  const width = Math.max(480, maxTurbineX + TURBINE_SPACING_X + 20);
  return { width, height: canvasH, nodes, lines };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const COLORS = {
  primary: "#1E3A5F",
  muted: "#666666",
  light: "#F5F5F5",
  border: "#E0E0E0",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  container: {
    marginTop: 5,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 7,
    color: COLORS.muted,
  },
  statusLegend: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PdfNetworkTopology({
  parkName,
  turbines,
  billingEntityName,
}: PdfNetworkTopologyProps) {
  const netzGroups = groupByNetzAndOperator(turbines);

  if (netzGroups.length === 0) return null;

  const layout = computeLayout(netzGroups, billingEntityName ?? null, parkName);

  // Collect unique operators for legend
  const operatorLegend: Array<{ name: string; color: string }> = [];
  const seenOps = new Set<string>();
  for (const ng of netzGroups) {
    for (const b of ng.betreiber) {
      if (!seenOps.has(b.fund.id)) {
        seenOps.add(b.fund.id);
        operatorLegend.push({
          name: fundLabel(b.fund),
          color: b.fund.fundCategory?.color || DEFAULT_COLOR,
        });
      }
    }
  }

  return (
    <View style={s.container}>
      {/* SVG Graph with lines and nodes */}
      <Svg width={layout.width} height={layout.height}>
        {/* Background */}
        <Rect x={0} y={0} width={layout.width} height={layout.height} fill="#F8FAFD" rx={6} />

        {/* Connection lines */}
        {layout.lines.map((l, i) => {
          const midX = (l.x1 + l.x2) / 2;
          return (
            <G key={`l-${i}`}>
              <Path
                d={`M ${l.x1},${l.y1} C ${midX},${l.y1} ${midX},${l.y2} ${l.x2},${l.y2}`}
                stroke={l.color}
                strokeWidth={1.4}
                strokeOpacity={0.55}
                fill="none"
              />
              {/* ownership label badge unchanged */}
              {l.label && (
                <>
                  <Rect
                    x={(l.x1 + l.x2) / 2 - 14}
                    y={(l.y1 + l.y2) / 2 - 5}
                    width={28}
                    height={10}
                    rx={5}
                    fill="white"
                    fillOpacity={0.95}
                    stroke={l.color}
                    strokeWidth={0.5}
                    strokeOpacity={0.6}
                  />
                  <SvgText
                    x={(l.x1 + l.x2) / 2}
                    y={(l.y1 + l.y2) / 2 + 3.5}
                    textAnchor="middle"
                    style={{ fontSize: 6, fontWeight: "bold", fill: l.color }}
                  >
                    {l.label}
                  </SvgText>
                </>
              )}
            </G>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node, i) => {
          if (node.type === "nvp") {
            return (
              <G key={`n-${i}`}>
                {/* Amber pill */}
                <Rect x={node.p.x - NVP_W/2} y={node.p.y - NVP_H/2} width={NVP_W} height={NVP_H} rx={NVP_H/2} fill="#F59E0B" />
                <SvgText
                  x={node.p.x}
                  y={node.p.y - 3}
                  textAnchor="middle"
                  style={{ fontSize: 6, fontWeight: "bold", fill: "#FFFFFF" }}
                >
                  {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                </SvgText>
                <SvgText
                  x={node.p.x}
                  y={node.p.y + 5.5}
                  textAnchor="middle"
                  style={{ fontSize: 5, fill: "#FFFFFFCC" }}
                >
                  NVP
                </SvgText>
              </G>
            );
          }

          if (node.type === "netz") {
            return (
              <G key={`n-${i}`}>
                {/* Bordered rounded rect — transparent fill */}
                <Rect x={node.p.x - NETZ_W/2} y={node.p.y - NETZ_H/2} width={NETZ_W} height={NETZ_H} rx={5}
                  fill={`${node.color}22`} stroke={node.color} strokeWidth={1.5} />
                <SvgText
                  x={node.p.x}
                  y={node.p.y - 4}
                  textAnchor="middle"
                  style={{ fontSize: 5.5, fontWeight: "bold", fill: "#1E3A5F" }}
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label}
                </SvgText>
                {node.sublabel && (
                  <SvgText
                    x={node.p.x}
                    y={node.p.y + 5}
                    textAnchor="middle"
                    style={{ fontSize: 4.5, fill: "#6B7280" }}
                  >
                    {node.sublabel}
                  </SvgText>
                )}
              </G>
            );
          }

          if (node.type === "betreiber") {
            return (
              <G key={`n-${i}`}>
                {/* Filled rounded rect with fund color */}
                <Rect x={node.p.x - BET_W/2} y={node.p.y - BET_H/2} width={BET_W} height={BET_H} rx={5}
                  fill={node.color} />
                <SvgText
                  x={node.p.x}
                  y={node.p.y + 2.5}
                  textAnchor="middle"
                  style={{ fontSize: 5.5, fontWeight: "bold", fill: "#FFFFFF" }}
                >
                  {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                </SvgText>
              </G>
            );
          }

          // Turbine: pill chip with status dot inside
          const statusColor = STATUS_COLORS[node.status || ""] || "#9ca3af";
          return (
            <G key={`n-${i}`}>
              {/* Pill background — operator color */}
              <Rect x={node.p.x - TURB_W/2} y={node.p.y - TURB_H/2} width={TURB_W} height={TURB_H} rx={TURB_H/2}
                fill={node.color} fillOpacity={0.85} />
              {/* Designation text */}
              <SvgText
                x={node.p.x - 3}
                y={node.p.y + 2.5}
                textAnchor="middle"
                style={{ fontSize: 5, fontWeight: "bold", fill: "#FFFFFF" }}
              >
                {node.label}
              </SvgText>
              {/* Status dot — right edge inside pill */}
              <Circle
                cx={node.p.x + TURB_W/2 - 5}
                cy={node.p.y}
                r={3}
                fill={statusColor}
                stroke="white"
                strokeWidth={0.8}
              />
            </G>
          );
        })}
      </Svg>

      {/* Legend: operators */}
      {operatorLegend.length > 0 && (
        <View style={s.legend}>
          {operatorLegend.map((op, i) => (
            <View key={`leg-${i}`} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: op.color }]} />
              <Text style={s.legendText}>{op.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Legend: status colors */}
      <View style={s.statusLegend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#22c55e" }]} />
          <Text style={s.legendText}>Aktiv</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#eab308" }]} />
          <Text style={s.legendText}>Inaktiv</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#9ca3af" }]} />
          <Text style={s.legendText}>Archiviert</Text>
        </View>
      </View>
    </View>
  );
}
