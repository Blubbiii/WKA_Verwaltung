"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Clock,
  Bell,
  Zap,
  Search,
  ChevronLeft,
  ChevronRight,
  List,
  Wind,
} from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type { FaultParetoItem, WarningTrendPoint } from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface FaultAnalysisProps {
  statePareto: FaultParetoItem[];
  warningTrend: WarningTrendPoint[];
  perTurbine: Array<{
    turbineId: string;
    designation: string;
    totalFaultDuration: number;
    totalFaultCount: number;
    productionLossEstimateKwh: number;
  }>;
  isLoading?: boolean;
  parkId?: string;
  year?: number;
}

// --- Event types ---

interface StateEvent {
  id: string;
  timestamp: string;
  state: number;
  subState: number;
  isFault: boolean;
  isService: boolean;
  windSpeed: number | null;
  turbineDesignation: string;
  description: string | null;
  parentLabel: string | null;
  label: string;
}

// =============================================================================
// Formatters
// =============================================================================

const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// =============================================================================
// Tooltips
// =============================================================================

interface TPayload { name: string; value: number; color: string; dataKey: string }

function ParetoTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "percentage");
  const line = payload.find((p) => p.dataKey === "cumulative");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Anteil: {dec2Fmt.format(bar.value)} %</p>}
      {line && <p className="text-sm text-muted-foreground">Kumulativ: {dec2Fmt.format(line.value)} %</p>}
    </div>
  );
}

function WarningTrendTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const freq = payload.find((p) => p.dataKey === "totalFrequency");
  const dur = payload.find((p) => p.dataKey === "durationHours");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {freq && <p className="text-sm">Warnungen: {numFmt.format(freq.value)}</p>}
      {dur && <p className="text-sm text-muted-foreground">Dauer: {dec1Fmt.format(dur.value)} h</p>}
    </div>
  );
}

function TurbineFaultTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "faultHours");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Störungszeit: {dec1Fmt.format(bar.value)} h</p>}
    </div>
  );
}

interface ScatterPayloadItem {
  payload: {
    designation: string;
    totalFaultCount: number;
    lossMwh: number;
  };
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: ScatterPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{d.designation}</p>
      <p className="text-sm">Störungen: {numFmt.format(d.totalFaultCount)}</p>
      <p className="text-sm text-muted-foreground">Produktionsverlust: {dec1Fmt.format(d.lossMwh)} MWh</p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function FaultAnalysis({
  statePareto,
  warningTrend,
  perTurbine,
  isLoading,
  parkId,
  year,
}: FaultAnalysisProps) {
  // --- Event table state ---
  const [events, setEvents] = useState<StateEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsTotalPages, setEventsTotalPages] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsSearch, setEventsSearch] = useState("");
  const [eventsSearchApplied, setEventsSearchApplied] = useState("");
  const [eventsFaultOnly, setEventsFaultOnly] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set("year", String(year));
      if (parkId && parkId !== "all") params.set("parkId", parkId);
      params.set("page", String(eventsPage));
      params.set("pageSize", "50");
      if (eventsFaultOnly) params.set("faultOnly", "true");
      if (eventsSearchApplied) params.set("search", eventsSearchApplied);

      const res = await fetch(`/api/energy/analytics/faults/events?${params}`);
      if (!res.ok) throw new Error("Fehler");
      const json = await res.json();
      setEvents(json.events || []);
      setEventsTotal(json.total || 0);
      setEventsTotalPages(json.totalPages || 0);
    } catch {
      setEvents([]);
      setEventsTotal(0);
    } finally {
      setEventsLoading(false);
    }
  }, [year, parkId, eventsPage, eventsFaultOnly, eventsSearchApplied]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Reset page when filters change
  useEffect(() => {
    setEventsPage(1);
  }, [eventsSearchApplied, eventsFaultOnly, parkId, year]);

  // Compute KPI values
  const kpiData = useMemo(() => {
    const uniqueStates = statePareto.length;
    const totalFaultDurationSec = perTurbine.reduce((s, t) => s + t.totalFaultDuration, 0);
    const totalFaultHours = totalFaultDurationSec / 3600;

    const totalWarningFrequency = warningTrend.reduce((s, w) => s + w.totalFrequency, 0);
    const monthCount = warningTrend.length || 1;
    const avgWarningsPerMonth = totalWarningFrequency / monthCount;

    const totalLossKwh = perTurbine.reduce((s, t) => s + t.productionLossEstimateKwh, 0);
    const totalLossMwh = totalLossKwh / 1000;

    return { uniqueStates, totalFaultHours, avgWarningsPerMonth, totalLossMwh };
  }, [statePareto, warningTrend, perTurbine]);

  const kpis = useMemo(() => [
    {
      title: "Störungscodes",
      value: numFmt.format(kpiData.uniqueStates),
      icon: AlertTriangle,
      description: "Verschiedene Zustaende",
    },
    {
      title: "Gesamte Störungszeit",
      value: numFmt.format(Math.round(kpiData.totalFaultHours)) + " h",
      icon: Clock,
      description: "Alle Anlagen",
    },
    {
      title: "Warnungen/Monat",
      value: dec1Fmt.format(kpiData.avgWarningsPerMonth),
      icon: Bell,
      description: "Durchschnittliche Haeufigkeit",
    },
    {
      title: "Geschaetzter Produktionsverlust",
      value: dec1Fmt.format(kpiData.totalLossMwh) + " MWh",
      icon: Zap,
      description: "Durch Störungen",
    },
  ], [kpiData]);

  // Warning trend data with duration in hours
  const warningTrendData = useMemo(
    () => warningTrend.map((w) => ({
      label: w.label,
      totalFrequency: w.totalFrequency,
      durationHours: w.totalDurationSeconds / 3600,
    })),
    [warningTrend]
  );

  // Per-turbine data sorted by fault duration desc
  const turbineFaultData = useMemo(
    () => [...perTurbine]
      .sort((a, b) => b.totalFaultDuration - a.totalFaultDuration)
      .map((t) => ({
        designation: t.designation,
        faultHours: t.totalFaultDuration / 3600,
      })),
    [perTurbine]
  );

  // Scatter data: fault count vs production loss (MWh)
  const scatterData = useMemo(
    () => perTurbine.map((t) => ({
      designation: t.designation,
      totalFaultCount: t.totalFaultCount,
      lossMwh: t.productionLossEstimateKwh / 1000,
    })),
    [perTurbine]
  );

  if (statePareto.length === 0 && perTurbine.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p>Keine Störungsdaten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Row: Pareto + Warning Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Störungen-Pareto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Störungen-Pareto (Top 20 Zustaende)</CardTitle>
          </CardHeader>
          <CardContent>
            {statePareto.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={statePareto} margin={{ left: 0, right: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis
                    yAxisId="pct"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, (max: number) => Math.ceil(max * 1.1)]}
                  />
                  <YAxis
                    yAxisId="cum"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip content={<ParetoTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="pct"
                    dataKey="percentage"
                    name="Anteil"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="cum"
                    type="monotone"
                    dataKey="cumulative"
                    name="Kumulativ"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Störungen erfasst</p>
            )}
          </CardContent>
        </Card>

        {/* Warnungs-Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Warnungs-Trend (monatlich)</CardTitle>
          </CardHeader>
          <CardContent>
            {warningTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={warningTrendData} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="freq"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => numFmt.format(v)}
                  />
                  <YAxis
                    yAxisId="dur"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} h`}
                  />
                  <Tooltip content={<WarningTrendTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="freq"
                    dataKey="totalFrequency"
                    name="Warnungen (Anzahl)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="dur"
                    type="monotone"
                    dataKey="durationHours"
                    name="Dauer (Stunden)"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#8b5cf6" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Warnungsdaten vorhanden</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row: Turbine Fault Duration + Scatter */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Störungen pro Turbine (horizontal bar) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Störungszeit pro Anlage</CardTitle>
          </CardHeader>
          <CardContent>
            {turbineFaultData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(250, turbineFaultData.length * 35 + 60)}>
                <BarChart data={turbineFaultData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} h`}
                  />
                  <YAxis
                    type="category"
                    dataKey="designation"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip content={<TurbineFaultTooltip />} />
                  <Bar
                    dataKey="faultHours"
                    name="Störungszeit"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Störungsdaten pro Anlage</p>
            )}
          </CardContent>
        </Card>

        {/* Scatter: Fault Count vs Production Loss */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Störungen vs. Produktionsverlust</CardTitle>
          </CardHeader>
          <CardContent>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ left: 10, right: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    dataKey="totalFaultCount"
                    name="Störungen"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "Störungen (Anzahl)", position: "insideBottom", offset: -5, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="lossMwh"
                    name="Produktionsverlust"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${dec1Fmt.format(v)}`}
                    label={{ value: "Verlust (MWh)", angle: -90, position: "insideLeft", offset: 0, fontSize: 11 }}
                  />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter name="Anlagen" data={scatterData}>
                    {scatterData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#ef4444" fillOpacity={0.7} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Daten für Scatter-Chart</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <List className="h-4 w-4" />
              Störungsereignisse
              {eventsTotal > 0 && (
                <span className="text-muted-foreground font-normal">
                  ({numFmt.format(eventsTotal)})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Input
                placeholder="Code oder Beschreibung suchen..."
                value={eventsSearch}
                onChange={(e) => setEventsSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEventsSearchApplied(eventsSearch);
                }}
                className="h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setEventsSearchApplied(eventsSearch)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              variant={eventsFaultOnly ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setEventsFaultOnly(!eventsFaultOnly)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Nur Störungen
            </Button>
            {(eventsSearchApplied || eventsFaultOnly) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setEventsSearch("");
                  setEventsSearchApplied("");
                  setEventsFaultOnly(false);
                }}
              >
                Filter zurücksetzen
              </Button>
            )}
          </div>

          {/* Table */}
          {eventsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Ereignisse gefunden
            </p>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Zeitpunkt</TableHead>
                      <TableHead className="w-[100px]">Anlage</TableHead>
                      <TableHead className="w-[80px]">Code</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="w-[70px] text-center">Typ</TableHead>
                      <TableHead className="w-[80px] text-right">
                        <span className="inline-flex items-center gap-1">
                          <Wind className="h-3 w-3" /> m/s
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(event.timestamp).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {event.turbineDesignation}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.state}.{event.subState}
                        </TableCell>
                        <TableCell className="text-sm">
                          {event.description ? (
                            <span>
                              {event.parentLabel && (
                                <span className="text-muted-foreground">
                                  {event.parentLabel} —{" "}
                                </span>
                              )}
                              {event.description}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {event.isFault ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Störung
                            </Badge>
                          ) : event.isService ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Service
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Status
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {event.windSpeed != null
                            ? dec1Fmt.format(event.windSpeed)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {eventsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground">
                    Seite {eventsPage} von {eventsTotalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={eventsPage <= 1}
                      onClick={() => setEventsPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={eventsPage >= eventsTotalPages}
                      onClick={() => setEventsPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
