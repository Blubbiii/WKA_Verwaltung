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
import { LOCALE_DE } from "@/lib/format";

interface EuerLine {
  kennzahl: number;
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  isSummary?: boolean;
}

interface EuerResult {
  lines: EuerLine[];
  periodStart: string;
  periodEnd: string;
  profit: number;
  previousProfit: number;
}

function fmt(n: number): string {
  return n.toLocaleString(LOCALE_DE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Redesign 2026-06 R-7: Klammer-Notation für negative Beträge. */
function fmtAccounting(n: number): string {
  if (n < 0) return `(${fmt(Math.abs(n))})`;
  return fmt(n);
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function EuerContent() {
  const t = useTranslations("buchhaltung.berichteEuer");
  const [data, setData] = useState<EuerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  // AbortController um stale Requests bei Date-Range-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/euer?from=${from}&to=${to}`, { signal: ac.signal });
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
      [l.kennzahl || "", l.label, fmt(l.currentPeriod), fmt(l.previousPeriod)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EUER_${from}_${to}.csv`;
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
          <div className="space-y-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data ? (
          <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
        ) : (
          <>
            {/* Redesign 2026-06 R-7: EÜR Financial-Statement-Layout — gleiche Sprache wie GuV/BWA. */}
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table className="table-sticky-header">
                <TableHeader>
                  <TableRow className="border-b-2 border-border">
                    <TableHead className="w-16 text-xs uppercase tracking-wider text-muted-foreground/80">{t("colKennzahl")}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/80">{t("colPosition")}</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80">{t("colCurrentPeriod")}</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colPreviousPeriod")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((line, i) => (
                    <TableRow
                      key={i}
                      className={
                        line.isSummary
                          ? "font-semibold border-t border-border bg-muted/25 hover:bg-muted/30"
                          : "border-b border-border/30 hover:bg-muted/20"
                      }
                    >
                      <TableCell className="text-muted-foreground/70 font-mono text-xs align-top pt-3">
                        {line.kennzahl || ""}
                      </TableCell>
                      <TableCell className="align-top pt-3">{line.label}</TableCell>
                      <TableCell className="text-right tabular-currency align-top pt-3">
                        {fmtAccounting(line.currentPeriod)}
                      </TableCell>
                      <TableCell className="text-right tabular-currency text-muted-foreground align-top pt-3 border-l border-border/40">
                        {fmtAccounting(line.previousPeriod)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-double border-foreground/40 bg-muted/40 font-bold">
                    <TableCell />
                    <TableCell className="uppercase text-xs tracking-wider">{t("resultLabel").replace(":", "")}</TableCell>
                    <TableCell
                      className={`text-right tabular-currency text-base ${
                        data.profit < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {fmtAccounting(data.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-currency text-muted-foreground border-l border-border/40 text-base">
                      {fmtAccounting(data.previousProfit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
