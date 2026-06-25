"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatDate, LOCALE_DE } from "@/lib/format";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuSaRow {
  accountNumber: string;
  accountName: string;
  category: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  balance: number;
}

interface SuSaResult {
  rows: SuSaRow[];
  periodStart: string;
  periodEnd: string;
  totalDebit: number;
  totalCredit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString(LOCALE_DE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SuSaContent() {
  const t = useTranslations("buchhaltung.berichteSusa");
  const [data, setData] = useState<SuSaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const categoryLabel = useCallback(
    (cat: string): string => {
      switch (cat) {
        case "ASSET": return t("categoryAsset");
        case "LIABILITY": return t("categoryLiability");
        case "EQUITY": return t("categoryEquity");
        case "REVENUE": return t("categoryRevenue");
        case "EXPENSE": return t("categoryExpense");
        default: return cat;
      }
    },
    [t]
  );

  // H-9: AbortController um stale Requests bei Date-Range-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/buchhaltung/susa?${params}`, { signal: ac.signal });
      if (!res.ok) throw new Error("Error loading");
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
    const rows = data.rows.map((r) =>
      [
        r.accountNumber,
        `"${r.accountName}"`,
        categoryLabel(r.category),
        fmt(r.openingDebit),
        fmt(r.openingCredit),
        fmt(r.periodDebit),
        fmt(r.periodCredit),
        fmt(r.closingDebit),
        fmt(r.closingCredit),
        fmt(r.balance),
      ].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SuSa_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
          <div className="space-y-1">
            <Label>{t("from")}</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("to")}</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("refreshBtn")}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data || data.rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {t("exportBtn")}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(`/api/buchhaltung/susa/export/excel?from=${from}&to=${to}`, "_blank")
            }
            disabled={!data || data.rows.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {t("emptyState")}
          </div>
        ) : (
          <>
            {/* Redesign 2026-06 R-7: SuSa Saldenliste — tabular-currency,
             * sticky-header, Status-Token statt rohe Farben für Balance-Vorzeichen.
             * SuSa ist pro-Konto (flach), nicht hierarchisch — daher keine
             * Indent/Subtotal-Logik wie bei GuV/BWA. */}
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table className="table-sticky-header">
                <TableHeader>
                  <TableRow className="border-b-2 border-border">
                    <TableHead className="w-[80px] text-xs uppercase tracking-wider text-muted-foreground/80">{t("colAccount")}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/80">{t("colName")}</TableHead>
                    <TableHead className="w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80">{t("colCategory")}</TableHead>
                    <TableHead className="text-right w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colOpeningDebit")}</TableHead>
                    <TableHead className="text-right w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80">{t("colOpeningCredit")}</TableHead>
                    <TableHead className="text-right w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colDebit")}</TableHead>
                    <TableHead className="text-right w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80">{t("colCredit")}</TableHead>
                    <TableHead className="text-right w-[110px] text-xs uppercase tracking-wider text-muted-foreground/80 border-l border-border/40">{t("colClosingDebit")}</TableHead>
                    <TableHead className="text-right w-[110px] text-xs uppercase tracking-wider text-muted-foreground/80">{t("colClosingCredit")}</TableHead>
                    <TableHead className="text-right w-[100px] text-xs uppercase tracking-wider text-muted-foreground/80 border-l-2 border-border">{t("colBalance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.accountNumber} className="border-b border-border/30 hover:bg-muted/20">
                      <TableCell className="font-mono font-semibold align-top pt-3">
                        <Link
                          href={`/buchhaltung/kontoblatt?account=${encodeURIComponent(row.accountNumber)}&from=${from}&to=${to}`}
                          className="text-primary underline-offset-4 hover:underline"
                          title="Zum Kontoblatt"
                        >
                          {row.accountNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top pt-3">{row.accountName}</TableCell>
                      <TableCell className="align-top pt-3">
                        <Badge variant="secondary" className="text-xs">
                          {categoryLabel(row.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3 border-l border-border/40">{fmt(row.openingDebit)}</TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3">{fmt(row.openingCredit)}</TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3 border-l border-border/40">{fmt(row.periodDebit)}</TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3">{fmt(row.periodCredit)}</TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3 border-l border-border/40">{fmt(row.closingDebit)}</TableCell>
                      <TableCell className="text-right tabular-currency text-sm align-top pt-3">{fmt(row.closingCredit)}</TableCell>
                      <TableCell
                        className={`text-right tabular-currency text-sm font-semibold align-top pt-3 border-l-2 border-border ${
                          row.balance >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {fmt(Math.abs(row.balance))}
                        <span className="text-xs text-muted-foreground/70 ml-1">{row.balance >= 0 ? "S" : "H"}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row mit Double-Border */}
                  <TableRow className="font-bold border-t-2 border-double border-foreground/40 bg-muted/40">
                    <TableCell colSpan={5} className="text-right uppercase text-xs tracking-wider align-top pt-3 border-l border-border/40">{t("sumMovements")}</TableCell>
                    <TableCell className="text-right tabular-currency align-top pt-3 border-l border-border/40">{fmt(data.totalDebit)}</TableCell>
                    <TableCell className="text-right tabular-currency align-top pt-3">{fmt(data.totalCredit)}</TableCell>
                    <TableCell colSpan={3} className="border-l border-border/40" />
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <span>{t("periodLabel", { from: formatDate(data.periodStart), to: formatDate(data.periodEnd) })}</span>
              <span>{t("accountsCount", { count: data.rows.length })}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
