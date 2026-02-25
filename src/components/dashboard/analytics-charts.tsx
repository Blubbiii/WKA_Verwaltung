"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type {
  MonthlyInvoiceData,
  CapitalDevelopmentData,
  DocumentsByTypeData,
} from "@/lib/analytics/kpis";

// =============================================================================
// CHART COLORS — driven by CSS variables (auto-adapt to light/dark theme)
// =============================================================================

const CHART_COLORS = {
  primary: "hsl(var(--chart-1))",
  secondary: "hsl(var(--chart-3))",
  tertiary: "hsl(var(--chart-2))",
  muted: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--border))",
  text: "hsl(var(--muted-foreground))",
  tooltipBg: "hsl(var(--card))",
  tooltipBorder: "hsl(var(--border))",
};

const DONUT_COLORS = [
  "hsl(var(--chart-1))",  "hsl(var(--chart-3))",  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",  "hsl(var(--chart-5))",  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",  "hsl(var(--chart-8))",  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
];

function useChartColors() {
  return CHART_COLORS;
}

function useDonutColors() {
  return DONUT_COLORS;
}

// =============================================================================
// SHARED TOOLTIP STYLE
// =============================================================================

function useTooltipStyle() {
  const colors = useChartColors();
  return {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: "0.5rem",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  };
}

// =============================================================================
// MONTHLY INVOICES CHART (Bar Chart)
// =============================================================================

interface MonthlyInvoicesChartProps {
  data: MonthlyInvoiceData[];
  isLoading?: boolean;
  className?: string;
}

export function MonthlyInvoicesChart({
  data,
  isLoading = false,
  className,
}: MonthlyInvoicesChartProps) {
  const colors = useChartColors();
  const tooltipStyle = useTooltipStyle();

  if (isLoading) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1">
          <Skeleton className="h-full w-full min-h-[150px]" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Rechnungen pro Monat</CardTitle>
          <CardDescription className="text-xs">Erstellt vs. Bezahlt (letzte 6 Monate)</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Rechnungsdaten vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Rechnungen pro Monat
        </CardTitle>
        <CardDescription className="text-xs">Erstellt vs. Bezahlt (letzte 6 Monate)</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: colors.text }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: colors.text }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              width={40}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar
              dataKey="invoiced"
              name="Erstellt"
              fill={colors.primary}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="paid"
              name="Bezahlt"
              fill={colors.secondary}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CAPITAL DEVELOPMENT CHART (Line Chart)
// =============================================================================

interface CapitalDevelopmentChartProps {
  data: CapitalDevelopmentData[];
  isLoading?: boolean;
  className?: string;
}

export function CapitalDevelopmentChart({
  data,
  isLoading = false,
  className,
}: CapitalDevelopmentChartProps) {
  const colors = useChartColors();
  const tooltipStyle = useTooltipStyle();

  if (isLoading) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1">
          <Skeleton className="h-full w-full min-h-[150px]" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Kapitalentwicklung</CardTitle>
          <CardDescription className="text-xs">Gesamtkapital der Gesellschaften (12 Monate)</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Kapitaldaten vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Kapitalentwicklung
        </CardTitle>
        <CardDescription className="text-xs">Gesamtkapital der Gesellschaften (12 Monate)</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: colors.text }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: colors.text }}
              tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
              width={45}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
              contentStyle={tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="capital"
              name="Kapital"
              stroke={colors.primary}
              strokeWidth={2}
              dot={{ fill: colors.primary, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// DOCUMENTS BY TYPE CHART (Donut Chart)
// =============================================================================

interface DocumentsByTypeChartProps {
  data: DocumentsByTypeData[];
  isLoading?: boolean;
  className?: string;
}

export function DocumentsByTypeChart({
  data,
  isLoading = false,
  className,
}: DocumentsByTypeChartProps) {
  const donutColors = useDonutColors();
  const tooltipStyle = useTooltipStyle();

  if (isLoading) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1">
          <Skeleton className="h-full w-full min-h-[150px]" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Dokumente nach Typ</CardTitle>
          <CardDescription className="text-xs">Verteilung der Dokumentkategorien</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Dokumente vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Dokumente nach Typ
        </CardTitle>
        <CardDescription className="text-xs">Verteilung der Dokumentkategorien</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                percent > 0.05 ? `${name}\n${(percent * 100).toFixed(0)}%` : ""
              }
              innerRadius="45%"
              outerRadius="70%"
              fill="hsl(var(--chart-1))"
              dataKey="value"
              strokeWidth={2}
              stroke="hsl(var(--card))"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || donutColors[index % donutColors.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value} Dokumente`}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ANALYTICS CHARTS GRID (Container für alle Charts)
// =============================================================================

interface AnalyticsChartsProps {
  monthlyInvoices: MonthlyInvoiceData[];
  capitalDevelopment: CapitalDevelopmentData[];
  documentsByType: DocumentsByTypeData[];
  isLoading?: boolean;
  className?: string;
}

export function AnalyticsCharts({
  monthlyInvoices,
  capitalDevelopment,
  documentsByType,
  isLoading = false,
  className,
}: AnalyticsChartsProps) {
  return (
    <div className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-3", className)}>
      <MonthlyInvoicesChart data={monthlyInvoices} isLoading={isLoading} />
      <CapitalDevelopmentChart data={capitalDevelopment} isLoading={isLoading} />
      <DocumentsByTypeChart data={documentsByType} isLoading={isLoading} />
    </div>
  );
}

// =============================================================================
// CHART SKELETON
// =============================================================================

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-60" />
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1">
        <Skeleton className="h-full w-full min-h-[150px]" />
      </CardContent>
    </Card>
  );
}

export function AnalyticsChartsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <ChartSkeleton />
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  );
}
