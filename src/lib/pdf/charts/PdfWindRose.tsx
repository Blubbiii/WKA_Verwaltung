/**
 * PDF Wind Rose Chart — 16-sector polar diagram with 6 speed range colors
 * Uses react-pdf SVG primitives for server-side PDF rendering
 */

import { Svg, G, Path, Line, Text as SvgText, Circle } from "@react-pdf/renderer";

// =============================================================================
// Types
// =============================================================================

export interface WindRoseSector {
  direction: string;
  directionDeg: number;
  total: number;
  speedRanges: Array<{ range: string; count: number }>;
}

export interface WindRoseMeta {
  totalMeasurements: number;
  avgWindSpeed: number | null;
  dominantDirection: string | null;
}

interface PdfWindRoseProps {
  data: WindRoseSector[];
  meta: WindRoseMeta;
  size?: number;
}

// =============================================================================
// Constants
// =============================================================================

const SPEED_COLORS = [
  "#93c5fd", // 0-3 m/s  (light blue)
  "#60a5fa", // 3-6 m/s
  "#3b82f6", // 6-9 m/s
  "#2563eb", // 9-12 m/s
  "#1d4ed8", // 12-15 m/s
  "#1e3a8a", // 15+ m/s  (dark blue)
];

const SPEED_LABELS = ["0-3", "3-6", "6-9", "9-12", "12-15", "15+"];

// =============================================================================
// Helpers
// =============================================================================

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  // Convert from compass (0=N, clockwise) to math (0=E, counter-clockwise)
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function sectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number
): string {
  const s1 = polarToCartesian(cx, cy, innerR, startDeg);
  const s2 = polarToCartesian(cx, cy, outerR, startDeg);
  const e1 = polarToCartesian(cx, cy, outerR, endDeg);
  const e2 = polarToCartesian(cx, cy, innerR, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${s1.x} ${s1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${e1.x} ${e1.y}`,
    `L ${e2.x} ${e2.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${s1.x} ${s1.y}`,
    "Z",
  ].join(" ");
}

// =============================================================================
// Component
// =============================================================================

export function PdfWindRose({ data, meta, size = 280 }: PdfWindRoseProps) {
  if (!data || data.length === 0 || meta.totalMeasurements === 0) {
    return null;
  }

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30; // Leave room for labels
  const sectorWidth = 22.5; // 360° / 16 sectors

  // Find max percentage for scaling
  const maxPct = Math.max(...data.map((d) => (d.total / meta.totalMeasurements) * 100));
  const scaleFactor = maxR / (maxPct > 0 ? maxPct : 1);

  // Grid circles (percentage rings)
  const gridSteps = [5, 10, 15, 20];
  const visibleSteps = gridSteps.filter((s) => s <= maxPct * 1.2);
  if (visibleSteps.length === 0) visibleSteps.push(5);

  // Compass labels
  const compassLabels = [
    { label: "N", deg: 0 },
    { label: "O", deg: 90 },
    { label: "S", deg: 180 },
    { label: "W", deg: 270 },
  ];

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid circles */}
      {visibleSteps.map((step) => (
        <Circle
          key={`grid-${step}`}
          cx={cx}
          cy={cy}
          r={step * scaleFactor}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      ))}

      {/* Grid lines (16 radials) */}
      {Array.from({ length: 16 }, (_, i) => {
        const deg = i * 22.5;
        const outer = polarToCartesian(cx, cy, maxR, deg);
        return (
          <Line
            key={`radial-${i}`}
            x1={cx}
            y1={cy}
            x2={outer.x}
            y2={outer.y}
            stroke="#f3f4f6"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Sector wedges — stacked speed ranges */}
      {data.map((sector) => {
        const centerDeg = sector.directionDeg;
        const startDeg = centerDeg - sectorWidth / 2;
        const endDeg = centerDeg + sectorWidth / 2;

        let cumulativeR = 0;
        return (
          <G key={sector.direction}>
            {sector.speedRanges.map((sr, ri) => {
              const pct = (sr.count / meta.totalMeasurements) * 100;
              const innerR = cumulativeR * scaleFactor;
              const outerR = (cumulativeR + pct) * scaleFactor;
              cumulativeR += pct;

              if (pct <= 0) return null;

              return (
                <Path
                  key={`${sector.direction}-${ri}`}
                  d={sectorPath(cx, cy, innerR, outerR, startDeg, endDeg)}
                  fill={SPEED_COLORS[ri] || SPEED_COLORS[5]}
                  stroke="white"
                  strokeWidth={0.3}
                />
              );
            })}
          </G>
        );
      })}

      {/* Compass labels */}
      {compassLabels.map(({ label, deg }) => {
        const pos = polarToCartesian(cx, cy, maxR + 14, deg);
        return (
          <SvgText
            key={label}
            x={pos.x}
            y={pos.y + 3}
            style={{ fontSize: 9, fontWeight: 700, fill: "#374151" }}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}

      {/* Grid labels */}
      {visibleSteps.map((step) => (
        <SvgText
          key={`label-${step}`}
          x={cx + 2}
          y={cy - step * scaleFactor - 1}
          style={{ fontSize: 6, fill: "#9ca3af" }}
        >
          {step}%
        </SvgText>
      ))}
    </Svg>
  );
}

// =============================================================================
// Legend
// =============================================================================

export function PdfWindRoseLegend() {
  const itemWidth = 55;
  const totalWidth = SPEED_LABELS.length * itemWidth;

  return (
    <Svg width={totalWidth} height={16} viewBox={`0 0 ${totalWidth} 16`}>
      {SPEED_LABELS.map((label, i) => {
        const x = i * itemWidth;
        return (
          <G key={label}>
            <Path
              d={`M ${x} 2 h 10 v 10 h -10 Z`}
              fill={SPEED_COLORS[i]}
            />
            <SvgText
              x={x + 13}
              y={10}
              style={{ fontSize: 7, fill: "#374151" }}
            >
              {label} m/s
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
