"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  BarChart3,
  FileSpreadsheet,
  TrendingDown,
  Percent,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParks } from "@/hooks/useParks";
import { monthNames } from "@/hooks/useEnergySettlements";

// =============================================================================
// TYPES
// =============================================================================

interface ComparisonRow {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  month: number;
  scadaKwh: number | null;
  scadaDataPoints: number | null;
  scadaExpectedPoints: number | null;
  scadaCoverage: number | null;
  reportedKwh: number | null;
  reportedSource: string | null;
  deltaKwh: number | null;
  deltaPercent: number | null;
}

interface ComparisonSummary {
  totalScadaKwh: number;
  totalReportedKwh: number;
  totalDeltaKwh: number;
  totalDeltaPercent: number;
}

interface ComparisonResponse {
  data: ComparisonRow[];
  summary: ComparisonSummary;
}

interface TurbineAggregate {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  totalScadaKwh: number;
  totalReportedKwh: number;
  totalDeltaKwh: number;
  deltaPercent: number | null;
  monthsWithData: number;
}

interface ParkMonthAggregate {
  parkName: string;
  month: number;
  totalScadaKwh: number;
  totalReportedKwh: number;
  totalDeltaKwh: number;
  deltaPercent: number | null;
  turbineCount: number;
}

interface ParkTotalAggregate {
  parkName: string;
  totalScadaKwh: number;
  totalReportedKwh: number;
  totalDeltaKwh: number;
  deltaPercent: number | null;
  turbineCount: number;
  monthsWithData: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatKwh(kwh: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kwh);
}

function getDeltaColor(deltaPercent: number | null): string {
  if (deltaPercent === null) return "text-muted-foreground";
  const abs = Math.abs(deltaPercent);
  if (abs <= 2) return "text-green-600";
  if (abs <= 5) return "text-amber-600";
  return "text-red-600";
}

function getCoverageColor(coverage: number | null): string {
  if (coverage === null) return "text-muted-foreground";
  if (coverage >= 95) return "text-green-600";
  if (coverage >= 80) return "text-amber-600";
  return "text-red-600";
}

function getCoverageBgColor(coverage: number | null): string {
  if (coverage === null) return "bg-muted";
  if (coverage >= 95) return "bg-green-500";
  if (coverage >= 80) return "bg-amber-500";
  return "bg-red-500";
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DataComparisonTab() {
  // Filter state
  const [selectedParkId, setSelectedParkId] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [viewMode, setViewMode] = useState<string>("details");

  // Data fetching
  const { parks, isLoading: parksLoading } = useParks();

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("year", selectedYear.toString());
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    return params.toString();
  }, [selectedYear, selectedParkId]);

  const {
    data: comparisonData,
    error: comparisonError,
    isLoading: comparisonLoading,
  } = useSWR<ComparisonResponse>(
    `/api/energy/scada/comparison?${queryParams}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const rows = useMemo(() => comparisonData?.data ?? [], [comparisonData]);
  const summary = comparisonData?.summary ?? null;
  const isLoading = parksLoading || comparisonLoading;
  const isError = !!comparisonError;

  // Aggregate data by turbine for "Pro Anlage" view
  const turbineAggregates = useMemo((): TurbineAggregate[] => {
    if (!rows.length) return [];

    const map = new Map<string, TurbineAggregate>();

    for (const row of rows) {
      const existing = map.get(row.turbineId);
      if (existing) {
        existing.totalScadaKwh += row.scadaKwh ?? 0;
        existing.totalReportedKwh += row.reportedKwh ?? 0;
        existing.totalDeltaKwh += row.deltaKwh ?? 0;
        if (row.scadaKwh !== null || row.reportedKwh !== null) {
          existing.monthsWithData += 1;
        }
      } else {
        map.set(row.turbineId, {
          turbineId: row.turbineId,
          turbineDesignation: row.turbineDesignation,
          parkName: row.parkName,
          totalScadaKwh: row.scadaKwh ?? 0,
          totalReportedKwh: row.reportedKwh ?? 0,
          totalDeltaKwh: row.deltaKwh ?? 0,
          deltaPercent: null,
          monthsWithData: row.scadaKwh !== null || row.reportedKwh !== null ? 1 : 0,
        });
      }
    }

    // Calculate percentage after aggregation
    const result = Array.from(map.values());
    for (const agg of result) {
      if (agg.totalReportedKwh > 0) {
        agg.deltaPercent =
          ((agg.totalScadaKwh - agg.totalReportedKwh) / agg.totalReportedKwh) *
          100;
      } else if (agg.totalScadaKwh > 0) {
        agg.deltaPercent = 100;
      }
    }

    return result.sort((a, b) =>
      a.turbineDesignation.localeCompare(b.turbineDesignation)
    );
  }, [rows]);

  // Aggregate data by park + month for "Pro Park (Monat)" view
  const parkMonthAggregates = useMemo((): ParkMonthAggregate[] => {
    if (!rows.length) return [];

    const map = new Map<string, ParkMonthAggregate>();

    for (const row of rows) {
      const key = `${row.parkName}:${row.month}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalScadaKwh += row.scadaKwh ?? 0;
        existing.totalReportedKwh += row.reportedKwh ?? 0;
        existing.totalDeltaKwh += row.deltaKwh ?? 0;
        existing.turbineCount += 1;
      } else {
        map.set(key, {
          parkName: row.parkName,
          month: row.month,
          totalScadaKwh: row.scadaKwh ?? 0,
          totalReportedKwh: row.reportedKwh ?? 0,
          totalDeltaKwh: row.deltaKwh ?? 0,
          deltaPercent: null,
          turbineCount: 1,
        });
      }
    }

    const result = Array.from(map.values());
    for (const agg of result) {
      if (agg.totalReportedKwh > 0) {
        agg.deltaPercent =
          ((agg.totalScadaKwh - agg.totalReportedKwh) / agg.totalReportedKwh) *
          100;
      } else if (agg.totalScadaKwh > 0) {
        agg.deltaPercent = 100;
      }
    }

    return result.sort((a, b) => {
      const parkCmp = a.parkName.localeCompare(b.parkName);
      if (parkCmp !== 0) return parkCmp;
      return a.month - b.month;
    });
  }, [rows]);

  // Aggregate data by park total for "Pro Park (Gesamt)" view
  const parkTotalAggregates = useMemo((): ParkTotalAggregate[] => {
    if (!rows.length) return [];

    const map = new Map<string, ParkTotalAggregate & { turbineIds: Set<string> }>();

    for (const row of rows) {
      const existing = map.get(row.parkName);
      if (existing) {
        existing.totalScadaKwh += row.scadaKwh ?? 0;
        existing.totalReportedKwh += row.reportedKwh ?? 0;
        existing.totalDeltaKwh += row.deltaKwh ?? 0;
        existing.turbineIds.add(row.turbineId);
        if (row.scadaKwh !== null || row.reportedKwh !== null) {
          existing.monthsWithData += 1;
        }
      } else {
        map.set(row.parkName, {
          parkName: row.parkName,
          totalScadaKwh: row.scadaKwh ?? 0,
          totalReportedKwh: row.reportedKwh ?? 0,
          totalDeltaKwh: row.deltaKwh ?? 0,
          deltaPercent: null,
          turbineCount: 0,
          monthsWithData: row.scadaKwh !== null || row.reportedKwh !== null ? 1 : 0,
          turbineIds: new Set([row.turbineId]),
        });
      }
    }

    const result: ParkTotalAggregate[] = [];
    for (const entry of map.values()) {
      const { turbineIds, ...rest } = entry;
      rest.turbineCount = turbineIds.size;
      if (rest.totalReportedKwh > 0) {
        rest.deltaPercent =
          ((rest.totalScadaKwh - rest.totalReportedKwh) / rest.totalReportedKwh) *
          100;
      } else if (rest.totalScadaKwh > 0) {
        rest.deltaPercent = 100;
      }
      result.push(rest);
    }

    return result.sort((a, b) => a.parkName.localeCompare(b.parkName));
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-muted-foreground">
        Vergleich der SCADA-Messdaten mit den Netzbetreiber-Abrechnungsdaten
      </p>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* SCADA Produktion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              SCADA Produktion
            </CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {summary
                    ? `${formatKwh(summary.totalScadaKwh)} kWh`
                    : "- kWh"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Messdaten {selectedYear}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Gemeldete Produktion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Gemeldete Produktion
            </CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {summary
                    ? `${formatKwh(summary.totalReportedKwh)} kWh`
                    : "- kWh"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gemeldete Daten {selectedYear}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Abweichung (kWh) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abweichung</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div
                  className={`text-2xl font-bold ${
                    summary ? getDeltaColor(summary.totalDeltaPercent) : ""
                  }`}
                >
                  {summary
                    ? `${formatKwh(summary.totalDeltaKwh)} kWh`
                    : "- kWh"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Differenz SCADA vs. Gemeldet
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Abweichung (%) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abweichung %</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div
                  className={`text-2xl font-bold ${
                    summary ? getDeltaColor(summary.totalDeltaPercent) : ""
                  }`}
                >
                  {summary
                    ? `${summary.totalDeltaPercent >= 0 ? "+" : ""}${summary.totalDeltaPercent.toFixed(2)} %`
                    : "- %"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Prozentuale Abweichung
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Vergleichsdaten</CardTitle>
          <CardDescription>
            SCADA-Messdaten und Netzbetreiber-Abrechnungsdaten im Vergleich
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap mb-6">
            {/* Park Filter */}
            <Select
              value={selectedParkId}
              onValueChange={(value) => setSelectedParkId(value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Park waehlen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Parks</SelectItem>
                {parks?.map((park) => (
                  <SelectItem key={park.id} value={park.id}>
                    {park.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Year Filter */}
            <Select
              value={selectedYear.toString()}
              onValueChange={(value) => setSelectedYear(parseInt(value))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Jahr" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View Mode Tabs */}
            <Tabs
              value={viewMode}
              onValueChange={(value) => setViewMode(value)}
              className="flex-1"
            >
              <TabsList>
                <TabsTrigger value="details">Monatsdetails</TabsTrigger>
                <TabsTrigger value="turbine">Pro Anlage</TabsTrigger>
                <TabsTrigger value="park">Pro Park</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Monthly Details Table */}
          {viewMode === "details" && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anlage</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Monat</TableHead>
                    <TableHead className="text-right">SCADA (kWh)</TableHead>
                    <TableHead className="text-right">
                      Gemeldet (kWh)
                    </TableHead>
                    <TableHead className="text-right">
                      Abweichung (kWh)
                    </TableHead>
                    <TableHead className="text-right">Abw. (%)</TableHead>
                    <TableHead className="text-right">Abdeckung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <div className="text-destructive">
                          Fehler beim Laden der Vergleichsdaten
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <BarChart3 className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            Keine Vergleichsdaten vorhanden
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Importieren Sie SCADA-Daten, um den Vergleich zu
                            starten.
                          </p>
                          <Button variant="outline" size="sm" asChild>
                            <Link href="/energy/scada">
                              <Radio className="mr-2 h-4 w-4" />
                              Zur SCADA-Import & Verwaltung
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => (
                      <TableRow key={`${row.turbineId}-${row.month}-${index}`}>
                        <TableCell className="font-medium">
                          {row.turbineDesignation}
                        </TableCell>
                        <TableCell>{row.parkName}</TableCell>
                        <TableCell>
                          {monthNames[row.month] ?? `Monat ${row.month}`}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.scadaKwh !== null ? formatKwh(row.scadaKwh) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.reportedKwh !== null
                            ? formatKwh(row.reportedKwh)
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${getDeltaColor(
                            row.deltaPercent
                          )}`}
                        >
                          {row.deltaKwh !== null
                            ? formatKwh(row.deltaKwh)
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-medium ${getDeltaColor(
                            row.deltaPercent
                          )}`}
                        >
                          {row.deltaPercent !== null
                            ? `${row.deltaPercent >= 0 ? "+" : ""}${row.deltaPercent.toFixed(2)} %`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.scadaCoverage !== null ? (
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={`font-mono text-sm ${getCoverageColor(
                                  row.scadaCoverage
                                )}`}
                              >
                                {row.scadaCoverage.toFixed(1)} %
                              </span>
                              <div className="h-2 w-2 rounded-full flex-shrink-0">
                                <div
                                  className={`h-2 w-2 rounded-full ${getCoverageBgColor(
                                    row.scadaCoverage
                                  )}`}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Per Turbine Table */}
          {viewMode === "turbine" && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anlage</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead className="text-right">
                      SCADA Gesamt (kWh)
                    </TableHead>
                    <TableHead className="text-right">
                      Gemeldet Gesamt (kWh)
                    </TableHead>
                    <TableHead className="text-right">
                      Abweichung (kWh)
                    </TableHead>
                    <TableHead className="text-right">Abw. (%)</TableHead>
                    <TableHead className="text-right">
                      Monate mit Daten
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-12" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <div className="text-destructive">
                          Fehler beim Laden der Vergleichsdaten
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : turbineAggregates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <BarChart3 className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            Keine Vergleichsdaten vorhanden
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Importieren Sie SCADA-Daten, um den Vergleich zu
                            starten.
                          </p>
                          <Button variant="outline" size="sm" asChild>
                            <Link href="/energy/scada">
                              <Radio className="mr-2 h-4 w-4" />
                              Zur SCADA-Import & Verwaltung
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    turbineAggregates.map((agg) => (
                      <TableRow key={agg.turbineId}>
                        <TableCell className="font-medium">
                          {agg.turbineDesignation}
                        </TableCell>
                        <TableCell>{agg.parkName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatKwh(agg.totalScadaKwh)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatKwh(agg.totalReportedKwh)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${getDeltaColor(
                            agg.deltaPercent
                          )}`}
                        >
                          {formatKwh(agg.totalDeltaKwh)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-medium ${getDeltaColor(
                            agg.deltaPercent
                          )}`}
                        >
                          {agg.deltaPercent !== null
                            ? `${agg.deltaPercent >= 0 ? "+" : ""}${agg.deltaPercent.toFixed(2)} %`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {agg.monthsWithData}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Per Park Table */}
          {viewMode === "park" && (
            <div className="space-y-6">
              {/* Park Totals */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Jahressummen pro Park
                </h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Park</TableHead>
                        <TableHead className="text-right">
                          SCADA Gesamt (kWh)
                        </TableHead>
                        <TableHead className="text-right">
                          Gemeldet Gesamt (kWh)
                        </TableHead>
                        <TableHead className="text-right">
                          Abweichung (kWh)
                        </TableHead>
                        <TableHead className="text-right">Abw. (%)</TableHead>
                        <TableHead className="text-right">Anlagen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                          </TableRow>
                        ))
                      ) : isError ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center">
                            <div className="text-destructive">
                              Fehler beim Laden der Vergleichsdaten
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : parkTotalAggregates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <BarChart3 className="h-8 w-8 text-muted-foreground" />
                              <p className="text-muted-foreground">
                                Keine Vergleichsdaten vorhanden
                              </p>
                              <Button variant="outline" size="sm" asChild>
                                <Link href="/energy/scada">
                                  <Radio className="mr-2 h-4 w-4" />
                                  Zur SCADA-Import & Verwaltung
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        parkTotalAggregates.map((agg) => (
                          <TableRow key={agg.parkName} className="font-medium">
                            <TableCell className="font-semibold">
                              {agg.parkName}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatKwh(agg.totalScadaKwh)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatKwh(agg.totalReportedKwh)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono ${getDeltaColor(
                                agg.deltaPercent
                              )}`}
                            >
                              {formatKwh(agg.totalDeltaKwh)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-bold ${getDeltaColor(
                                agg.deltaPercent
                              )}`}
                            >
                              {agg.deltaPercent !== null
                                ? `${agg.deltaPercent >= 0 ? "+" : ""}${agg.deltaPercent.toFixed(2)} %`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {agg.turbineCount}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Park Monthly Breakdown */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Monatliche Aufschluesselung pro Park
                </h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Park</TableHead>
                        <TableHead>Monat</TableHead>
                        <TableHead className="text-right">SCADA (kWh)</TableHead>
                        <TableHead className="text-right">Gemeldet (kWh)</TableHead>
                        <TableHead className="text-right">Abweichung (kWh)</TableHead>
                        <TableHead className="text-right">Abw. (%)</TableHead>
                        <TableHead className="text-right">Anlagen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                          </TableRow>
                        ))
                      ) : isError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-16 text-center">
                            <div className="text-destructive">
                              Fehler beim Laden
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : parkMonthAggregates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                            Keine Daten
                          </TableCell>
                        </TableRow>
                      ) : (
                        parkMonthAggregates.map((agg, index) => (
                          <TableRow key={`${agg.parkName}-${agg.month}-${index}`}>
                            <TableCell className="font-medium">
                              {agg.parkName}
                            </TableCell>
                            <TableCell>
                              {monthNames[agg.month] ?? `Monat ${agg.month}`}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatKwh(agg.totalScadaKwh)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatKwh(agg.totalReportedKwh)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono ${getDeltaColor(
                                agg.deltaPercent
                              )}`}
                            >
                              {formatKwh(agg.totalDeltaKwh)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-medium ${getDeltaColor(
                                agg.deltaPercent
                              )}`}
                            >
                              {agg.deltaPercent !== null
                                ? `${agg.deltaPercent >= 0 ? "+" : ""}${agg.deltaPercent.toFixed(2)} %`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {agg.turbineCount}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
