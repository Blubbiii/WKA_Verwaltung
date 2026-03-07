"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format";
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
import { RefreshCw } from "lucide-react";

interface UstvaLine {
  kennzahl: string;
  label: string;
  amount: number;
  taxAmount: number;
}

interface UstvaResult {
  lines: UstvaLine[];
  periodStart: string;
  periodEnd: string;
  totalTaxPayable: number;
  totalInputTax: number;
  balance: number;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentQuarter(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const startMonth = q * 3;
  const endMonth = startMonth + 2;
  const lastDay = new Date(y, endMonth + 1, 0).getDate();
  return {
    from: `${y}-${String(startMonth + 1).padStart(2, "0")}-01`,
    to: `${y}-${String(endMonth + 1).padStart(2, "0")}-${lastDay}`,
  };
}

export default function UstvaPage() {
  const [data, setData] = useState<UstvaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentQuarter();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/ustva?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("UStVA konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader title="Umsatzsteuervoranmeldung (UStVA)" description="ELSTER-Kennzahlen fuer den Voranmeldungszeitraum" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1"><Label>Von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />Aktualisieren</Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data ? (
            <div className="text-center text-muted-foreground py-12">Keine Daten vorhanden.</div>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">KZ</TableHead>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead className="text-right">Bemessungsgrundlage</TableHead>
                      <TableHead className="text-right">Steuerbetrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lines.map((line) => (
                      <TableRow key={line.kennzahl}>
                        <TableCell className="font-mono font-semibold">{line.kennzahl}</TableCell>
                        <TableCell>{line.label}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(line.amount)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(line.taxAmount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell colSpan={3} className="text-right">USt-Zahllast:</TableCell>
                      <TableCell className="text-right font-mono">{fmt(data.totalTaxPayable)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold">
                      <TableCell colSpan={3} className="text-right">Vorsteuerabzug:</TableCell>
                      <TableCell className="text-right font-mono text-green-600 dark:text-green-400">-{fmt(data.totalInputTax)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold text-lg border-t-2">
                      <TableCell colSpan={3} className="text-right">
                        {data.balance >= 0 ? "Zahllast:" : "Erstattung:"}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${data.balance < 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmt(Math.abs(data.balance))} EUR
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Zeitraum: {formatDate(data.periodStart)} - {formatDate(data.periodEnd)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
