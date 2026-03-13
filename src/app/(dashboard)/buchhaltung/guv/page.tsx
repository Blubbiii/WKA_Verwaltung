"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentYear(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function GuvPage() {
  const [data, setData] = useState<GuvResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentYear();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/guv?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("GuV konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function exportCsv() {
    if (!data) return;
    const header = "Nr;Position;Aktuell;Vorjahr\n";
    const rows = data.lines.map((l) =>
      [l.position || "", l.label, fmt(l.currentPeriod), fmt(l.previousPeriod)].join(";")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuV_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gewinn- und Verlustrechnung (GuV)"
        description="Gesamtkostenverfahren nach HGB §275"
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1"><Label>Von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Aktualisieren</Button>
            <Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 15 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data ? (
            <div className="text-center text-muted-foreground py-12">Keine Daten vorhanden.</div>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Nr</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead className="text-right">Aktueller Zeitraum</TableHead>
                      <TableHead className="text-right">Vorjahr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lines.map((line, i) => (
                      <TableRow
                        key={i}
                        className={line.isSummary ? "font-bold border-t-2 bg-muted/30" : ""}
                      >
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {line.position || ""}
                        </TableCell>
                        <TableCell className={line.indent ? "pl-8" : ""}>
                          {line.label}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${line.currentPeriod < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {fmt(line.currentPeriod)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {fmt(line.previousPeriod)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex justify-end gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Jahresergebnis: </span>
                  <span className={`font-bold font-mono ${data.netIncome < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {fmt(data.netIncome)} EUR
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Vorjahr: </span>
                  <span className="font-mono text-muted-foreground">{fmt(data.previousNetIncome)} EUR</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
