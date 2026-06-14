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
import { Download, RefreshCw, BarChart3 } from "lucide-react";

interface GuvLine {
  position: number;
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  isSummary?: boolean;
  indent?: number;
}

interface GuvResult {
  lines: GuvLine[];
  periodStart: string;
  periodEnd: string;
  netIncome: number;
  previousNetIncome: number;
}

// RA-1: Multi-Year shape
interface MultiYearRow {
  position: number;
  label: string;
  isSummary?: boolean;
  indent?: number;
  values: { year: number; amount: number }[];
}
interface MultiYearResult {
  years: number[];
  rows: MultiYearRow[];
  netIncomeByYear: { year: number; amount: number }[];
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Redesign 2026-06 R-7: Currency-Display für Financial Statements.
 * Negative Beträge in Klammern (DIN-EN-1862 / Buchhaltungs-Konvention),
 * Positive ohne Vorzeichen, Null bleibt "0,00".
 * Farbliche Codierung NUR auf Summen-Zeilen (Jahresergebnis), nicht auf
 * jeder Detail-Position — sonst wird die GuV bunt und unlesbar.
 */
function fmtAccounting(n: number): string {
  if (n < 0) return `(${fmt(Math.abs(n))})`;
  return fmt(n);
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function GuvContent() {
  const t = useTranslations("buchhaltung.berichteGuv");
  const [data, setData] = useState<GuvResult | null>(null);
  const [multiData, setMultiData] = useState<MultiYearResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  // RA-1: Multi-Year-Mode
  const cy = new Date().getFullYear();
  const [multiMode, setMultiMode] = useState(false);
  const [startYear, setStartYear] = useState(cy - 2);
  const [endYear, setEndYear] = useState(cy);

  // H-9: AbortController um stale Requests bei Date-Range-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      if (multiMode) {
        const res = await fetch(
          `/api/buchhaltung/guv/multi-year?startYear=${startYear}&endYear=${endYear}`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!ac.signal.aborted) setMultiData(json.data || null);
      } else {
        const res = await fetch(`/api/buchhaltung/guv?from=${from}&to=${to}`, { signal: ac.signal });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!ac.signal.aborted) setData(json.data || null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastLoadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [from, to, multiMode, startYear, endYear, t]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  function exportCsv() {
    if (!data) return;
    const header = t("csvHeader") + "\n";
    const rows = data.lines.map((l) =>
      [l.position || "", l.label, fmt(l.currentPeriod), fmt(l.previousPeriod)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuV_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMultiCsv() {
    if (!multiData) return;
    const header = ["Pos.", "Bezeichnung", ...multiData.years.map(String)].join(";") + "\n";
    const rows = multiData.rows.map((r) =>
      [r.position || "", r.label, ...r.values.map((v) => fmt(v.amount))].join(";"),
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuV_MultiYear_${startYear}-${endYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Mode toggle */}
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant={multiMode ? "outline" : "default"}
            size="sm"
            onClick={() => setMultiMode(false)}
          >
            Einzeljahr
          </Button>
          <Button
            variant={multiMode ? "default" : "outline"}
            size="sm"
            onClick={() => setMultiMode(true)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Mehrjahres-Trend
          </Button>
        </div>

        {!multiMode ? (
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1"><Label>{t("from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t("to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />{t("refreshBtn")}</Button>
            <Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4 mr-2" />{t("exportBtn")}</Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(`/api/buchhaltung/guv/export/excel?from=${from}&to=${to}`, "_blank")
              }
              disabled={!data}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(`/api/buchhaltung/guv/export/pdf?from=${from}&to=${to}`, "_blank")
              }
              disabled={!data}
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1">
              <Label>Von Jahr</Label>
              <Input
                type="number"
                min={1900}
                max={2200}
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value, 10) || cy)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label>Bis Jahr (max 5)</Label>
              <Input
                type="number"
                min={1900}
                max={2200}
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value, 10) || cy)}
                className="w-28"
              />
            </div>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("refreshBtn")}
            </Button>
            <Button variant="outline" onClick={exportMultiCsv} disabled={!multiData}>
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `/api/buchhaltung/guv/multi-year/export/excel?startYear=${startYear}&endYear=${endYear}`,
                  "_blank",
                )
              }
              disabled={!multiData}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 15 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !multiMode ? (
          !data ? (
            <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
          ) : (
            <>
              {/* Redesign 2026-06 R-7: Financial-Statement-Layout.
               * - Zweispaltiges Currency-Setup (aktuelle Periode | Vorjahres-Periode)
               * - tabular-currency statt font-mono (Inter mit tnum/ss01 ist ruhiger)
               * - Negativ-Beträge in Klammern statt rotem Vorzeichen
               * - Subtotal-Rows: dezenter Border-Top + Bold
               * - Status-Tokens (text-success/destructive) nur auf finalem Ergebnis
               * - Sticky-Header via Backdrop-Blur, damit Header beim Scrollen bleibt
               */}
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table className="table-sticky-header">
                  <TableHeader>
                    <TableRow className="border-b-2 border-border">
                      <TableHead className="w-14 text-xs uppercase tracking-wider text-muted-foreground/80">{t("colNumber")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/80">{t("colPosition")}</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80">{t("colCurrentPeriod")}</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/50">{t("colPreviousPeriod")}</TableHead>
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
                          {line.position || ""}
                        </TableCell>
                        <TableCell className={line.indent ? "pl-8" : ""}>
                          {line.label}
                        </TableCell>
                        <TableCell className="text-right tabular-currency align-top pt-3">
                          {fmtAccounting(line.currentPeriod)}
                        </TableCell>
                        <TableCell className="text-right tabular-currency text-muted-foreground align-top pt-3 border-l border-border/40">
                          {fmtAccounting(line.previousPeriod)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Jahresergebnis-Footer mit Double-Border (Buchhaltungs-Konvention)
                     * statt nur als Summary-Row. Trennt visuell vom Detail-Bereich. */}
                    <TableRow className="border-t-2 border-double border-foreground/40 bg-muted/40 font-bold">
                      <TableCell />
                      <TableCell className="uppercase text-xs tracking-wider">
                        {t("netIncomeLabel").replace(":", "")}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-currency text-base ${
                          data.netIncome < 0
                            ? "text-destructive"
                            : "text-success"
                        }`}
                      >
                        {fmtAccounting(data.netIncome)}
                      </TableCell>
                      <TableCell className="text-right tabular-currency text-muted-foreground border-l border-border/40 text-base">
                        {fmtAccounting(data.previousNetIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )
        ) : !multiData ? (
          <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
        ) : (
          <>
            {/* Mehrjahres-Trend: gleicher Financial-Statement-Style mit N Spalten */}
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table className="table-sticky-header">
                <TableHeader>
                  <TableRow className="border-b-2 border-border">
                    <TableHead className="w-14 text-xs uppercase tracking-wider text-muted-foreground/80">{t("colNumber")}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/80">{t("colPosition")}</TableHead>
                    {multiData.years.map((y, idx) => (
                      <TableHead
                        key={y}
                        className={`text-right text-xs uppercase tracking-wider text-muted-foreground/80 ${idx > 0 ? "border-l border-border/40" : ""}`}
                      >
                        {y}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {multiData.rows.map((row, i) => (
                    <TableRow
                      key={i}
                      className={
                        row.isSummary
                          ? "font-semibold border-t border-border bg-muted/25 hover:bg-muted/30"
                          : "border-b border-border/30 hover:bg-muted/20"
                      }
                    >
                      <TableCell className="text-muted-foreground/70 font-mono text-xs align-top pt-3">
                        {row.position || ""}
                      </TableCell>
                      <TableCell className={row.indent ? "pl-8" : ""}>{row.label}</TableCell>
                      {row.values.map((v, idx) => (
                        <TableCell
                          key={v.year}
                          className={`text-right tabular-currency align-top pt-3 ${idx > 0 ? "border-l border-border/40" : ""} ${idx === 0 ? "" : "text-muted-foreground"}`}
                        >
                          {fmtAccounting(v.amount)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {/* Footer-Row: Jahresergebnis pro Jahr */}
                  <TableRow className="border-t-2 border-double border-foreground/40 bg-muted/40 font-bold">
                    <TableCell />
                    <TableCell className="uppercase text-xs tracking-wider">
                      {t("netIncomeLabel").replace(":", "")}
                    </TableCell>
                    {multiData.netIncomeByYear.map((n, idx) => (
                      <TableCell
                        key={n.year}
                        className={`text-right tabular-currency text-base ${idx > 0 ? "border-l border-border/40" : ""} ${
                          n.amount < 0
                            ? "text-destructive"
                            : "text-success"
                        }`}
                      >
                        {fmtAccounting(n.amount)}
                      </TableCell>
                    ))}
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
