"use client";

/**
 * UX16: Recharts-Chart für Park-Comparison extrahiert.
 * Wird vom Widget per einzelnem dynamic() geladen (statt 9 parallele Chunks).
 * Muster: buchhaltung/planung/tabs/liquiditaet.tsx.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LOCALE_DE } from "@/lib/format";

const COLORS = ["#335E99", "#E0792E", "#3FA34D", "#B83280", "#7C3AED"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

interface ParkComparisonRow {
  month: number;
  [parkName: string]: number;
}

interface ParkSeries {
  id: string;
  name: string;
}

interface Props {
  chartData: ParkComparisonRow[];
  parks: ParkSeries[];
}

export function ParkComparisonChart({ chartData, parks }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="month"
          tickFormatter={(m: number) => MONTH_LABELS[m - 1] ?? String(m)}
          fontSize={12}
        />
        <YAxis
          fontSize={12}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)} GWh` : `${v} MWh`
          }
        />
        <Tooltip
          formatter={(v: unknown) => {
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n)
              ? `${n.toLocaleString(LOCALE_DE)} MWh`
              : String(v);
          }}
          labelFormatter={(m: unknown) => {
            const n = typeof m === "number" ? m : Number(m);
            return Number.isFinite(n) ? (MONTH_LABELS[n - 1] ?? String(n)) : String(m);
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {parks.map((p, i) => (
          <Line
            key={p.id}
            type="monotone"
            dataKey={p.name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
