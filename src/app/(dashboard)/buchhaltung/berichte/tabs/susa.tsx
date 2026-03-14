"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format";
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

const CATEGORY_LABELS: Record<string, string> = {
  ASSET: "Aktiva",
  LIABILITY: "Passiva",
  EQUITY: "Eigenkapital",
  REVENUE: "Ertraege",
  EXPENSE: "Aufwendungen",
};

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SuSaContent() {
  const [data, setData] = useState<SuSaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/buchhaltung/susa?${params}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("SuSa konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCsv() {
    if (!data) return;
    const header = "Konto;Name;Kategorie;EB Soll;EB Haben;Soll;Haben;Schluss Soll;Schluss Haben;Saldo\n";
    const rows = data.rows.map((r) =>
      [
        r.accountNumber,
        `"${r.accountName}"`,
        CATEGORY_LABELS[r.category] || r.category,
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
            <Label>Von</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Bis</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data || data.rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV-Export
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
            Keine Buchungsdaten fuer den gewaehlten Zeitraum vorhanden.
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Konto</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="w-[100px]">Kategorie</TableHead>
                    <TableHead className="text-right w-[100px]">EB Soll</TableHead>
                    <TableHead className="text-right w-[100px]">EB Haben</TableHead>
                    <TableHead className="text-right w-[100px]">Soll</TableHead>
                    <TableHead className="text-right w-[100px]">Haben</TableHead>
                    <TableHead className="text-right w-[110px]">Schluss Soll</TableHead>
                    <TableHead className="text-right w-[110px]">Schluss Haben</TableHead>
                    <TableHead className="text-right w-[100px]">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.accountNumber}>
                      <TableCell className="font-mono font-semibold">{row.accountNumber}</TableCell>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[row.category] || row.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.openingDebit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.openingCredit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.periodDebit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.periodCredit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.closingDebit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.closingCredit)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${row.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmt(row.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={5} className="text-right">Summe Bewegungen:</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totalCredit)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <span>Zeitraum: {formatDate(data.periodStart)} - {formatDate(data.periodEnd)}</span>
              <span>{data.rows.length} Konten</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
