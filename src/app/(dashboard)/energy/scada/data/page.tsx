"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Activity,
  Wind,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// =============================================================================
// TYPES
// =============================================================================

interface Park {
  id: string;
  name: string;
  turbines?: Turbine[];
}

interface Turbine {
  id: string;
  designation: string;
}

interface ScadaRecord {
  id: string;
  timestamp: string;
  windSpeed: number | null;
  power: number | null;
  rotorRpm: number | null;
  nacellePosition: number | null;
  turbine?: {
    id: string;
    designation: string;
    park?: {
      id: string;
      name: string;
    };
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDecimal(value: number | null, decimals = 2): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ScadaDataPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [turbines, setTurbines] = useState<Turbine[]>([]);
  const [measurements, setMeasurements] = useState<ScadaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParksLoading, setIsParksLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filter state
  const [parkId, setParkId] = useState<string>("");
  const [turbineId, setTurbineId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [page, setPage] = useState(1);
  const limit = 50;

  // Load parks
  useEffect(() => {
    async function loadParks() {
      try {
        const res = await fetch("/api/parks?limit=100");
        if (res.ok) {
          const data = await res.json();
          setParks(data.data ?? []);
        }
      } catch {
        // ignore
      } finally {
        setIsParksLoading(false);
      }
    }
    loadParks();
  }, []);

  // Load turbines when park changes
  useEffect(() => {
    if (!parkId) {
      setTurbines([]);
      setTurbineId("");
      return;
    }
    async function loadTurbines() {
      try {
        const res = await fetch(`/api/parks/${parkId}`);
        if (res.ok) {
          const data = await res.json();
          setTurbines(data.turbines ?? []);
        }
      } catch {
        // ignore
      }
    }
    loadTurbines();
  }, [parkId]);

  // Load measurements
  useEffect(() => {
    if (!turbineId) {
      setMeasurements([]);
      setTotal(0);
      return;
    }

    async function loadData() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          turbineId,
          limit: String(limit),
          offset: String((page - 1) * limit),
        });
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo + "T23:59:59");

        const res = await fetch(`/api/energy/scada/measurements?${params}`);
        if (res.ok) {
          const data = await res.json();
          setMeasurements(data.data ?? []);
          setTotal(data.pagination?.total ?? data.data?.length ?? 0);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [turbineId, dateFrom, dateTo, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SCADA-Messdaten"
        description="10-Minuten-Messdaten der Windenergieanlagen"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Park */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Park</label>
              <Select
                value={parkId}
                onValueChange={(v) => {
                  setParkId(v);
                  setTurbineId("");
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Park waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {isParksLoading ? (
                    <SelectItem value="__loading" disabled>
                      Laden...
                    </SelectItem>
                  ) : (
                    parks.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Turbine */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Anlage</label>
              <Select
                value={turbineId}
                onValueChange={(v) => {
                  setTurbineId(v);
                  setPage(1);
                }}
                disabled={!parkId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !parkId ? "Erst Park waehlen" : "Anlage waehlen..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {turbines.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.designation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Von</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bis</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Messdaten
          </CardTitle>
          <CardDescription>
            {total > 0
              ? `${total.toLocaleString("de-DE")} Messwerte gefunden`
              : turbineId
                ? "Keine Messdaten im gewaehlten Zeitraum"
                : "Bitte waehlen Sie eine Anlage aus"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!turbineId ? (
            <div className="py-12 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p>Waehlen Sie einen Park und eine Anlage aus,</p>
              <p>um die SCADA-Messdaten anzuzeigen.</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : measurements.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Keine Messdaten im gewaehlten Zeitraum vorhanden
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Zeitstempel
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Wind className="h-3.5 w-3.5" />
                          Wind (m/s)
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Zap className="h-3.5 w-3.5" />
                          Leistung (kW)
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        Rotor (U/min)
                      </TableHead>
                      <TableHead className="text-right">
                        Gondel (Grad)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {measurements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-sm">
                          {format(
                            new Date(m.timestamp),
                            "dd.MM.yyyy HH:mm",
                            { locale: de }
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatDecimal(m.windSpeed, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatDecimal(m.power, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatDecimal(m.rotorRpm, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatDecimal(m.nacellePosition, 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Seite {page} von {totalPages} ({total.toLocaleString("de-DE")} Einträge)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                    >
                      Weiter
                      <ChevronRight className="h-4 w-4" />
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
