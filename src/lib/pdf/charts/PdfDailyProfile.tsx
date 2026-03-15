/**
 * PDF Daily Profile Chart — area (power) + line (wind), labels every 2h
 * Uses react-pdf SVG primitives for server-side PDF rendering
 */

import { Svg, G, Path, Line, Text as SvgText } from "@react-pdf/renderer";

// =============================================================================
// Types
// =============================================================================

export interface DailyProfilePoint {
  timeSlot: string; // "HH:MM"
  avgPowerKw: number;
  avgWindSpeed: number | null;
}

interface PdfDailyProfileProps {
  data: DailyProfilePoint[];
  width?: number;
  height?: number;
}

// =============================================================================
// Component
// =============================================================================

export function PdfDailyProfile({
  data,
  width = 480,
  height = 200,
}: PdfDailyProfileProps) {
  if (!data || data.length === 0) return null;

  const margin = { top: 15, right: 45, bottom: 30, left: 50 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // Sort by time
  const sorted = [...data].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

  // Axis ranges
  const maxPower = Math.max(...sorted.map((d) => d.avgPowerKw), 1);
  const windValues = sorted
    .map((d) => d.avgWindSpeed)
    .filter((v): v is number => v != null);
  const maxWind = windValues.length > 0 ? Math.max(...windValues, 1) : 15;

  const yMaxPower = Math.ceil(maxPower / 500) * 500 || 500;
  const yMaxWind = Math.ceil(maxWind / 5) * 5 || 15;

  const scaleX = (i: number) => margin.left + (i / (sorted.length - 1)) * chartW;
  const scalePowerY = (v: number) => margin.top + chartH - (v / yMaxPower) * chartH;
  const scaleWindY = (v: number) => margin.top + chartH - (v / yMaxWind) * chartH;

  // Power area path
  const powerLinePath = sorted
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scalePowerY(d.avgPowerKw)}`)
    .join(" ");
  const powerAreaPath = `${powerLinePath} L ${scaleX(sorted.length - 1)} ${scalePowerY(0)} L ${scaleX(0)} ${scalePowerY(0)} Z`;

  // Wind line path
  const windLinePath = sorted
    .filter((d) => d.avgWindSpeed != null)
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(sorted.indexOf(d))} ${scaleWindY(d.avgWindSpeed!)}`)
    .join(" ");

  // X-axis labels (every 2 hours)
  const xLabels = sorted
    .map((d, i) => ({ label: d.timeSlot, index: i }))
    .filter((d) => {
      const hour = parseInt(d.label.split(":")[0], 10);
      const min = parseInt(d.label.split(":")[1], 10);
      return min === 0 && hour % 2 === 0;
    });

  // Y-axis ticks (power)
  const powerTicks = Array.from({ length: 5 }, (_, i) => (yMaxPower / 4) * i);
  // Y-axis ticks (wind)
  const windTicks = Array.from({ length: 4 }, (_, i) => (yMaxWind / 3) * i);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <G>
        {/* Power Y-axis grid */}
        {powerTicks.map((tick) => (
          <G key={`pgrid-${tick}`}>
            <Line
              x1={margin.left}
              y1={scalePowerY(tick)}
              x2={margin.left + chartW}
              y2={scalePowerY(tick)}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <SvgText
              x={margin.left - 4}
              y={scalePowerY(tick) + 3}
              style={{ fontSize: 7, fill: "#3b82f6" }}
              textAnchor="end"
            >
              {tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : tick.toFixed(0)}
            </SvgText>
          </G>
        ))}

        {/* Wind Y-axis labels (right side) */}
        {windTicks.map((tick) => (
          <SvgText
            key={`wlabel-${tick}`}
            x={margin.left + chartW + 4}
            y={scaleWindY(tick) + 3}
            style={{ fontSize: 7, fill: "#f59e0b" }}
          >
            {tick.toFixed(0)}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ label, index }) => (
          <SvgText
            key={`xlabel-${label}`}
            x={scaleX(index)}
            y={margin.top + chartH + 12}
            style={{ fontSize: 7, fill: "#6b7280" }}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}

        {/* Power area */}
        <Path
          d={powerAreaPath}
          fill="#3b82f6"
          opacity={0.15}
        />

        {/* Power line */}
        <Path
          d={powerLinePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />

        {/* Wind line */}
        {windLinePath && (
          <Path
            d={windLinePath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
          />
        )}

        {/* Axis labels */}
        <SvgText
          x={margin.left + chartW / 2}
          y={height - 3}
          style={{ fontSize: 7, fill: "#374151" }}
          textAnchor="middle"
        >
          Uhrzeit
        </SvgText>
        <SvgText
          x={8}
          y={margin.top + chartH / 2}
          style={{ fontSize: 7, fill: "#3b82f6" }}
          textAnchor="middle"
          transform={`rotate(-90, 8, ${margin.top + chartH / 2})`}
        >
          Leistung (kW)
        </SvgText>
        <SvgText
          x={width - 6}
          y={margin.top + chartH / 2}
          style={{ fontSize: 7, fill: "#f59e0b" }}
          textAnchor="middle"
          transform={`rotate(90, ${width - 6}, ${margin.top + chartH / 2})`}
        >
          Wind (m/s)
        </SvgText>
      </G>
    </Svg>
  );
}
