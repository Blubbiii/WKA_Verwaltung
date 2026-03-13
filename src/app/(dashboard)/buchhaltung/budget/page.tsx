"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Download, RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface BudgetComparisonRow {
  costCenterCode: string;
  costCenterName: string;
  category: string;
  description: string;
  planned: number;
  actual: number;
  difference: number;
  deviationPct: number | null;
}

interface BudgetComparisonResult {
  budgetId: string;
  budgetName: string;
  year: number;
  rows: BudgetComparisonRow[];
  totalPlanned: number;
  totalActual: number;
  totalDifference: number;
}

interface BudgetSummary {
  id: string;
  name: string;
  year: number;
  status: string;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): string {
  if (n === null) return "-";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const CATEGORY_LABELS: Record<string, string> = {
  REVENUE_ENERGY: "Energieerlöse",
  REVENUE_OTHER: "Sonstige Erlöse",
  COST_LEASE: "Pachtkosten",
  COST_MAINTENANCE: "Wartung & Instandhaltung",
  COST_INSURANCE: "Versicherungen",
  COST_ADMIN: "Verwaltungskosten",
  COST_DEPRECIATION: "Abschreibungen",
  COST_FINANCING: "Finanzierungskosten",
  COST_OTHER: "Sonstige Kosten",
  RESERVE: "Rücklagen",
};

const MONTH_OPTIONS = [
  { value: "1-12", label: "Ganzes Jahr" },
  { value: "1-3", label: "Q1 (Jan-Mär)" },
  { value: "4-6", label: "Q2 (Apr-Jun)" },
  { value: "7-9", label: "Q3 (Jul-Sep)" },
  { value: "10-12", label: "Q4 (Okt-Dez)" },
  { value: "1-6", label: "H1 (Jan-Jun)" },
  { value: "7-12", label: "H2 (Jul-Dez)" },
];

export default function BudgetVergleichPage() {
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string>("");
  const [monthRange, setMonthRange] = useState("1-12");
  const [data, setData] = useState<BudgetComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingBudgets, setLoadingBudgets] = useState(true);

  // Load available budgets
  useEffect(() => {
    async function loadBudgets() {
      try {
        const res = await fetch("/api/wirtschaftsplan/budgets");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const items = json.data || [];
        setBudgets(items);
        if (items.length > 0) setSelectedBudget(items[0].id);
      } catch {
        toast.error("Budgetpläne konnten nicht geladen werden");
      } finally {
        setLoadingBudgets(false);
      }
    }
    loadBudgets();
  }, []);

  const fetchComparison = useCallback(async () => {
    if (!selectedBudget) return;
    setLoading(true);
    try {
      const [fromMonth, toMonth] = monthRange.split("-");
      const res = await fetch(
        `/api/buchhaltung/budget-vergleich?budgetId=${selectedBudget}&fromMonth=${fromMonth}&toMonth=${toMonth}`
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("Budget-Vergleich konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [selectedBudget, monthRange]);

  useEffect(() => {
    if (selectedBudget) fetchComparison();
  }, [selectedBudget, monthRange, fetchComparison]);

  function exportCsv() {
    if (!data) return;
    const header = "Kostenstelle;Code;Kategorie;Beschreibung;Soll;Ist;Differenz;Abweichung %\n";
    const rows = data.rows.map((r) =>
      [r.costCenterName, r.costCenterCode, CATEGORY_LABELS[r.category] || r.category, r.description, fmt(r.planned), fmt(r.actual), fmt(r.difference), fmtPct(r.deviationPct)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Budget_Vergleich_${data.budgetName}_${data.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function DeviationIcon({ pct }: { pct: number | null }) {
    if (pct === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (Math.abs(pct) < 5) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (pct > 0) return <TrendingUp className="h-3 w-3 text-red-500" />;
    return <TrendingDown className="h-3 w-3 text-green-500" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget Soll/Ist-Vergleich"
        description="Vergleich der geplanten und tatsächlichen Werte pro Kostenstelle"
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1 min-w-[200px]">
              <Label>Budgetplan</Label>
              {loadingBudgets ? (
                <Skeleton className="h-10 w-full" />
              ) : budgets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Keine Budgetpläne vorhanden</p>
              ) : (
                <Select value={selectedBudget} onValueChange={setSelectedBudget}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {budgets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1 min-w-[160px]">
              <Label>Zeitraum</Label>
              <Select value={monthRange} onValueChange={setMonthRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchComparison} disabled={!selectedBudget}>
              <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {budgets.length === 0
                ? "Erstellen Sie zuerst einen Budgetplan unter Wirtschaftsplan → Budget."
                : "Keine Budgetzeilen gefunden."}
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kostenstelle</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right">Soll</TableHead>
                    <TableHead className="text-right">Ist</TableHead>
                    <TableHead className="text-right">Differenz</TableHead>
                    <TableHead className="text-right w-[100px]">Abweichung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="text-sm font-medium">{row.costCenterName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.costCenterCode}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_LABELS[row.category] || row.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.description}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(row.planned)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(row.actual)}</TableCell>
                      <TableCell className={`text-right font-mono ${row.difference > 0 ? "text-red-600 dark:text-red-400" : row.difference < 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                        {fmt(row.difference)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DeviationIcon pct={row.deviationPct} />
                          <span className={`font-mono text-sm ${
                            row.deviationPct !== null && Math.abs(row.deviationPct) > 10
                              ? row.deviationPct > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                          }`}>
                            {fmtPct(row.deviationPct)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total row */}
                  <TableRow className="font-bold border-t-2 bg-muted/30">
                    <TableCell colSpan={3}>Gesamt</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totalPlanned)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totalActual)}</TableCell>
                    <TableCell className={`text-right font-mono ${data.totalDifference > 0 ? "text-red-600 dark:text-red-400" : data.totalDifference < 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                      {fmt(data.totalDifference)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {data.totalPlanned !== 0 ? fmtPct((data.totalDifference / Math.abs(data.totalPlanned)) * 100) : "-"}
                    </TableCell>
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
