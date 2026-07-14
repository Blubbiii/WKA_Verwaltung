"use client";

/**
 * Park-Comparison Widget — Dashboard-Widget für Multi-Park Produktionsvergleich.
 *
 * Nutzt /api/parks (Liste) + /api/parks/comparison (aggregierte Monatsdaten).
 * 2-5 Parks per Checkbox auswählbar; MultiLine-Chart zeigt Monatsproduktion.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// UX16: Chart-Bundle als EIN dynamic() statt 9 einzelne Recharts-Imports
// (verhinderte sichtbares Flackern durch parallele Chunk-Requests).
const ParkComparisonChart = dynamic(
  () => import("./park-comparison-chart").then((m) => m.ParkComparisonChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

const MAX_SELECTABLE = 5;

interface ParkOption {
  id: string;
  name: string;
  status?: string;
}

interface ParkComparisonRow {
  month: number;
  [parkName: string]: number;
}

interface ComparisonResponse {
  year: number;
  parks: Array<{
    id: string;
    name: string;
    months: Array<{ month: number; productionKwh: number }>;
  }>;
}

export function ParkComparisonWidget() {
  const currentYear = new Date().getFullYear();
  const [year] = useState<number>(currentYear);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [parksLoading, setParksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Park-Liste laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/parks?limit=100");
        if (!r.ok) throw new Error("Parks konnten nicht geladen werden");
        const j = await r.json();
        // /api/parks returns { data: [...], pagination: {...} } oder { parks: [...] }
        const list: ParkOption[] = Array.isArray(j?.data)
          ? j.data
          : Array.isArray(j?.parks)
          ? j.parks
          : Array.isArray(j)
          ? j
          : [];
        if (!cancelled) {
          const active = list.filter(
            (p) => !p.status || p.status === "ACTIVE",
          );
          setParks(active);
          // Default: erste 2 Parks vorauswählen
          setSelectedIds(active.slice(0, 2).map((p) => p.id));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Fehler beim Laden");
        }
      } finally {
        if (!cancelled) setParksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Vergleichsdaten laden, wenn Auswahl sich ändert
  useEffect(() => {
    if (selectedIds.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(
          `/api/parks/comparison?parkIds=${selectedIds.join(",")}&year=${year}`,
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.message ?? "Vergleichsdaten konnten nicht geladen werden");
        }
        const j: ComparisonResponse = await r.json();
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds, year]);

  const chartData: ParkComparisonRow[] = useMemo(() => {
    if (!data) return [];
    // Pivotieren: [{month: "Jan", ParkA: 123, ParkB: 456}, ...]
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row: ParkComparisonRow = { month };
      for (const p of data.parks) {
        const m = p.months.find((x) => x.month === month);
        row[p.name] = m ? Math.round(m.productionKwh / 1000) : 0; // kWh → MWh
      }
      return row;
    });
  }, [data]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_SELECTABLE) {
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Park-Vergleich</CardTitle>
        <CardDescription>
          Monats-Produktion {year} (MWh) — max. {MAX_SELECTABLE} Parks
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {parksLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="flex flex-wrap gap-3 max-h-24 overflow-y-auto">
            {parks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Parks vorhanden</p>
            ) : (
              parks.map((p) => {
                const selected = selectedIds.includes(p.id);
                const disabled =
                  !selected && selectedIds.length >= MAX_SELECTABLE;
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`park-cmp-${p.id}`}
                      checked={selected}
                      disabled={disabled}
                      onCheckedChange={() => toggleSelect(p.id)}
                    />
                    <Label
                      htmlFor={`park-cmp-${p.id}`}
                      className={
                        disabled
                          ? "text-xs text-muted-foreground cursor-not-allowed"
                          : "text-xs cursor-pointer"
                      }
                    >
                      {p.name}
                    </Label>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="flex-1 min-h-[240px]">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <Skeleton className="h-full w-full" />
          ) : chartData.length === 0 || !data ? (
            <p className="text-sm text-muted-foreground">
              Bitte mindestens einen Park auswählen
            </p>
          ) : (
            <ParkComparisonChart
              chartData={chartData}
              parks={data.parks.map((p) => ({ id: p.id, name: p.name }))}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
