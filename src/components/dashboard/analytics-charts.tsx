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
// CHART COLORS
// =============================================================================

const CHART_COLORS = {
  primary: "#3b82f6",
  secondary: "#22c55e",
  tertiary: "#f59e0b",
  muted: "#94a3b8",
};

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
        <CardTitle className="text-base">Rechnungen pro Monat</CardTitle>
        <CardDescription className="text-xs">Erstellt vs. Bezahlt (letzte 6 Monate)</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              className="text-muted-foreground"
              width={40}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelClassName="font-medium"
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar
              dataKey="invoiced"
              name="Erstellt"
              fill={CHART_COLORS.primary}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="paid"
              name="Bezahlt"
              fill={CHART_COLORS.secondary}
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
        <CardTitle className="text-base">Kapitalentwicklung</CardTitle>
        <CardDescription className="text-xs">Gesamtkapital der Gesellschaften (12 Monate)</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
              className="text-muted-foreground"
              width={45}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelClassName="font-medium"
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="capital"
              name="Kapital"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              dot={{ fill: CHART_COLORS.primary, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// DOCUMENTS BY TYPE CHART (Pie Chart)
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
        <CardTitle className="text-base">Dokumente nach Typ</CardTitle>
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
                percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ""
              }
              outerRadius="70%"
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value} Dokumente`}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ANALYTICS CHARTS GRID (Container fuer alle Charts)
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
