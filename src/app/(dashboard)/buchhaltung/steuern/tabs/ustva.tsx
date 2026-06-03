"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";

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

interface ElsterPrepResponse {
  payload: {
    datenart: string;
    schemaVersion: string;
    header: {
      steuernummer: string;
      zeitraum: string;
      steuerjahr: string;
      berichtigt: boolean;
      unternehmen: { name: string };
    };
    kennzahlen: Record<string, number>;
    zahllastEur: number;
  };
  errors: string[];
  warnings: string[];
  summary: {
    kennzahlCount: number;
    netTotal: number;
    taxTotal: number;
    zahllast: number;
  };
  transmitted: false;
  note: string;
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

function inferZeitraum(from: string, to: string): { zeitraum: string; steuerjahr: string } {
  const start = new Date(from);
  const end = new Date(to);
  const y = String(start.getFullYear());
  // Monat: gleicher Monat
  if (start.getMonth() === end.getMonth() && start.getDate() === 1) {
    return { zeitraum: String(start.getMonth() + 1).padStart(2, "0"), steuerjahr: y };
  }
  // Quartal
  const q = Math.floor(start.getMonth() / 3);
  const qEnd = q * 3 + 2;
  if (start.getMonth() === q * 3 && start.getDate() === 1 && end.getMonth() === qEnd) {
    return { zeitraum: `Q${q + 1}`, steuerjahr: y };
  }
  return { zeitraum: String(start.getMonth() + 1).padStart(2, "0"), steuerjahr: y };
}

export default function UstvaContent() {
  const t = useTranslations("buchhaltung.steuernUstva");
  const [data, setData] = useState<UstvaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const defaults = currentQuarter();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const [elsterOpen, setElsterOpen] = useState(false);
  const [elsterLoading, setElsterLoading] = useState(false);
  const [elsterResult, setElsterResult] = useState<ElsterPrepResponse | null>(null);
  const [steuernummer, setSteuernummer] = useState("");
  const [berichtigt, setBerichtigt] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/ustva?from=${from}&to=${to}`);
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

  const runElsterPrep = async () => {
    if (!steuernummer.trim()) {
      toast.error("Steuernummer erforderlich");
      return;
    }
    setElsterLoading(true);
    try {
      const { zeitraum, steuerjahr } = inferZeitraum(from, to);
      const res = await fetch("/api/buchhaltung/ustva/elster-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          steuernummer: steuernummer.trim(),
          zeitraum,
          steuerjahr,
          berichtigt,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "ELSTER-Prep fehlgeschlagen");
      }
      const json: ElsterPrepResponse = await res.json();
      setElsterResult(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ELSTER-Prep fehlgeschlagen");
    } finally {
      setElsterLoading(false);
    }
  };

  const openElsterDialog = () => {
    setElsterResult(null);
    setElsterOpen(true);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
          <div className="space-y-1"><Label>{t("from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" />{t("refreshBtn")}</Button>
          <Button
            variant="default"
            onClick={openElsterDialog}
            disabled={!data || data.lines.length === 0}
          >
            <FileCheck className="h-4 w-4 mr-2" />
            ELSTER vorbereiten
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data ? (
          <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">{t("colKennzahl")}</TableHead>
                    <TableHead>{t("colLabel")}</TableHead>
                    <TableHead className="text-right">{t("colBase")}</TableHead>
                    <TableHead className="text-right">{t("colTax")}</TableHead>
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
                    <TableCell colSpan={3} className="text-right">{t("totalTaxPayable")}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totalTaxPayable)}</TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell colSpan={3} className="text-right">{t("totalInputTax")}</TableCell>
                    <TableCell className="text-right font-mono text-green-600 dark:text-green-400">-{fmt(data.totalInputTax)}</TableCell>
                  </TableRow>
                  <TableRow className="font-bold text-lg border-t-2">
                    <TableCell colSpan={3} className="text-right">
                      {data.balance >= 0 ? t("balancePayable") : t("balanceRefund")}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${data.balance < 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmt(Math.abs(data.balance))} EUR
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              {t("periodLabel", { from: formatDate(data.periodStart), to: formatDate(data.periodEnd) })}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={elsterOpen} onOpenChange={setElsterOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              ELSTER-Vorbereitung UStVA
            </DialogTitle>
            <DialogDescription>
              Erstellt das ERiC-konforme JSON-Payload für die UStVA-Übermittlung.
              Die tatsächliche Übermittlung an ELSTER erfordert die ERiC-Library
              der Finanzverwaltung und wird in einem separaten Schritt erfolgen.
            </DialogDescription>
          </DialogHeader>

          {!elsterResult ? (
            <div className="space-y-4 py-2">
              <Alert>
                <Send className="h-4 w-4" />
                <AlertTitle>Skelett-Modus</AlertTitle>
                <AlertDescription>
                  Dieser Vorgang generiert das vollständige Payload, sendet
                  aber NICHTS an die Finanzverwaltung. Die ERiC-Integration
                  ist in einer späteren Phase geplant.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Steuernummer (Bundesland-Format)</Label>
                <Input
                  value={steuernummer}
                  onChange={(e) => setSteuernummer(e.target.value)}
                  placeholder="z.B. 12345/67890"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="berichtigt"
                  checked={berichtigt}
                  onChange={(e) => setBerichtigt(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="berichtigt" className="cursor-pointer">
                  Berichtigte Anmeldung (korrigiert eine frühere Meldung)
                </Label>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              {elsterResult.errors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Übermittlung blockiert</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 mt-1">
                      {elsterResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Payload bereit</AlertTitle>
                  <AlertDescription>
                    Das ERiC-Payload ist vollständig und könnte technisch
                    übermittelt werden. Die Übermittlung ist im aktuellen
                    Skelett-Modus deaktiviert.
                  </AlertDescription>
                </Alert>
              )}

              {elsterResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Hinweise</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 mt-1">
                      {elsterResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">Datenart</div>
                  <div>
                    <Badge variant="outline">{elsterResult.payload.datenart}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Schema-Version</div>
                  <div className="font-mono text-xs">{elsterResult.payload.schemaVersion}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Zeitraum</div>
                  <div className="font-mono">
                    {elsterResult.payload.header.zeitraum}/{elsterResult.payload.header.steuerjahr}
                    {elsterResult.payload.header.berichtigt && (
                      <Badge variant="secondary" className="ml-2">berichtigt</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Steuernummer</div>
                  <div className="font-mono text-xs">{elsterResult.payload.header.steuernummer}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Kennzahlen</div>
                  <div className="font-mono">{elsterResult.summary.kennzahlCount}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Zahllast</div>
                  <div className={`font-mono ${elsterResult.summary.zahllast < 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {fmt(elsterResult.summary.zahllast)} EUR
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Kennzahlen-Payload</Label>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48">
                  {JSON.stringify(elsterResult.payload.kennzahlen, null, 2)}
                </pre>
              </div>

              <div className="text-xs text-muted-foreground italic">
                {elsterResult.note}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setElsterOpen(false)}>
              Schließen
            </Button>
            {!elsterResult && (
              <Button onClick={() => void runElsterPrep()} disabled={elsterLoading}>
                {elsterLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileCheck className="h-4 w-4 mr-2" />
                )}
                Payload erzeugen
              </Button>
            )}
            {elsterResult && (
              <Button variant="outline" onClick={() => setElsterResult(null)}>
                Neu erzeugen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
