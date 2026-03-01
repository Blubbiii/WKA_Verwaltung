"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// TYPES
// ============================================================================

interface MonthData {
  month: number;
  energyRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  leaseExpenses: number;
  operatingCosts: number;
  totalCosts: number;
  netPL: number;
}

interface ParkPLEntry {
  parkId: string;
  parkName: string;
  months: MonthData[];
  totals: MonthData;
}

interface PLResponse {
  year: number;
  parks: ParkPLEntry[];
}

interface ParkOption {
  id: string;
  name: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

function formatCurrency(n: number): string {
  if (n === 0) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatCurrencyRaw(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ParkPLPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [parkId, setParkId] = useState<string>("all");
  const [parkOptions, setParkOptions] = useState<ParkOption[]>([]);
  const [data, setData] = useState<PLResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Load park list for filter
  useEffect(() => {
    fetch("/api/parks?limit=100")
      .then((r) => r.json())
      .then((d) => {
        const parks = (d.items ?? d ?? []) as { id: string; name: string }[];
        setParkOptions(parks.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (parkId !== "all") params.set("parkId", parkId);
      const res = await fetch(`/api/reports/park-pl?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [year, parkId]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- XLSX Export ----
  const handleExport = () => {
    if (!data || data.parks.length === 0) return;

    const wb = XLSX.utils.book_new();

    for (const park of data.parks) {
      const header = [
        "Kategorie",
        ...MONTH_LABELS,
        "Gesamt",
      ];

      const rows: (string | number)[][] = [
        ["EINNAHMEN"],
        [
          "Energieerträge",
          ...park.months.map((m) => m.energyRevenue),
          park.totals.energyRevenue,
        ],
        [
          "Sonstige Erträge",
          ...park.months.map((m) => m.otherRevenue),
          park.totals.otherRevenue,
        ],
        [
          "Σ Einnahmen",
          ...park.months.map((m) => m.totalRevenue),
          park.totals.totalRevenue,
        ],
        [],
        ["AUSGABEN"],
        [
          "Pachtaufwand",
          ...park.months.map((m) => m.leaseExpenses),
          park.totals.leaseExpenses,
        ],
        [
          "Betriebskosten",
          ...park.months.map((m) => m.operatingCosts),
          park.totals.operatingCosts,
        ],
        [
          "Σ Ausgaben",
          ...park.months.map((m) => m.totalCosts),
          park.totals.totalCosts,
        ],
        [],
        [
          "ERGEBNIS",
          ...park.months.map((m) => m.netPL),
          park.totals.netPL,
        ],
      ];

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      // Column widths
      ws["!cols"] = [{ wch: 22 }, ...Array(13).fill({ wch: 14 })];
      XLSX.utils.book_append_sheet(wb, ws, park.parkName.slice(0, 31));
    }

    XLSX.writeFile(wb, `Park_PL_${data.year}.xlsx`);
  };

  // ---- KPIs across all parks ----
  const totalRevenue = data?.parks.reduce((s, p) => s + p.totals.totalRevenue, 0) ?? 0;
  const totalCosts = data?.parks.reduce((s, p) => s + p.totals.totalCosts, 0) ?? 0;
  const netPL = totalRevenue - totalCosts;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Park P&L</h1>
            <p className="text-sm text-muted-foreground">
              Einnahmen und Ausgaben je Windpark
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center font-medium text-sm">{year}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Park filter */}
          {parkOptions.length > 0 && (
            <Select value={parkId} onValueChange={setParkId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Alle Parks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Parks</SelectItem>
                {parkOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!data || data.parks.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            XLSX
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Gesamteinnahmen {year}</p>
            <p className="text-2xl font-bold mt-1 text-green-700 dark:text-green-400">
              {loading ? "—" : formatCurrencyRaw(totalRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Gesamtausgaben {year}</p>
            <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
              {loading ? "—" : formatCurrencyRaw(totalCosts)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Ergebnis {year}</p>
            <div className="flex items-center gap-2 mt-1">
              {loading ? (
                <p className="text-2xl font-bold">—</p>
              ) : netPL >= 0 ? (
                <>
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {formatCurrencyRaw(netPL)}
                  </p>
                </>
              ) : (
                <>
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {formatCurrencyRaw(netPL)}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Tables — one per park */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          Wird geladen…
        </div>
      )}

      {!loading && data && data.parks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground gap-3">
            <BarChart3 className="h-10 w-10 opacity-30" />
            <p className="text-sm">Keine Daten für {year} gefunden</p>
          </CardContent>
        </Card>
      )}

      {!loading &&
        data?.parks.map((park) => (
          <Card key={park.parkId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {park.parkName}
                {park.totals.netPL > 0 ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    + {formatCurrencyRaw(park.totals.netPL)}
                  </Badge>
                ) : park.totals.netPL < 0 ? (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {formatCurrencyRaw(park.totals.netPL)}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <PLTable park={park} />
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

// ============================================================================
// P&L TABLE COMPONENT
// ============================================================================

function PLTable({ park }: { park: ParkPLEntry }) {
  const cols = [...MONTH_LABELS, "Gesamt"];
  const months = [...park.months, park.totals];

  const rows: { label: string; key: keyof MonthData; isTotal?: boolean; isSection?: boolean }[] = [
    { label: "EINNAHMEN", key: "totalRevenue", isSection: true },
    { label: "Energieerträge", key: "energyRevenue" },
    { label: "Sonstige Erträge", key: "otherRevenue" },
    { label: "Σ Einnahmen", key: "totalRevenue", isTotal: true },
    { label: "AUSGABEN", key: "totalCosts", isSection: true },
    { label: "Pachtaufwand", key: "leaseExpenses" },
    { label: "Betriebskosten", key: "operatingCosts" },
    { label: "Σ Ausgaben", key: "totalCosts", isTotal: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-4 font-medium text-muted-foreground w-44">
              Kategorie
            </th>
            {cols.map((col, i) => (
              <th
                key={col}
                className={`text-right py-2 px-3 font-medium text-muted-foreground ${
                  i === cols.length - 1 ? "border-l font-semibold text-foreground" : ""
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={
                row.isSection
                  ? "bg-muted/40"
                  : row.isTotal
                  ? "border-t font-medium"
                  : ""
              }
            >
              <td
                className={`py-1.5 px-4 ${
                  row.isSection ? "font-semibold text-xs uppercase tracking-wide" : ""
                }`}
              >
                {row.isSection ? row.label : `  ${row.label}`}
              </td>
              {months.map((m, mi) => {
                const val = row.isSection ? null : (m[row.key] as number);
                const isLast = mi === months.length - 1;
                const isNetPL = row.key === "totalRevenue" && row.isTotal;
                const isExpTotal = row.key === "totalCosts" && row.isTotal;
                return (
                  <td
                    key={mi}
                    className={`text-right py-1.5 px-3 tabular-nums ${
                      isLast ? "border-l font-semibold" : ""
                    } ${
                      val !== null && val !== 0 && isNetPL
                        ? ""
                        : val !== null && val !== 0 && isExpTotal
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }`}
                  >
                    {row.isSection ? "" : formatCurrency(val as number)}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* ERGEBNIS row */}
          <tr className="border-t-2 bg-muted/20">
            <td className="py-2 px-4 font-bold">ERGEBNIS</td>
            {months.map((m, mi) => {
              const isLast = mi === months.length - 1;
              return (
                <td
                  key={mi}
                  className={`text-right py-2 px-3 tabular-nums font-bold ${
                    isLast ? "border-l" : ""
                  } ${
                    m.netPL > 0
                      ? "text-green-700 dark:text-green-400"
                      : m.netPL < 0
                      ? "text-red-600 dark:text-red-400"
                      : ""
                  }`}
                >
                  {formatCurrency(m.netPL)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
