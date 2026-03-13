"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RefreshCw, Download } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface LiquidityPeriod {
  label: string;
  periodStart: string;
  periodEnd: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  cumulativeBalance: number;
  details: {
    receivables: number;
    budgetRevenue: number;
    payables: number;
    budgetCosts: number;
    recurringOut: number;
  };
}

interface ForecastResult {
  periods: LiquidityPeriod[];
  startingBalance: number;
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
}

interface BudgetSummary {
  id: string;
  name: string;
  year: number;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toFixed(0);
}

export default function LiquiditaetPage() {
  const [data, setData] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("12");
  const [granularity, setGranularity] = useState("monthly");
  const [startingBalance, setStartingBalance] = useState("0");
  const [budgetId, setBudgetId] = useState("");
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Load budgets
  useEffect(() => {
    async function loadBudgets() {
      try {
        const res = await fetch("/api/wirtschaftsplan/budgets");
        if (res.ok) {
          const json = await res.json();
          setBudgets(json.data || []);
        }
      } catch { /* ignore */ }
    }
    loadBudgets();
  }, []);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        months,
        granularity,
        startingBalance,
      });
      if (budgetId) params.set("budgetId", budgetId);

      const res = await fetch(`/api/buchhaltung/liquiditaet?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("Liquiditätsplanung konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [months, granularity, startingBalance, budgetId]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  function toggleRow(index: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function exportCsv() {
    if (!data) return;
    const header = "Periode;Einnahmen;Ausgaben;Netto;Kumuliert;Forderungen;Budget-Einnahmen;Verbindlichkeiten;Budget-Kosten;Wiederkehrend\n";
    const rows = data.periods.map((p) =>
      [p.label, fmt(p.inflows), fmt(p.outflows), fmt(p.netCashFlow), fmt(p.cumulativeBalance),
       fmt(p.details.receivables), fmt(p.details.budgetRevenue), fmt(p.details.payables),
       fmt(p.details.budgetCosts), fmt(p.details.recurringOut)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Liquiditaet_${months}M_${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Chart data
  const chartData = data?.periods.map((p) => ({
    name: p.label,
    Einnahmen: p.inflows,
    Ausgaben: -p.outflows,
    Kumuliert: p.cumulativeBalance,
  })) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquiditätsplanung"
        description="Cash-Flow-Prognose auf Basis offener Rechnungen, Budgetdaten und wiederkehrender Zahlungen"
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end flex-wrap">
            <div className="space-y-1 min-w-[120px]">
              <Label>Horizont</Label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Monate</SelectItem>
                  <SelectItem value="6">6 Monate</SelectItem>
                  <SelectItem value="12">12 Monate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label>Granularität</Label>
              <Select value={granularity} onValueChange={setGranularity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                  <SelectItem value="weekly">Wöchentlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-[140px]">
              <Label>Startsaldo (€)</Label>
              <Input type="number" step="0.01" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
            </div>
            {budgets.length > 0 && (
              <div className="space-y-1 min-w-[180px]">
                <Label>Budgetplan</Label>
                <Select value={budgetId} onValueChange={setBudgetId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Budget</SelectItem>
                    {budgets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({b.year})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" onClick={fetchForecast}>
              <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data || data.periods.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Keine Daten für die Prognose verfügbar.
            </div>
          ) : (
            <>
              {/* KPI Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Startsaldo</div>
                  <div className="text-lg font-bold font-mono">{fmt(data.startingBalance)} €</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Progn. Endsaldo</div>
                  <div className={`text-lg font-bold font-mono ${data.endingBalance < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {fmt(data.endingBalance)} €
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Gesamteinnahmen</div>
                  <div className="text-lg font-bold font-mono text-green-600 dark:text-green-400">{fmt(data.totalInflows)} €</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Gesamtausgaben</div>
                  <div className="text-lg font-bold font-mono text-red-600 dark:text-red-400">{fmt(data.totalOutflows)} €</div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-[300px] mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [fmt(Math.abs(value)) + " €", name]}
                      labelStyle={{ fontWeight: "bold" }}
                    />
                    <Legend />
                    <Bar dataKey="Einnahmen" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Ausgaben" fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="Kumuliert" stroke="hsl(215, 50%, 40%)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Data Table */}
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Einnahmen</TableHead>
                      <TableHead className="text-right">Ausgaben</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Kumuliert</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.periods.map((p, i) => (
                      <>
                        <TableRow
                          key={i}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(i)}
                        >
                          <TableCell className="font-medium">{p.label}</TableCell>
                          <TableCell className="text-right font-mono text-green-600 dark:text-green-400">{fmt(p.inflows)}</TableCell>
                          <TableCell className="text-right font-mono text-red-600 dark:text-red-400">{fmt(p.outflows)}</TableCell>
                          <TableCell className={`text-right font-mono ${p.netCashFlow < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                            {fmt(p.netCashFlow)}
                          </TableCell>
                          <TableCell className={`text-right font-mono font-medium ${p.cumulativeBalance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                            {fmt(p.cumulativeBalance)}
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(i) && (
                          <TableRow key={`${i}-details`} className="bg-muted/20">
                            <TableCell colSpan={5} className="py-2 px-8">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Forderungen:</span> <span className="font-mono">{fmt(p.details.receivables)}</span></div>
                                <div><span className="text-muted-foreground">Budget-Einnahmen:</span> <span className="font-mono">{fmt(p.details.budgetRevenue)}</span></div>
                                <div><span className="text-muted-foreground">Verbindlichkeiten:</span> <span className="font-mono">{fmt(p.details.payables)}</span></div>
                                <div><span className="text-muted-foreground">Budget-Kosten:</span> <span className="font-mono">{fmt(p.details.budgetCosts)}</span></div>
                                <div><span className="text-muted-foreground">Wiederkehrend:</span> <span className="font-mono">{fmt(p.details.recurringOut)}</span></div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
