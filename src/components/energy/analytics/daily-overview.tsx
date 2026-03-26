"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Zap,
  Wind,
  AlertTriangle,
  TrendingUp,
  Euro,
  Loader2,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleSection } from "@/components/energy/analytics/collapsible-section";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DailyOverviewResponse } from "@/types/analytics";

// =============================================================================
// Helpers
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fehler beim Laden");
  return res.json();
};

function formatKwh(kwh: number): string {
  if (kwh >= 1_000_000) return `${(kwh / 1_000_000).toFixed(1)} GWh`;
  if (kwh >= 1_000) return `${(kwh / 1_000).toFixed(1)} MWh`;
  return `${kwh.toFixed(0)} kWh`;
}

function formatEur(eur: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Preset = "today" | "7d" | "30d" | "month" | "last-month";

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = toLocalDate(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: toLocalDate(d), to: today };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: toLocalDate(d), to: today };
    }
    case "month":
      return {
        from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        to: today,
      };
    case "last-month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toLocalDate(d), to: toLocalDate(end) };
    }
  }
}

const PRESET_LABELS: Record<Preset, string> = {
  today: "Heute",
  "7d": "7 Tage",
  "30d": "30 Tage",
  month: "Akt. Monat",
  "last-month": "Letzter Monat",
};

// =============================================================================
// Parks Hook
// =============================================================================

interface Park {
  id: string;
  name: string;
}

function useParks() {
  const [parks, setParks] = useState<Park[]>([]);
  useEffect(() => {
    fetch("/api/parks")
      .then((res) => res.json())
      .then((data) => setParks(Array.isArray(data) ? data : data.data || []))
      .catch(() => setParks([]));
  }, []);
  return parks;
}

// =============================================================================
// Component
// =============================================================================

export function DailyOverview() {
  const parks = useParks();

  // Filter state
  const [activePreset, setActivePreset] = useState<Preset | undefined>("30d");
  const [from, setFrom] = useState(() => getPresetRange("30d").from);
  const [to, setTo] = useState(() => getPresetRange("30d").to);
  const [parkId, setParkId] = useState("all");

  function applyPreset(preset: Preset) {
    setActivePreset(preset);
    const range = getPresetRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }

  // Build query key
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (parkId !== "all") params.set("parkId", parkId);
    return `/api/energy/analytics/daily-overview?${params}`;
  }, [from, to, parkId]);

  const { data, error, isLoading } = useQuery<DailyOverviewResponse, Error>({
    queryKey: [queryUrl],
    queryFn: () => fetcher(queryUrl),
    refetchOnWindowFocus: false,
  });

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {/* Presets */}
          <div className="flex gap-1">
            {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
              <Button
                key={p}
                variant={activePreset === p ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(p)}
              >
                {PRESET_LABELS[p]}
              </Button>
            ))}
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Custom range */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Von:</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setActivePreset(undefined);
              }}
              className="w-[140px] h-8"
            />
            <span className="text-sm text-muted-foreground">Bis:</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setActivePreset(undefined);
              }}
              className="w-[140px] h-8"
            />
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Park filter */}
          <Select value={parkId} onValueChange={setParkId}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Alle Parks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Parks</SelectItem>
              {parks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-[200px] text-destructive">
          Fehler beim Laden der Daten
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <KpiCard
              title="Produktion"
              value={kpis ? formatKwh(kpis.totalProductionKwh) : "–"}
              icon={Zap}
              color="text-blue-500"
            />
            <KpiCard
              title="Verfügbarkeit"
              value={
                kpis?.avgAvailabilityPct != null
                  ? `${kpis.avgAvailabilityPct.toFixed(1)} %`
                  : "–"
              }
              icon={Activity}
              color={
                kpis?.avgAvailabilityPct != null && kpis.avgAvailabilityPct < 80
                  ? "text-red-500"
                  : kpis?.avgAvailabilityPct != null && kpis.avgAvailabilityPct < 90
                  ? "text-amber-500"
                  : "text-green-500"
              }
              valueColor={
                kpis?.avgAvailabilityPct != null && kpis.avgAvailabilityPct < 80
                  ? "text-red-600 dark:text-red-400"
                  : kpis?.avgAvailabilityPct != null && kpis.avgAvailabilityPct < 90
                  ? "text-amber-600 dark:text-amber-400"
                  : undefined
              }
            />
            <KpiCard
              title="Störungen"
              value={String(kpis?.activeFaults ?? 0)}
              icon={AlertTriangle}
              color={
                (kpis?.activeFaults ?? 0) > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            />
            <KpiCard
              title="Ø Wind"
              value={
                kpis?.avgWindSpeed != null
                  ? `${kpis.avgWindSpeed.toFixed(1)} m/s`
                  : "–"
              }
              icon={Wind}
              color="text-amber-500"
            />
            <KpiCard
              title="Umsatz"
              value={
                kpis?.totalRevenueEur != null
                  ? formatEur(kpis.totalRevenueEur)
                  : "–"
              }
              icon={Euro}
              color="text-emerald-500"
            />
          </div>

          {/* Daily Production + Wind Chart */}
          <CollapsibleSection
            title="Produktion & Wind"
            icon={TrendingUp}
            defaultOpen
          >
            {data && data.dailyChart.length > 0 ? (
              <div className="h-[350px]">
                  <ComposedChart width="100%" height={350} data={data.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getDate()}.${d.getMonth() + 1}.`;
                      }}
                      fontSize={12}
                    />
                    <YAxis
                      yAxisId="kwh"
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                      fontSize={12}
                      label={{
                        value: "kWh",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "var(--primary)" },
                      }}
                    />
                    <YAxis
                      yAxisId="wind"
                      orientation="right"
                      fontSize={12}
                      label={{
                        value: "m/s",
                        angle: 90,
                        position: "insideRight",
                        style: { fontSize: 11, fill: "#f59e0b" },
                      }}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const num = typeof value === "number" ? value : 0;
                        const key = String(name ?? "");
                        return [
                          key === "productionKwh" ? formatKwh(num) : `${num.toFixed(1)} m/s`,
                          key === "productionKwh" ? "Produktion" : "Wind",
                        ];
                      }}
                      labelFormatter={(v) => {
                        const d = new Date(v);
                        return d.toLocaleDateString("de-DE");
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "productionKwh" ? "Produktion" : "Windgeschwindigkeit"
                      }
                    />
                    <Bar
                      yAxisId="kwh"
                      dataKey="productionKwh"
                      fill="var(--primary)"
                      opacity={0.7}
                      radius={[2, 2, 0, 0]}
                    />
                    <Line
                      yAxisId="wind"
                      dataKey="avgWindSpeed"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Keine Daten im gewählten Zeitraum
              </p>
            )}
          </CollapsibleSection>

          {/* Active Faults */}
          <CollapsibleSection
            title="Störungen"
            icon={AlertTriangle}
            defaultOpen
          >
            {data && data.faults.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anlage</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Beginn</TableHead>
                    <TableHead>Dauer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.faults.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {f.turbineDesignation}
                      </TableCell>
                      <TableCell>{f.parkName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={f.endTime ? "secondary" : "destructive"}
                        >
                          {f.stateText || `Code ${f.stateCode}`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(f.startTime).toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell>
                        {f.durationHours != null
                          ? `${f.durationHours} h`
                          : "laufend"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Keine Störungen im gewählten Zeitraum
              </p>
            )}
          </CollapsibleSection>

          {/* Turbine Status */}
          <CollapsibleSection
            title="Anlagen-Status"
            icon={LayoutDashboard}
            defaultOpen
          >
            {data && data.turbineStatus.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anlage</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead className="text-right">Produktion</TableHead>
                    <TableHead className="text-right">Verfügbarkeit</TableHead>
                    <TableHead className="text-right">Ø Wind</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.turbineStatus.map((t) => (
                    <TableRow
                      key={t.turbineId}
                      className={
                        t.hasActiveFault ? "bg-destructive/5" : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {t.designation}
                      </TableCell>
                      <TableCell>{t.parkName}</TableCell>
                      <TableCell className="text-right">
                        {formatKwh(t.productionKwh)}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.availabilityPct != null
                          ? `${t.availabilityPct.toFixed(1)} %`
                          : "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.avgWindSpeed != null
                          ? `${t.avgWindSpeed.toFixed(1)} m/s`
                          : "–"}
                      </TableCell>
                      <TableCell>
                        {t.hasActiveFault ? (
                          <Badge variant="destructive">Störung</Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Keine Anlagen gefunden
              </p>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

// =============================================================================
// KPI Card
// =============================================================================

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  valueColor,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color?: string;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
