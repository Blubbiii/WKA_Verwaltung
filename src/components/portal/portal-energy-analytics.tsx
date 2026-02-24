"use client";

import { useState } from "react";
import useSWR from "swr";
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
  ResponsiveContainer,
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
// Component
// =============================================================================

export function PortalEnergyAnalytics() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const years = Array.from(
    { length: currentYear - 2017 },
    (_, i) => currentYear - i
  );

  const { data: response, error, isLoading } = useSWR<{ data: PortalAnalyticsResponse }>(
    `/api/portal/energy-analytics?year=${selectedYear}`,
    fetcher,
    { revalidateOnFocus: false }
  );

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
          Fehler beim Laden der Anlagen-Performance
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Keine Daten verfügbar
        </CardContent>
      </Card>
    );
  }

  const { kpis, productionChart, availabilityTrend, turbineOverview, windSummary } = analytics;

  // Trend icon helper
  const TrendIcon = ({ indicator }: { indicator: "green" | "yellow" | "red" }) => {
    if (indicator === "green") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (indicator === "red") return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-yellow-600" />;
  };

  const trendColor = {
    green: "text-green-600",
    yellow: "text-yellow-600",
    red: "text-red-600",
  }[kpis.trendIndicator];

  const statusConfig = {
    good: { label: "Gut", variant: "default" as const, className: "bg-green-100 text-green-800 hover:bg-green-100" },
    warning: { label: "Mittel", variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" },
    poor: { label: "Schwach", variant: "destructive" as const, className: "bg-red-100 text-red-800 hover:bg-red-100" },
  };

  return (
    <div className="space-y-6">
      {/* Year Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Jahr:</span>
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
            <CardTitle className="text-sm font-medium">Monatsproduktion</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.monthlyProductionMwh)} MWh</div>
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon indicator={kpis.trendIndicator} />
              <span>
                Vorjahr: {fmtNum(kpis.previousYearMonthlyMwh)} MWh
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capacity Factor</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.capacityFactor)} %</div>
            <p className="text-xs text-muted-foreground">
              Auslastung der Nennleistung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verfügbarkeit</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtNum(kpis.availabilityPct)} %</div>
            <p className="text-xs text-muted-foreground">
              Technische Verfügbarkeit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Specific Yield</CardTitle>
            <Wind className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtInt(kpis.specificYield)} kWh/kW</div>
            <p className="text-xs text-muted-foreground">
              Produktion pro installiertem kW
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Production Chart: Current Year vs Previous Year */}
      <Card>
        <CardHeader>
          <CardTitle>Produktion: {selectedYear} vs. {selectedYear - 1}</CardTitle>
          <CardDescription>
            Monatliche Stromproduktion im Jahresvergleich (kWh)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productionChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Produktionsdaten verfügbar
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={productionChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis
                  tickFormatter={(v: number) => fmtInt(v / 1000)}
                  label={{ value: "MWh", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${fmtInt(Math.round(value / 1000))} MWh`,
                    name === "currentYear" ? String(selectedYear) : String(selectedYear - 1),
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    value === "currentYear" ? String(selectedYear) : String(selectedYear - 1)
                  }
                />
                <Bar dataKey="currentYear" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="previousYear" fill="#d1d5db" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Availability Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Verfügbarkeits-Trend {selectedYear}</CardTitle>
          <CardDescription>
            Monatliche technische Verfügbarkeit (%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availabilityTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Verfügbarkeitsdaten vorhanden
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={availabilityTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  formatter={(value: number) => [`${fmtNum(value, 2)} %`, "Verfügbarkeit"]}
                />
                <Line
                  type="monotone"
                  dataKey="avgAvailability"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Verfügbarkeit"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Turbine Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Anlagen-Übersicht</CardTitle>
            <CardDescription>Status und Leistung der einzelnen Anlagen</CardDescription>
          </CardHeader>
          <CardContent>
            {turbineOverview.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Anlagendaten vorhanden
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anlage</TableHead>
                      <TableHead className="text-right">MWh</TableHead>
                      <TableHead className="text-right">Verf. %</TableHead>
                      <TableHead className="text-right">Status</TableHead>
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
                Wind-Zusammenfassung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Mittlere Windgeschwindigkeit</p>
                  <p className="text-2xl font-bold">
                    {fmtNum(windSummary.avgWindSpeed)} m/s
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vorherrschende Richtung</p>
                  <p className="text-2xl font-bold">{windSummary.dominantDirection}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detaillierte Berichte</CardTitle>
              <CardDescription>
                Umfassende Auswertungen und konfigurierte Energieberichte
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/portal/energy-reports">
                  Energieberichte anzeigen
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
