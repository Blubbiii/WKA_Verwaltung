"use client";

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

// =============================================================================
// Chart colors
// =============================================================================

const COLORS = {
  advances: "#3b82f6", // blue-500
  settled: "#22c55e", // green-500
  differencePlus: "#16a34a", // green-600
  differenceMinus: "#dc2626", // red-600
};

const PIE_COLORS: Record<string, string> = {
  PAID: "#22c55e", // green
  SENT: "#3b82f6", // blue
  DRAFT: "#94a3b8", // slate
  CANCELLED: "#ef4444", // red
  OVERDUE: "#f97316", // orange
};

const PIE_LABELS: Record<string, string> = {
  PAID: "Bezahlt",
  SENT: "Versendet",
  DRAFT: "Entwurf",
  CANCELLED: "Storniert",
  OVERDUE: "Überfällig",
};

// =============================================================================
// Monthly comparison bar chart (Vorschüsse vs Abrechnungen)
// =============================================================================

interface MonthlyData {
  month: string;
  advances: number;
  settled: number;
  difference: number;
}

interface MonthlyComparisonChartProps {
  data: MonthlyData[];
  className?: string;
}

// German month abbreviations
const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mrz",
  "04": "Apr",
  "05": "Mai",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Okt",
  "11": "Nov",
  "12": "Dez",
};

function formatMonthLabel(month: string): string {
  const parts = month.split("-");
  return MONTH_LABELS[parts[1]] ?? parts[1];
}

// Custom tooltip for the bar chart
function MonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}:</span>
          <span className="font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyComparisonChart({
  data,
  className,
}: MonthlyComparisonChartProps) {
  // Only show months that have data
  const hasData = data.some((d) => d.advances !== 0 || d.settled !== 0);

  if (!hasData) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">
            Monatlicher Vergleich
          </CardTitle>
          <CardDescription>
            Vorschüsse vs. Abrechnungen pro Monat
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground text-sm">
            Keine Daten für diesen Zeitraum vorhanden
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    monthLabel: formatMonthLabel(d.month),
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Monatlicher Vergleich</CardTitle>
        <CardDescription>
          Vorschüsse vs. Abrechnungen pro Monat
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(val: number) =>
                new Intl.NumberFormat("de-DE", {
                  notation: "compact",
                  maximumFractionDigits: 0,
                }).format(val)
              }
              className="text-muted-foreground"
            />
            <Tooltip content={<MonthlyTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              dataKey="advances"
              name="Vorschüsse"
              fill={COLORS.advances}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="settled"
              name="Abrechnungen"
              fill={COLORS.settled}
              radius={[2, 2, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="difference"
              name="Differenz"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Invoice status donut chart
// =============================================================================

interface InvoiceStatusChartProps {
  data: Record<string, number>;
  className?: string;
}

// Custom label for the donut chart
function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}) {
  if (percent < 0.05) return null; // Hide labels for very small slices

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function InvoiceStatusChart({
  data,
  className,
}: InvoiceStatusChartProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: PIE_LABELS[key] ?? key,
      value,
      key,
    }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">Rechnungsstatus</CardTitle>
          <CardDescription>Verteilung nach Status</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground text-sm">
            Keine Rechnungen vorhanden
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Rechnungsstatus</CardTitle>
        <CardDescription>
          Verteilung nach Status ({total} gesamt)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={renderCustomLabel}
              labelLine={false}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={PIE_COLORS[entry.key] ?? "#94a3b8"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} Rechnungen`,
                name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
