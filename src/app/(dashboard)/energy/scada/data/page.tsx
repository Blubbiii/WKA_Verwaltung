"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  Wind,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
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
// PAGE COMPONENT
// =============================================================================

export default function ScadaDataPage() {
  const t = useTranslations("energy.scadaData");
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-US" : "de-DE";
  const dateFnsLocale = locale === "en" ? enUS : de;

  const formatDecimal = (value: number | null, decimals = 2): string => {
    if (value == null) return "-";
    return new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

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
  const dateFormat = locale === "en" ? "MM/dd/yyyy HH:mm" : "dd.MM.yyyy HH:mm";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("filter")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Park */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("park")}</label>
              <Select
                value={parkId}
                onValueChange={(v) => {
                  setParkId(v);
                  setTurbineId("");
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("parkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {isParksLoading ? (
                    <SelectItem value="__loading" disabled>
                      {t("loading")}
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
              <label className="text-sm font-medium">{t("turbine")}</label>
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
                      !parkId ? t("parkFirst") : t("turbinePlaceholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {turbines.map((tu) => (
                    <SelectItem key={tu.id} value={tu.id}>
                      {tu.designation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("from")}</label>
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
              <label className="text-sm font-medium">{t("to")}</label>
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
            {t("measurements")}
          </CardTitle>
          <CardDescription>
            {total > 0
              ? t("countFound", { count: total.toLocaleString(intlLocale) })
              : turbineId
                ? t("noDataInRange")
                : t("selectTurbine")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!turbineId ? (
            <div className="py-12 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p>{t("emptyLine1")}</p>
              <p>{t("emptyLine2")}</p>
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
              {t("noDataInRangeFull")}
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
                          {t("colTimestamp")}
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Wind className="h-3.5 w-3.5" />
                          {t("colWind")}
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Zap className="h-3.5 w-3.5" />
                          {t("colPower")}
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colRotor")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colNacelle")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {measurements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-sm">
                          {format(
                            new Date(m.timestamp),
                            dateFormat,
                            { locale: dateFnsLocale }
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
                    {t("pageStatus", {
                      page,
                      total: totalPages,
                      count: total.toLocaleString(intlLocale),
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t("prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                    >
                      {t("next")}
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
