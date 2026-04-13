"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Wind,
  ArrowRight,
  Activity,
  Zap,
  Percent,
} from "lucide-react";
import type { PortalAnalyticsResponse } from "@/types/analytics";

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(err.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// Formatters
// =============================================================================

function fmtNum(value: number, decimals = 1): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// =============================================================================
// Helper Components
// =============================================================================

function TrendIcon({ indicator }: { indicator: "green" | "yellow" | "red" }) {
  if (indicator === "green") return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (indicator === "red") return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-yellow-600" />;
}

// =============================================================================
// Component
// =============================================================================

export function PortalEnergyAnalytics() {
  const t = useTranslations("portal.energyAnalytics");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const years = Array.from(
    { length: currentYear - 2017 },
    (_, i) => currentYear - i
  );

  const analyticsUrl = `/api/portal/energy-analytics?year=${selectedYear}`;
  const { data: response, error, isLoading } = useQuery<{ data: PortalAnalyticsResponse }>({
    queryKey: [analyticsUrl],
    queryFn: () => fetcher(analyticsUrl),
    refetchOnWindowFocus: false,
  });

  const analytics = response?.data;

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-[100px]" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-destructive">
          {t("errorLoading")}
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          {t("noData")}
        </CardContent>
      </Card>
    );
  }

  const { kpis, productionChart, availabilityTrend, turbineOverview, windSummary } = analytics;

  const trendColor = {
    green: "text-green-600",
    yellow: "text-yellow-600",
    red: "text-red-600",
  }[kpis.trendIndicator];

  const statusConfig = {
    good: { label: t("statusGood"), variant: "default" as const, className: "bg-green-100 text-green-800 hover:bg-green-100" },
    warning: { label: t("statusWarning"), variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" },
    poor: { label: t("statusPoor"), variant: "destructive" as const, className: "bg-red-100 text-red-800 hover:bg-red-100" },
  };

  return (
    <div className="space-y-6">
      {/* Year Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("year")}:</span>
        <Select
          value={String(selectedYear)}
          onValueChange={(v) => setSelectedYear(Number(v))}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("monthlyProduction")}</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.monthlyProductionMwh)} MWh</div>
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon indicator={kpis.trendIndicator} />
              <span>
                {t("previousYear", { value: fmtNum(kpis.previousYearMonthlyMwh) })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("capacityFactor")}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.capacityFactor)} %</div>
            <p className="text-xs text-muted-foreground">
              {t("capacityFactorDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("availability")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.availabilityPct)} %</div>
            <p className="text-xs text-muted-foreground">
              {t("availabilityDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("specificYield")}</CardTitle>
            <Wind className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtInt(kpis.specificYield)} kWh/kW</div>
            <p className="text-xs text-muted-foreground">
              {t("specificYieldDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Production Chart: Current Year vs Previous Year */}
      <Card>
        <CardHeader>
          <CardTitle>{t("productionTitle", { currentYear: selectedYear, previousYear: selectedYear - 1 })}</CardTitle>
          <CardDescription>
            {t("productionDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productionChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("noProductionData")}
            </p>
          ) : (
              <BarChart width="100%" height={320} data={productionChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis
                  tickFormatter={(v: number) => fmtInt(v / 1000)}
                  label={{ value: "MWh", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const num = typeof value === "number" ? value : 0;
                    return [
                      `${fmtInt(Math.round(num / 1000))} MWh`,
                      String(name ?? "") === "currentYear" ? String(selectedYear) : String(selectedYear - 1),
                    ];
                  }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === "currentYear" ? String(selectedYear) : String(selectedYear - 1)
                  }
                />
                <Bar dataKey="currentYear" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="previousYear" fill="#d1d5db" radius={[4, 4, 0, 0]} />
              </BarChart>
          )}
        </CardContent>
      </Card>

      {/* Availability Trend */}
      <Card>
        <CardHeader>
          <CardTitle>{t("availabilityTrendTitle", { year: selectedYear })}</CardTitle>
          <CardDescription>
            {t("availabilityTrendDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availabilityTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("noAvailabilityData")}
            </p>
          ) : (
              <LineChart width="100%" height={250} data={availabilityTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === "number" ? value : 0;
                    return [`${fmtNum(num, 2)} %`, t("availability")];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avgAvailability"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={t("availability")}
                />
              </LineChart>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Turbine Overview */}
        <Card>
          <CardHeader>
            <CardTitle>{t("turbineOverview")}</CardTitle>
            <CardDescription>{t("turbineOverviewDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {turbineOverview.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("noTurbineData")}
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colTurbine")}</TableHead>
                      <TableHead className="text-right">{t("colMwh")}</TableHead>
                      <TableHead className="text-right">{t("colAvailability")}</TableHead>
                      <TableHead className="text-right">{t("colStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turbineOverview.map((t) => {
                      const sc = statusConfig[t.status];
                      return (
                        <TableRow key={t.designation}>
                          <TableCell className="font-medium">{t.designation}</TableCell>
                          <TableCell className="text-right">{fmtNum(t.productionMwh)}</TableCell>
                          <TableCell className="text-right">{fmtNum(t.availabilityPct)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={sc.className}>{sc.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wind Summary + Link to Reports */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wind className="h-5 w-5" />
                {t("windSummary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("avgWindSpeed")}</p>
                  <p className="text-2xl font-bold">
                    {fmtNum(windSummary.avgWindSpeed)} m/s
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("dominantDirection")}</p>
                  <p className="text-2xl font-bold">{windSummary.dominantDirection}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("detailedReports")}</CardTitle>
              <CardDescription>
                {t("detailedReportsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/portal/energy-reports">
                  {t("showEnergyReports")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
