"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
  ZAxis,
} from "recharts";

// =============================================================================
// Types
// =============================================================================

interface ScatterPoint {
  windSpeed: number;
  powerKw: number;
  turbineId: string;
}

interface CurvePoint {
  windSpeed: number;
  avgPowerKw: number;
}

interface PowerCurveChartProps {
  scatter: ScatterPoint[];
  curve: CurvePoint[];
}

// =============================================================================
// Formatters
// =============================================================================

const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
});

const powerFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

// =============================================================================
// Custom Tooltip
// =============================================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  payload: Record<string, number>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function PowerCurveTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">
          Windgeschwindigkeit:{" "}
          <span className="font-medium text-foreground">
            {numberFormatter.format(point.windSpeed ?? point.windSpeed)} m/s
          </span>
        </p>
        <p className="text-muted-foreground">
          Leistung:{" "}
          <span className="font-medium text-foreground">
            {powerFormatter.format(point.powerKw ?? point.avgPowerKw ?? 0)} kW
          </span>
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function PowerCurveChart({ scatter, curve }: PowerCurveChartProps) {
  if ((!scatter || scatter.length === 0) && (!curve || curve.length === 0)) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        Keine Leistungskurvendaten vorhanden
      </div>
    );
  }

  // Combine scatter and curve data for ComposedChart
  // We create a merged dataset: scatter points have powerKw, curve points have avgPowerKw
  const sortedCurve = [...(curve || [])].sort((a, b) => a.windSpeed - b.windSpeed);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis
          dataKey="windSpeed"
          type="number"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          label={{
            value: "Windgeschwindigkeit (m/s)",
            position: "insideBottom",
            offset: -5,
            style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
          }}
          domain={["dataMin", "dataMax"]}
        />
        <YAxis
          dataKey="powerKw"
          type="number"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          tickFormatter={(value) => powerFormatter.format(value)}
          label={{
            value: "Leistung (kW)",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
          }}
        />
        <ZAxis range={[15, 15]} />
        <Tooltip content={<PowerCurveTooltip />} />
        <Legend />
        <Scatter
          name="Messpunkte"
          data={scatter}
          fill="#93c5fd"
          fillOpacity={0.3}
          strokeOpacity={0}
        />
        <Line
          name="Mittlere Leistungskurve"
          data={sortedCurve}
          dataKey="avgPowerKw"
          stroke="#1d4ed8"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          type="monotone"
          legendType="line"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
