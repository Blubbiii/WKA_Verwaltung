"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";

interface CostCenterRow {
  costCenterCode: string;
  costCenterName: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  revenue: number;
  expense: number;
  result: number;
}

interface Unassigned {
  debit: number;
  credit: number;
  revenue: number;
  expense: number;
  result: number;
}

interface ReportResult {
  rows: CostCenterRow[];
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpense: number;
  totalResult: number;
  unassigned: Unassigned;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const TYPE_COLORS: Record<string, string> = {
  PARK: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  TURBINE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  FUND: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  OVERHEAD: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  CUSTOM: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function KostenstellenContent() {
  const t = useTranslations("buchhaltung.planungKostenstellen");
  const [data, setData] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const typeLabel = useCallback(
    (type: string): string => {
      switch (type) {
        case "PARK": return t("typePark");
        case "TURBINE": return t("typeTurbine");
        case "FUND": return t("typeFund");
        case "OVERHEAD": return t("typeOverhead");
        case "CUSTOM": return t("typeCustom");
        default: return type;
      }
    },
    [t]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/kostenstellen?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error(t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function exportCsv() {
    if (!data) return;
    const header = t("csvHeader") + "\n";
    const rows = data.rows.map((r) =>
      [r.costCenterCode, r.costCenterName, typeLabel(r.type), fmt(r.revenue), fmt(r.expense), fmt(r.result)].join(";")
    );
    rows.push(["", t("unassignedLabel"), "", fmt(data.unassigned.revenue), fmt(data.unassigned.expense), fmt(data.unassigned.result)].join(";"));
    rows.push(["", t("csvTotal"), "", fmt(data.totalRevenue + data.unassigned.revenue), fmt(data.totalExpense + data.unassigned.expense), fmt(data.totalResult + data.unassigned.result)].join(";"));
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Kostenstellen_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
          <div className="space-y-1"><Label>{t("from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />{t("refreshBtn")}</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4 mr-2" />{t("exportBtn")}</Button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {t("emptyState")}
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colCode")}</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead className="text-right">{t("colRevenue")}</TableHead>
                  <TableHead className="text-right">{t("colExpense")}</TableHead>
                  <TableHead className="text-right">{t("colResult")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.costCenterCode}>
                    <TableCell className="font-mono text-sm">{row.costCenterCode}</TableCell>
                    <TableCell className="font-medium">{row.costCenterName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={TYPE_COLORS[row.type] || ""}>
                        {typeLabel(row.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600 dark:text-green-400">{fmt(row.revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600 dark:text-red-400">{fmt(row.expense)}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${row.result < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {fmt(row.result)}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Unassigned row */}
                {(data.unassigned.revenue !== 0 || data.unassigned.expense !== 0) && (
                  <TableRow className="text-muted-foreground italic">
                    <TableCell>-</TableCell>
                    <TableCell>{t("unassignedLabel")}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.unassigned.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.unassigned.expense)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.unassigned.result)}</TableCell>
                  </TableRow>
                )}

                {/* Total row */}
                <TableRow className="font-bold border-t-2 bg-muted/30">
                  <TableCell colSpan={3}>{t("totalLabel")}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(data.totalRevenue + data.unassigned.revenue)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(data.totalExpense + data.unassigned.expense)}</TableCell>
                  <TableCell className={`text-right font-mono ${(data.totalResult + data.unassigned.result) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                    {fmt(data.totalResult + data.unassigned.result)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
