"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

/** Redesign 2026-06 R-7: Klammer-Notation für negative Beträge (Buchhaltung). */
function fmtAccounting(n: number): string {
  if (n < 0) return `(${fmt(Math.abs(n))})`;
  return fmt(n);
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

  // H-9: AbortController um stale Requests bei Date-Range-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/bwa?from=${from}&to=${to}`, { signal: ac.signal });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!ac.signal.aborted) setData(json.data || null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastLoadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

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
          <Button
            variant="outline"
            onClick={() =>
              window.open(`/api/buchhaltung/bwa/export/excel?from=${from}&to=${to}`, "_blank")
            }
            disabled={!data}
          >
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data ? (
          <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
        ) : (
          // Redesign 2026-06 R-7: BWA Financial-Statement-Layout — gleiche Sprache wie GuV.
          // Vier Currency-Spalten (Aktuell/Vorperiode | YTD/VorYTD) durch Border getrennt,
          // tabular-currency, Klammern für negative Beträge, keine Farb-Kodierung außer
          // auf Summary-Rows (BOLD_LINES).
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table className="table-sticky-header">
              <TableHeader>
                <TableRow className="border-b-2 border-border">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/80">{t("colPosition")}</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80">{t("colCurrentPeriod")}</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colPreviousPeriod")}</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80 border-l-2 border-border">{t("colYtd")}</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colPreviousYtd")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((line, i) => {
                  const isSummary = BOLD_LINES.has(line.label);
                  return (
                    <TableRow
                      key={i}
                      className={
                        isSummary
                          ? "font-semibold border-t border-border bg-muted/25 hover:bg-muted/30"
                          : "border-b border-border/30 hover:bg-muted/20"
                      }
                    >
                      <TableCell className="align-top pt-3">{line.label}</TableCell>
                      <TableCell className="text-right tabular-currency align-top pt-3">{fmtAccounting(line.currentPeriod)}</TableCell>
                      <TableCell className="text-right tabular-currency text-muted-foreground align-top pt-3 border-l border-border/40">{fmtAccounting(line.previousPeriod)}</TableCell>
                      <TableCell className="text-right tabular-currency align-top pt-3 border-l-2 border-border">{fmtAccounting(line.ytd)}</TableCell>
                      <TableCell className="text-right tabular-currency text-muted-foreground align-top pt-3 border-l border-border/40">{fmtAccounting(line.previousYtd)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
