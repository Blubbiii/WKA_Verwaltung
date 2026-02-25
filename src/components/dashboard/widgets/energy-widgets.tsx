"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Zap,
  Activity,
  Wind,
  Landmark,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { EnergyDashboardData } from "@/hooks/useEnergyDashboard";

// =============================================================================
// SHARED: Theme-aware colors (reuse pattern from analytics-charts)
// =============================================================================

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return {
    primary: isDark ? "#2dd4bf" : "#0d9488",
    secondary: isDark ? "#4ade80" : "#22c55e",
    tertiary: isDark ? "#fbbf24" : "#f59e0b",
    destructive: isDark ? "#f87171" : "#ef4444",
    muted: isDark ? "#64748b" : "#94a3b8",
    grid: isDark ? "#1e293b" : "#e2e8f0",
    text: isDark ? "#94a3b8" : "#64748b",
    tooltipBg: "hsl(var(--card))",
    tooltipBorder: "hsl(var(--border))",
  };
}

// =============================================================================
// SHARED: Data fetching hook (widget-local)
// =============================================================================

function useEnergyData() {
  const [data, setData] = useState<EnergyDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/dashboard/energy-kpis");
      if (response.ok) {
        setData(await response.json());
        setError(null);
      } else {
        setError("Daten nicht verfügbar");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

// =============================================================================
// KPI: Energy Yield
// =============================================================================

export function EnergyYieldKPI({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const { totalMwh, yoyChange } = data.energyYield;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Zap className="h-8 w-8 text-lime-500/40 dark:text-lime-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl font-bold text-lime-600 dark:text-lime-400 truncate">
          {totalMwh > 1000 ? `${(totalMwh / 1000).toFixed(1)} GWh` : `${totalMwh.toFixed(0)} MWh`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Produktion {new Date().getFullYear()}</p>
        {yoyChange !== 0 && (
          <p className={cn("text-xs mt-1", yoyChange > 0 ? "text-green-600" : "text-red-600")}>
            {yoyChange > 0 ? "+" : ""}{yoyChange.toFixed(1)}% vs. Vorjahr
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// KPI: Availability
// =============================================================================

export function AvailabilityKPI({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const pct = data.availability.avgPercent;
  const isGood = pct >= 95;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Activity className="h-8 w-8 text-teal-500/40 dark:text-teal-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold truncate", isGood ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400")}>
          {pct > 0 ? `${pct.toFixed(1)} %` : "–"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Durchschnittliche Verfügbarkeit</p>
        {pct > 0 && (
          <p className={cn("text-xs mt-1", isGood ? "text-green-600" : "text-amber-600")}>
            {isGood ? "Im Zielbereich" : "Unter Zielwert (95%)"}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// KPI: Wind Speed
// =============================================================================

export function WindSpeedKPI({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const avgMs = data.windSpeed.avgMs;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Wind className="h-8 w-8 text-sky-500/40 dark:text-sky-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 truncate">
          {avgMs > 0 ? `${avgMs.toFixed(1)} m/s` : "–"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Mittlere Windgeschwindigkeit</p>
        {avgMs > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {avgMs < 4 ? "Schwacher Wind" : avgMs < 8 ? "Moderater Wind" : "Starker Wind"}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// KPI: Lease Revenue
// =============================================================================

export function LeaseRevenueKPI({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const { totalEur, leaseCount } = data.leaseRevenue;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Landmark className="h-8 w-8 text-rose-500/40 dark:text-rose-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 truncate">
          {totalEur > 0 ? formatCurrency(totalEur) : "–"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Erlöse {new Date().getFullYear()}</p>
        {leaseCount > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {leaseCount} aktive Pachtverträge
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CHART: Turbine Status Donut
// =============================================================================

export function TurbineStatusChart({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();
  const colors = useChartColors();

  if (isLoading) return <ChartLoading className={className} />;
  if (error || !data) return <ChartError message={error} className={className} />;

  const { operational, maintenance, fault, offline } = data.turbineStatus;
  const total = operational + maintenance + fault + offline;

  if (total === 0) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">Turbinen-Status</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Turbinen vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: "Betrieb", value: operational, color: colors.secondary },
    { name: "Wartung", value: maintenance, color: colors.tertiary },
    { name: "Störung", value: fault, color: colors.destructive },
    { name: "Offline", value: offline, color: colors.muted },
  ].filter((d) => d.value > 0);

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Turbinen-Status
        </CardTitle>
        <CardDescription className="text-xs">{total} Turbinen gesamt</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="70%"
              dataKey="value"
              strokeWidth={2}
              stroke="hsl(var(--card))"
              label={({ name, percent }) =>
                percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
              }
              labelLine={false}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value} Turbinen`}
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: "0.5rem",
                fontSize: "12px",
                color: "hsl(var(--foreground))",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CHART: Production vs Forecast
// =============================================================================

export function ProductionForecastChart({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();
  const colors = useChartColors();

  if (isLoading) return <ChartLoading className={className} />;
  if (error || !data) return <ChartError message={error} className={className} />;

  const hasData = data.productionForecast.some((d) => d.actual > 0 || d.forecast > 0);

  if (!hasData) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">Produktion vs. Prognose</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Produktionsdaten vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: "0.5rem",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  };

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Produktion vs. Prognose
        </CardTitle>
        <CardDescription className="text-xs">MWh pro Monat ({new Date().getFullYear()})</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.productionForecast} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.text }} />
            <YAxis tick={{ fontSize: 11, fill: colors.text }} width={45} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `${value} MWh`} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Line
              type="monotone"
              dataKey="actual"
              name="Ist"
              stroke={colors.primary}
              strokeWidth={2}
              dot={{ fill: colors.primary, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Prognose"
              stroke={colors.tertiary}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// CHART: Revenue by Park
// =============================================================================

export function RevenueByParkChart({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();
  const colors = useChartColors();

  if (isLoading) return <ChartLoading className={className} />;
  if (error || !data) return <ChartError message={error} className={className} />;

  if (!data.revenueByPark.length) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">Erlöse nach Park</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Keine Erlösdaten vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: "0.5rem",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  };

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          Erlöse nach Park
        </CardTitle>
        <CardDescription className="text-xs">Erlösverteilung {new Date().getFullYear()}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.revenueByPark} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.text }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: colors.text }}
              width={80}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Bar dataKey="revenue" name="Erlös" fill={colors.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// LIST: Lease Overview
// =============================================================================

export function LeaseOverviewWidget({ className }: { className?: string }) {
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-2", className)}>
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error || "Keine Daten"}</p>
      </div>
    );
  }

  if (!data.leaseOverview.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-2", className)}>
        <Landmark className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Keine Pachtverhältnisse</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 space-y-1.5 overflow-auto">
        {data.leaseOverview.map((lease, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 px-1 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{lease.lessor}</p>
              <p className="text-muted-foreground truncate">{lease.park}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium">{formatCurrency(lease.amount)}</p>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  lease.status === "active" && "bg-green-500/10 text-green-700 dark:text-green-400",
                  lease.status === "pending" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  lease.status === "overdue" && "bg-red-500/10 text-red-700 dark:text-red-400"
                )}
              >
                {lease.status === "active" ? "Aktiv" : lease.status === "pending" ? "Ausstehend" : "Überfällig"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// SHARED LOADING / ERROR STATES
// =============================================================================

function KPILoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center h-full", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function KPIError({ message, className }: { message?: string | null; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full gap-1", className)}>
      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message || "Nicht verfügbar"}</p>
    </div>
  );
}

function ChartLoading({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <div className="h-3 w-32 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function ChartError({ message, className }: { message?: string | null; className?: string }) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm text-muted-foreground">Fehler</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{message || "Daten nicht verfügbar"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
