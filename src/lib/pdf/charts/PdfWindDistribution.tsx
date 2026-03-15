/**
 * PDF Wind Speed Distribution Histogram — 1 m/s bins
 * Uses react-pdf SVG primitives for server-side PDF rendering
 */

import { Svg, G, Path, Line, Text as SvgText } from "@react-pdf/renderer";

// =============================================================================
// Types
// =============================================================================

export interface WindDistributionBin {
  binStart: number; // e.g. 0, 1, 2, ...
  binEnd: number;   // e.g. 1, 2, 3, ...
  count: number;
  percentage: number;
}

interface PdfWindDistributionProps {
  data: WindDistributionBin[];
  width?: number;
  height?: number;
}

// =============================================================================
// Component
// =============================================================================

export function PdfWindDistribution({
  data,
  width = 480,
  height = 200,
}: PdfWindDistributionProps) {
  if (!data || data.length === 0) return null;

  const margin = { top: 15, right: 15, bottom: 30, left: 40 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const maxPct = Math.max(...data.map((d) => d.percentage));
  const yMax = Math.ceil(maxPct / 5) * 5 || 10; // Round up to nearest 5
  const barW = chartW / data.length;

  // Y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <G>
        {/* Y-axis grid lines */}
        {yTicks.map((tick) => {
          const y = margin.top + chartH - (tick / yMax) * chartH;
          return (
            <G key={`ytick-${tick}`}>
              <Line
                x1={margin.left}
                y1={y}
                x2={margin.left + chartW}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <SvgText
                x={margin.left - 4}
                y={y + 3}
                style={{ fontSize: 7, fill: "#6b7280" }}
                textAnchor="end"
              >
                {tick.toFixed(0)}%
              </SvgText>
            </G>
          );
        })}

        {/* Bars */}
        {data.map((bin, i) => {
          const barH = (bin.percentage / yMax) * chartH;
          const x = margin.left + i * barW;
          const y = margin.top + chartH - barH;

          return (
            <G key={`bar-${i}`}>
              <Path
                d={`M ${x + 1} ${y} h ${barW - 2} v ${barH} h ${-(barW - 2)} Z`}
                fill="#3b82f6"
                opacity={0.85}
              />
              {/* X-axis label (every 2nd bin or if few bins) */}
              {(i % 2 === 0 || data.length <= 15) && (
                <SvgText
                  x={x + barW / 2}
                  y={margin.top + chartH + 12}
                  style={{ fontSize: 6, fill: "#6b7280" }}
                  textAnchor="middle"
                >
                  {bin.binStart}
                </SvgText>
              )}
            </G>
          );
        })}

        {/* Axis labels */}
        <SvgText
          x={margin.left + chartW / 2}
          y={height - 3}
          style={{ fontSize: 7, fill: "#374151" }}
          textAnchor="middle"
        >
          Windgeschwindigkeit (m/s)
        </SvgText>
        <SvgText
          x={8}
          y={margin.top + chartH / 2}
          style={{ fontSize: 7, fill: "#374151" }}
          textAnchor="middle"
          transform={`rotate(-90, 8, ${margin.top + chartH / 2})`}
        >
          Haeufigkeit (%)
        </SvgText>
      </G>
    </Svg>
  );
}
