"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface BwaLine {
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  ytd: number;
  previousYtd: number;
}

interface BwaResult {
  lines: BwaLine[];
  periodStart: string;
  periodEnd: string;
  netIncome: number;
  previousNetIncome: number;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentMonth(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

const BOLD_LINES = new Set(["Rohertrag", "Betriebsergebnis", "Ergebnis vor Steuern"]);

export default function BwaContent() {
  const t = useTranslations("buchhaltung.berichteBwa");
  const [data, setData] = useState<BwaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentMonth();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/bwa?from=${from}&to=${to}`);
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
    const rows = data.lines.map((l) =>
      [l.label, fmt(l.currentPeriod), fmt(l.previousPeriod), fmt(l.ytd), fmt(l.previousYtd)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BWA_${from}_${to}.csv`;
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
        ) : !data ? (
          <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colPosition")}</TableHead>
                  <TableHead className="text-right">{t("colCurrentPeriod")}</TableHead>
                  <TableHead className="text-right">{t("colPreviousPeriod")}</TableHead>
                  <TableHead className="text-right">{t("colYtd")}</TableHead>
                  <TableHead className="text-right">{t("colPreviousYtd")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((line, i) => (
                  <TableRow key={i} className={BOLD_LINES.has(line.label) ? "font-bold border-t-2" : ""}>
                    <TableCell>{line.label}</TableCell>
                    <TableCell className={`text-right font-mono ${line.currentPeriod < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{fmt(line.currentPeriod)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmt(line.previousPeriod)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(line.ytd)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmt(line.previousYtd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
