"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw, TrendingDown, TrendingUp, Minus, ExternalLink } from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

interface Row {
  parkId: string;
  parkName: string;
  parkShortName: string | null;
  activeTurbines: number;
  capacityKw: number;
  sollMwh: number;
  istMwh: number;
  diffMwh: number;
  deviationPct: number | null;
  trafficLight: "green" | "amber" | "red";
}

interface Result {
  year: number;
  capacityFactor: number;
  rows: Row[];
  totals: {
    sollMwh: number;
    istMwh: number;
    diffMwh: number;
    deviationPct: number | null;
  };
}

const fmtMwh = (n: number): string =>
  n.toLocaleString(LOCALE_DE, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtPct = (n: number | null): string => {
  if (n === null) return "–";
  return `${n.toLocaleString(LOCALE_DE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};

function TrafficLightBadge({ level }: { level: Row["trafficLight"] }) {
  // Warm-Navy für "green" — alle drei Stufen über CSS-Vars + spezifische Hex
  if (level === "green") {
    return (
      <Badge className="bg-[hsl(215_50%_40%)] hover:bg-[hsl(215_50%_36%)] text-white border-0">
        Im Plan
      </Badge>
    );
  }
  if (level === "amber") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0">
        Achtung
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-600 hover:bg-red-700 text-white border-0">
      Kritisch
    </Badge>
  );
}

function TrendIcon({ deviationPct }: { deviationPct: number | null }) {
  if (deviationPct === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (deviationPct >= 0) return <TrendingUp className="h-4 w-4 text-[hsl(215_50%_40%)] dark:text-[hsl(215_55%_58%)]" />;
  if (deviationPct >= -5) return <Minus className="h-4 w-4 text-amber-500" />;
  return <TrendingDown className="h-4 w-4 text-red-600" />;
}

export default function MultiParkSollIstPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [cf, setCf] = useState(0.25);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/buchhaltung/multi-park-soll-ist?year=${year}&cf=${cf}`,
        { signal: ac.signal },
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!ac.signal.aborted) setData(json.data || null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Soll/Ist-Vergleich konnte nicht geladen werden");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [year, cf]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(215_50%_40%)] dark:text-[hsl(215_55%_58%)]">
          Park-übergreifender Soll/Ist-Vergleich
        </h1>
        <p className="text-muted-foreground mt-1">
          Aggregierte Energieproduktion (MWh) über alle aktiven Parks im Vergleich zum Plan-Soll.
        </p>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1 min-w-[140px]">
              <Label htmlFor="year-select">Jahr</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(parseInt(v, 10))}
              >
                <SelectTrigger id="year-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <Label htmlFor="cf-input">
                Capacity-Factor
                <span className="text-xs text-muted-foreground ml-1">(Onshore ≈ 0,25)</span>
              </Label>
              <Input
                id="cf-input"
                type="number"
                min={0.05}
                max={0.6}
                step={0.01}
                value={cf}
                onChange={(e) => setCf(parseFloat(e.target.value) || 0.25)}
              />
            </div>
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals-Karten */}
      {data && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Soll-Produktion</CardDescription>
              <CardTitle className="text-2xl font-mono">
                {fmtMwh(data.totals.sollMwh)} MWh
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ist-Produktion</CardDescription>
              <CardTitle className="text-2xl font-mono">
                {fmtMwh(data.totals.istMwh)} MWh
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-[hsl(215_50%_40%)]/30">
            <CardHeader className="pb-2">
              <CardDescription>Abweichung gesamt</CardDescription>
              <CardTitle className="text-2xl font-mono flex items-center gap-2">
                <TrendIcon deviationPct={data.totals.deviationPct} />
                {fmtPct(data.totals.deviationPct)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Detail pro Park</CardTitle>
          <CardDescription>
            Soll = installierte Leistung × 8.760 h × Capacity-Factor. Ist aus Energie-Abrechnungen.
            Klick auf Park-Namen öffnet die Detail-Ansicht.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Keine aktiven Parks mit Energiedaten für {year} gefunden.
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Park</TableHead>
                    <TableHead className="text-right">Anlagen</TableHead>
                    <TableHead className="text-right">kW</TableHead>
                    <TableHead className="text-right">Soll&nbsp;(MWh)</TableHead>
                    <TableHead className="text-right">Ist&nbsp;(MWh)</TableHead>
                    <TableHead className="text-right">Δ&nbsp;(MWh)</TableHead>
                    <TableHead className="text-right">Abw.&nbsp;%</TableHead>
                    <TableHead>Ampel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.parkId}>
                      <TableCell>
                        <Link
                          href={`/parks/${row.parkId}`}
                          className="font-medium text-[hsl(215_50%_40%)] hover:underline dark:text-[hsl(215_55%_58%)] inline-flex items-center gap-1"
                        >
                          {row.parkName}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        {row.parkShortName && (
                          <div className="text-xs text-muted-foreground">
                            {row.parkShortName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.activeTurbines}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtMwh(row.capacityKw)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtMwh(row.sollMwh)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtMwh(row.istMwh)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${row.diffMwh < 0 ? "text-red-600" : "text-[hsl(215_50%_40%)] dark:text-[hsl(215_55%_58%)]"}`}
                      >
                        {row.diffMwh > 0 ? "+" : ""}
                        {fmtMwh(row.diffMwh)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <TrendIcon deviationPct={row.deviationPct} />
                          {fmtPct(row.deviationPct)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TrafficLightBadge level={row.trafficLight} />
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total row */}
                  <TableRow className="font-bold border-t-2 bg-muted/30">
                    <TableCell colSpan={3}>Gesamt</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtMwh(data.totals.sollMwh)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtMwh(data.totals.istMwh)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${data.totals.diffMwh < 0 ? "text-red-600" : "text-[hsl(215_50%_40%)] dark:text-[hsl(215_55%_58%)]"}`}
                    >
                      {data.totals.diffMwh > 0 ? "+" : ""}
                      {fmtMwh(data.totals.diffMwh)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPct(data.totals.deviationPct)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
