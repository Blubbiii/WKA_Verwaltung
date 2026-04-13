"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
// SHARED: Chart colors — driven by CSS variables (auto-adapt to theme)
// =============================================================================

function useChartColors() {
  return {
    primary: "hsl(var(--chart-1))",
    secondary: "hsl(var(--chart-3))",
    tertiary: "hsl(var(--chart-2))",
    destructive: "hsl(var(--chart-5))",
    muted: "hsl(var(--muted-foreground))",
    grid: "hsl(var(--border))",
    text: "hsl(var(--muted-foreground))",
    tooltipBg: "hsl(var(--card))",
    tooltipBorder: "hsl(var(--border))",
  };
}

// =============================================================================
// SHARED: Data fetching hook (widget-local)
// =============================================================================

function useEnergyData() {
  const t = useTranslations("dashboard.widgets");
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
        setError(t("dataNotAvailable"));
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

// =============================================================================
// KPI: Energy Yield
// =============================================================================

export function EnergyYieldKPI({ className }: { className?: string }) {
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const { totalMwh, yoyChange } = data.energyYield;

  return (
    // Use container query to scale icon + value on wider placements
    <div className={cn("flex items-start gap-3 @md:gap-4", className)}>
      <Zap className="h-8 w-8 @md:h-10 @md:w-10 text-lime-500/40 dark:text-lime-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl @md:text-3xl font-bold text-lime-600 dark:text-lime-400 truncate">
          {totalMwh > 1000 ? `${(totalMwh / 1000).toFixed(1)} GWh` : `${totalMwh.toFixed(0)} MWh`}
        </p>
        <p className="text-xs @md:text-sm text-muted-foreground mt-0.5">{t("production", { year: new Date().getFullYear() })}</p>
        {yoyChange !== 0 && (
          <p className={cn("text-xs @md:text-sm mt-1", yoyChange > 0 ? "text-green-600" : "text-red-600")}>
            {t("vsLastYear", { sign: yoyChange > 0 ? "+" : "", pct: yoyChange.toFixed(1) })}
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
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const pct = data.availability.avgPercent;
  const isGood = pct >= 95;

  return (
    <div className={cn("flex items-start gap-3 @md:gap-4", className)}>
      <Activity className="h-8 w-8 @md:h-10 @md:w-10 text-blue-500/40 dark:text-blue-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className={cn("text-2xl @md:text-3xl font-bold truncate", isGood ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400")}>
          {pct > 0 ? `${pct.toFixed(1)} %` : "–"}
        </p>
        <p className="text-xs @md:text-sm text-muted-foreground mt-0.5">{t("avgAvailability")}</p>
        {pct > 0 && (
          <p className={cn("text-xs @md:text-sm mt-1", isGood ? "text-green-600" : "text-amber-600")}>
            {isGood ? t("inTargetRange") : t("underTarget")}
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
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const avgMs = data.windSpeed.avgMs;

  return (
    <div className={cn("flex items-start gap-3 @md:gap-4", className)}>
      <Wind className="h-8 w-8 @md:h-10 @md:w-10 text-sky-500/40 dark:text-sky-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl @md:text-3xl font-bold text-sky-600 dark:text-sky-400 truncate">
          {avgMs > 0 ? `${avgMs.toFixed(1)} m/s` : "–"}
        </p>
        <p className="text-xs @md:text-sm text-muted-foreground mt-0.5">{t("avgWindSpeed")}</p>
        {avgMs > 0 && (
          <p className="text-xs @md:text-sm text-muted-foreground mt-1">
            {avgMs < 4 ? t("weakWind") : avgMs < 8 ? t("moderateWind") : t("strongWind")}
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
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();

  if (isLoading) return <KPILoading className={className} />;
  if (error || !data) return <KPIError message={error} className={className} />;

  const { totalEur, leaseCount } = data.leaseRevenue;

  return (
    <div className={cn("flex items-start gap-3 @md:gap-4", className)}>
      <Landmark className="h-8 w-8 @md:h-10 @md:w-10 text-rose-500/40 dark:text-rose-400/30 shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-2xl @md:text-3xl font-bold text-rose-600 dark:text-rose-400 truncate">
          {totalEur > 0 ? formatCurrency(totalEur) : "–"}
        </p>
        <p className="text-xs @md:text-sm text-muted-foreground mt-0.5">{t("revenueYear", { year: new Date().getFullYear() })}</p>
        {leaseCount > 0 && (
          <p className="text-xs @md:text-sm text-muted-foreground mt-1">
            {t("activeLeases", { count: leaseCount })}
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
  const t = useTranslations("dashboard.widgets");
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
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">{t("turbineStatus")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("noTurbines")}</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: t("statusOperational"), value: operational, color: colors.secondary },
    { name: t("statusMaintenance"), value: maintenance, color: colors.tertiary },
    { name: t("statusDisturbance"), value: fault, color: colors.destructive },
    { name: t("statusOffline"), value: offline, color: colors.muted },
  ].filter((d) => d.value > 0);

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          {t("turbineStatus")}
        </CardTitle>
        <CardDescription className="text-xs">{t("totalTurbines", { count: total })}</CardDescription>
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
              label={(props) => {
                const { name, percent = 0 } = props;
                return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : "";
              }}
              labelLine={false}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `${typeof value === "number" ? value : 0} ${t("turbinesUnit")}`}
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
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();
  const colors = useChartColors();

  if (isLoading) return <ChartLoading className={className} />;
  if (error || !data) return <ChartError message={error} className={className} />;

  const hasData = data.productionForecast.some((d) => d.actual > 0 || d.forecast > 0);

  if (!hasData) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">{t("productionVsForecast")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("noProductionData")}</p>
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
          {t("productionVsForecast")}
        </CardTitle>
        <CardDescription className="text-xs">{t("mwhPerMonth", { year: new Date().getFullYear() })}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.productionForecast} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.text }} />
            <YAxis tick={{ fontSize: 11, fill: colors.text }} width={45} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${typeof value === "number" ? value : 0} MWh`} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Line
              type="monotone"
              dataKey="actual"
              name={t("actual")}
              stroke={colors.primary}
              strokeWidth={2}
              dot={{ fill: colors.primary, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name={t("forecast")}
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
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useEnergyData();
  const colors = useChartColors();

  if (isLoading) return <ChartLoading className={className} />;
  if (error || !data) return <ChartError message={error} className={className} />;

  if (!data.revenueByPark.length) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">{t("revenueByPark")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("noRevenueData")}</p>
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
          {t("revenueByPark")}
        </CardTitle>
        <CardDescription className="text-xs">{t("revenueDistribution", { year: new Date().getFullYear() })}</CardDescription>
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
              formatter={(value) => formatCurrency(typeof value === "number" ? value : 0)}
            />
            <Bar dataKey="revenue" name={t("revenue")} fill={colors.primary} radius={[0, 4, 4, 0]} />
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
  const t = useTranslations("dashboard.widgets");
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
        <p className="text-sm text-muted-foreground">{error || t("noData")}</p>
      </div>
    );
  }

  if (!data.leaseOverview.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-2", className)}>
        <Landmark className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("noLeaseRelations")}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 space-y-1.5 overflow-auto">
        {data.leaseOverview.map((lease, i) => (
          // On wider containers (@md ≥ 28rem) show lessor + park side-by-side with amount
          <div key={i} className="flex items-center gap-2 @md:gap-4 py-1.5 px-1 text-xs @md:text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{lease.lessor}</p>
              <p className="text-muted-foreground truncate">{lease.park}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium">{formatCurrency(lease.amount)}</p>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] @md:text-xs px-1.5 py-0",
                  lease.status === "active" && "bg-green-500/10 text-green-700 dark:text-green-400",
                  lease.status === "pending" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  lease.status === "overdue" && "bg-red-500/10 text-red-700 dark:text-red-400"
                )}
              >
                {lease.status === "active" ? t("leaseActive") : lease.status === "pending" ? t("leasePending") : t("leaseOverdue")}
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
  const t = useTranslations("dashboard.widgets");
  return (
    <div className={cn("flex flex-col items-center justify-center h-full gap-1", className)}>
      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message || t("notAvailable")}</p>
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
  const t = useTranslations("dashboard.widgets");
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm text-muted-foreground">{t("errorTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{message || t("dataNotAvailable")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
