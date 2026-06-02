"use client";

/**
 * P22: Kontoblatt / Kontoausdruck — Steuerberater-Standardreport.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Printer, RefreshCw, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface KontoblattLine {
  reference: string | null;
  entryDate: string;
  description: string;
  gegenkonto: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
  journalEntryId: string;
}

interface KontoblattResult {
  accountNumber: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: KontoblattLine[];
}

function formatEur(n: number, suppressZero = true): string {
  if (suppressZero && n === 0) return "—";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function KontoblattPage() {
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);

  const [account, setAccount] = useState("");
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<KontoblattResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    if (!account) {
      toast.error("Bitte Konto angeben");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/buchhaltung/kontoblatt?account=${encodeURIComponent(account)}&from=${from}&to=${to}`,
      );
      if (!res.ok) throw new Error("Fehler");
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error("Kontoblatt konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Kontoblatt"
          description="Alle Buchungen eines Kontos chronologisch mit laufendem Saldo"
        />
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-2">
            <Label>Konto</Label>
            <Input
              placeholder="z.B. 1200"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Von</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bis</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void load()} disabled={isLoading} className="flex-1">
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Laden
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-96 w-full" />}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span className="font-mono">{data.accountNumber}</span>
              <span>{data.accountName}</span>
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Zeitraum: {data.periodStart.slice(0, 10)} bis {data.periodEnd.slice(0, 10)}
            </div>
          </CardHeader>
          <CardContent>
            {/* Saldo-Übersicht */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Anfangssaldo</div>
                <div className="font-mono font-semibold">
                  {formatEur(data.openingBalance, false)} €
                </div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Summe Soll</div>
                <div className="font-mono font-semibold">
                  {formatEur(data.totalDebit, false)} €
                </div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Summe Haben</div>
                <div className="font-mono font-semibold">
                  {formatEur(data.totalCredit, false)} €
                </div>
              </div>
              <div className="text-center p-3 bg-primary/10 rounded">
                <div className="text-xs text-muted-foreground">Endsaldo</div>
                <div className="font-mono font-bold">
                  {formatEur(data.closingBalance, false)} €
                </div>
              </div>
            </div>

            {data.lines.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Keine Buchungen in diesem Zeitraum
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Beleg</TableHead>
                    <TableHead>Buchungstext</TableHead>
                    <TableHead>Gegenkonto</TableHead>
                    <TableHead className="text-right">Soll</TableHead>
                    <TableHead className="text-right">Haben</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((l, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm font-mono">
                        {l.entryDate.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {l.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" title={l.description}>
                        {l.description}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {l.gegenkonto ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatEur(l.debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatEur(l.credit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatEur(l.runningBalance, false)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
