"use client";

import { useState, useEffect } from "react";
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
// THEME-AWARE CHART COLORS
// =============================================================================

const LIGHT_COLORS = {
  primary: "#3b82f6",
  secondary: "#22c55e",
  tertiary: "#f59e0b",
  muted: "#94a3b8",
  grid: "#e2e8f0",
  text: "#64748b",
  tooltipBg: "hsl(var(--card))",
  tooltipBorder: "hsl(var(--border))",
};

const DARK_COLORS = {
  primary: "#60a5fa",
  secondary: "#4ade80",
  tertiary: "#fbbf24",
  muted: "#64748b",
  grid: "#1e293b",
  text: "#94a3b8",
  tooltipBg: "hsl(var(--card))",
  tooltipBorder: "hsl(var(--border))",
};

// Vibrant donut/pie colors for both themes
const DONUT_COLORS_LIGHT = [
  "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

const DONUT_COLORS_DARK = [
  "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa", "#f87171",
  "#22d3ee", "#f472b6", "#2dd4bf", "#fb923c", "#818cf8",
];

function useChartColors() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();

    // Listen for theme changes via MutationObserver on <html> class
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

function useDonutColors() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT;
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
              fill="#8884d8"
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
