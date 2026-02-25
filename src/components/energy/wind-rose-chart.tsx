"use client";

import { useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarAngleAxis,
  PolarRadiusAxis,
  PolarGrid,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// =============================================================================
// Types
// =============================================================================

interface SpeedRange {
  range: string;
  count: number;
}

interface WindRoseDataPoint {
  direction: string;
  directionDeg: number;
  total: number;
  speedRanges: SpeedRange[];
}

interface WindRoseMeta {
  totalMeasurements: number;
  avgWindSpeed: number;
  dominantDirection: string;
}

interface WindRoseChartProps {
  data: WindRoseDataPoint[];
  meta: WindRoseMeta | null;
}

// =============================================================================
// Constants
// =============================================================================

const SPEED_RANGE_COLORS: Record<string, string> = {
  "0-3": "#bfdbfe",
  "3-6": "#93c5fd",
  "6-9": "#60a5fa",
  "9-12": "#335E99",
  "12-15": "#2563eb",
  "15+": "#1d4ed8",
};

const SPEED_RANGE_LABELS: Record<string, string> = {
  "0-3": "0-3 m/s",
  "3-6": "3-6 m/s",
  "6-9": "6-9 m/s",
  "9-12": "9-12 m/s",
  "12-15": "12-15 m/s",
  "15+": ">15 m/s",
};

const SPEED_RANGE_ORDER = ["0-3", "3-6", "6-9", "9-12", "12-15", "15+"];

const numberFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// =============================================================================
// Custom Tooltip
// =============================================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function WindRoseTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        {payload
          .filter((entry) => entry.value > 0)
          .map((entry, index) => (
            <p key={index} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {numberFormatter.format(entry.value)} %
              </span>
            </p>
          ))}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function WindRoseChart({ data, meta }: WindRoseChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const totalMeasurements = meta?.totalMeasurements ?? data.reduce((sum, d) => sum + d.total, 0);
    if (totalMeasurements === 0) return [];

    return data.map((point) => {
      const entry: Record<string, string | number> = {
        direction: point.direction,
      };

      for (const range of SPEED_RANGE_ORDER) {
        const found = point.speedRanges.find((sr) => sr.range === range);
        entry[range] = found ? (found.count / totalMeasurements) * 100 : 0;
      }

      return entry;
    });
  }, [data, meta]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        Keine Windrosendaten vorhanden
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={chartData} outerRadius="75%">
          <PolarGrid className="stroke-muted" />
          <PolarAngleAxis
            dataKey="direction"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <PolarRadiusAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => `${numberFormatter.format(value)}%`}
            angle={90}
          />
          <Tooltip content={<WindRoseTooltip />} />
          {/* Stack from highest speed (back) to lowest (front) for visual layering */}
          {[...SPEED_RANGE_ORDER].reverse().map((range) => (
            <Radar
              key={range}
              name={SPEED_RANGE_LABELS[range]}
              dataKey={range}
              stroke={SPEED_RANGE_COLORS[range]}
              fill={SPEED_RANGE_COLORS[range]}
              fillOpacity={0.6}
            />
          ))}
          <Legend />
        </RadarChart>
      </ResponsiveContainer>

      {meta && (
        <div className="flex items-center justify-center gap-6 mt-4 text-sm text-muted-foreground">
          <span>
            Mittlere Windgeschwindigkeit:{" "}
            <span className="font-medium text-foreground">
              {numberFormatter.format(meta.avgWindSpeed)} m/s
            </span>
          </span>
          <span>
            Vorherrschende Richtung:{" "}
            <span className="font-medium text-foreground">
              {meta.dominantDirection}
            </span>
          </span>
          <span>
            Messwerte:{" "}
            <span className="font-medium text-foreground">
              {new Intl.NumberFormat("de-DE").format(meta.totalMeasurements)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
