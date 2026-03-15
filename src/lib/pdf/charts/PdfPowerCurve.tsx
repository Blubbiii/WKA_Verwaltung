/**
 * PDF Power Curve Chart — scatter + mean curve + rated power line
 * Uses react-pdf SVG primitives for server-side PDF rendering
 */

import { Svg, G, Path, Line, Circle, Text as SvgText } from "@react-pdf/renderer";

// =============================================================================
// Types
// =============================================================================

export interface PowerCurveScatter {
  windSpeed: number;
  powerKw: number;
}

export interface PowerCurveMean {
  windSpeed: number;
  avgPowerKw: number;
  count: number;
}

interface PdfPowerCurveProps {
  scatter: PowerCurveScatter[];
  curve: PowerCurveMean[];
  ratedPowerKw?: number | null;
  width?: number;
  height?: number;
}

// =============================================================================
// Component
// =============================================================================

export function PdfPowerCurve({
  scatter,
  curve,
  ratedPowerKw,
  width = 480,
  height = 240,
}: PdfPowerCurveProps) {
  if ((!scatter || scatter.length === 0) && (!curve || curve.length === 0)) {
    return null;
  }

  const margin = { top: 15, right: 15, bottom: 30, left: 50 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // Determine axis ranges
  const allWindSpeeds = [
    ...scatter.map((s) => s.windSpeed),
    ...curve.map((c) => c.windSpeed),
  ];
  const allPower = [
    ...scatter.map((s) => s.powerKw),
    ...curve.map((c) => c.avgPowerKw),
    ...(ratedPowerKw ? [ratedPowerKw] : []),
  ];

  const xMax = Math.ceil(Math.max(...allWindSpeeds, 25) / 5) * 5;
  const yMax = Math.ceil(Math.max(...allPower, 100) / 500) * 500;

  const scaleX = (v: number) => margin.left + (v / xMax) * chartW;
  const scaleY = (v: number) => margin.top + chartH - (v / yMax) * chartH;

  // X-axis ticks
  const xTicks = Array.from({ length: xMax / 5 + 1 }, (_, i) => i * 5);
  // Y-axis ticks
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => (yMax / yTickCount) * i);

  // Mean curve path
  const sortedCurve = [...curve].sort((a, b) => a.windSpeed - b.windSpeed);
  const curvePath = sortedCurve
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.windSpeed)} ${scaleY(p.avgPowerKw)}`)
    .join(" ");

  // Subsample scatter for PDF (max 500 points to keep file size reasonable)
  const maxScatterPoints = 500;
  const step = Math.max(1, Math.floor(scatter.length / maxScatterPoints));
  const sampledScatter = scatter.filter((_, i) => i % step === 0);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <G>
        {/* Grid */}
        {yTicks.map((tick) => (
          <G key={`ygrid-${tick}`}>
            <Line
              x1={margin.left}
              y1={scaleY(tick)}
              x2={margin.left + chartW}
              y2={scaleY(tick)}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <SvgText
              x={margin.left - 4}
              y={scaleY(tick) + 3}
              style={{ fontSize: 7, fill: "#6b7280" }}
              textAnchor="end"
            >
              {tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : tick.toFixed(0)}
            </SvgText>
          </G>
        ))}

        {xTicks.map((tick) => (
          <G key={`xgrid-${tick}`}>
            <Line
              x1={scaleX(tick)}
              y1={margin.top}
              x2={scaleX(tick)}
              y2={margin.top + chartH}
              stroke="#f3f4f6"
              strokeWidth={0.5}
            />
            <SvgText
              x={scaleX(tick)}
              y={margin.top + chartH + 12}
              style={{ fontSize: 7, fill: "#6b7280" }}
              textAnchor="middle"
            >
              {tick}
            </SvgText>
          </G>
        ))}

        {/* Scatter points */}
        {sampledScatter.map((p, i) => (
          <Circle
            key={`sc-${i}`}
            cx={scaleX(p.windSpeed)}
            cy={scaleY(p.powerKw)}
            r={1.2}
            fill="#93c5fd"
            opacity={0.4}
          />
        ))}

        {/* Mean curve */}
        {curvePath && (
          <Path
            d={curvePath}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth={2}
          />
        )}

        {/* Rated power line */}
        {ratedPowerKw && ratedPowerKw > 0 && (
          <G>
            <Line
              x1={margin.left}
              y1={scaleY(ratedPowerKw)}
              x2={margin.left + chartW}
              y2={scaleY(ratedPowerKw)}
              stroke="#ef4444"
              strokeWidth={0.8}
              strokeDasharray="4,3"
            />
            <SvgText
              x={margin.left + chartW - 2}
              y={scaleY(ratedPowerKw) - 3}
              style={{ fontSize: 6, fill: "#ef4444" }}
              textAnchor="end"
            >
              Nennleistung {(ratedPowerKw / 1000).toFixed(1)} MW
            </SvgText>
          </G>
        )}

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
          Leistung (kW)
        </SvgText>
      </G>
    </Svg>
  );
}
