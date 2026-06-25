"use client";

/**
 * P23: Year-End-Close-Wizard — Jahresabschluss orchestrieren.
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
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
  ChevronRight,
  Loader2,
  Lock,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

interface BilanzPreview {
  summeAktiva: number;
  summePassiva: number;
  differenz: number;
  jahresergebnis: number;
  warnings: string[];
}

interface CarryForwardResult {
  fiscalYear: number;
  nextFiscalYear: number;
  carryForwardCount: number;
  snapshotId: string;
  bilanzBalanced: boolean;
  warnings: string[];
}

function formatEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function YearEndCloseWizardPage() {
  const lastYear = new Date().getFullYear() - 1;
  const [fiscalYear, setFiscalYear] = useState(lastYear);
  const [preview, setPreview] = useState<BilanzPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [allowUnbalanced, setAllowUnbalanced] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<CarryForwardResult | null>(null);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    setResult(null);
    try {
      const asOf = `${fiscalYear}-12-31`;
      const res = await fetch(
        `/api/buchhaltung/bilanz?asOf=${asOf}&fiscalYear=${fiscalYear}`,
      );
      if (!res.ok) throw new Error("Bilanz-Preview fehlgeschlagen");
      const json = await res.json();
      setPreview({
        summeAktiva: json.data.summeAktiva,
        summePassiva: json.data.summePassiva,
        differenz: json.data.differenz,
        jahresergebnis: json.data.jahresergebnis,
        warnings: json.data.warnings,
      });
    } catch {
      toast.error("Bilanz-Preview fehlgeschlagen");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const execute = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/buchhaltung/year-end-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear, allowUnbalanced }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Jahresabschluss fehlgeschlagen");
      }
      const json = await res.json();
      setResult(json.data);
      setConfirmOpen(false);
      toast.success("Jahresabschluss erfolgreich");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Jahresabschluss fehlgeschlagen");
    } finally {
      setIsExecuting(false);
    }
  };

  const isBalanced = preview && Math.abs(preview.differenz) <= 0.01;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jahresabschluss-Wizard"
        description="Saldenvortrag erstellen + Bilanz-Snapshot persistieren + Folgejahr eröffnen"
      />

      {result ? (
        <>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Jahresabschluss erfolgreich</AlertTitle>
            <AlertDescription>
              <div className="space-y-1 text-sm mt-2">
                <div>Geschlossen: {result.fiscalYear}</div>
                <div>Folgejahr: {result.nextFiscalYear}</div>
                <div>Saldenvortrag-Buchungen: {result.carryForwardCount}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  Snapshot-ID: {result.snapshotId}
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {result.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Hinweise</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={() => setResult(null)} variant="outline">
            Neuen Jahresabschluss starten
          </Button>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  1
                </span>
                Wirtschaftsjahr wählen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="space-y-2">
                  <Label>Wirtschaftsjahr (wird abgeschlossen)</Label>
                  <Input
                    type="number"
                    min="2000"
                    max={new Date().getFullYear()}
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(Number(e.target.value))}
                    className="w-32"
                  />
                </div>
                <Button onClick={() => void loadPreview()} disabled={isLoadingPreview}>
                  {isLoadingPreview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Bilanz-Vorschau laden
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saldenvortrag wird für {fiscalYear + 1} angelegt. Folgejahr darf
                noch keine Vorträge haben.
              </p>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                    2
                  </span>
                  Bilanz-Identitäts-Check
                </CardTitle>
                <CardDescription>Stichtag: 31.12.{fiscalYear}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded bg-muted/30">
                    <div className="text-xs text-muted-foreground">Summe Aktiva</div>
                    <div className="font-mono font-semibold">{formatEur(preview.summeAktiva)} €</div>
                  </div>
                  <div className="text-center p-3 rounded bg-muted/30">
                    <div className="text-xs text-muted-foreground">Summe Passiva</div>
                    <div className="font-mono font-semibold">{formatEur(preview.summePassiva)} €</div>
                  </div>
                  <div className={`text-center p-3 rounded ${isBalanced ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                    <div className="text-xs text-muted-foreground">Differenz</div>
                    <div className="font-mono font-bold">{formatEur(preview.differenz)} €</div>
                  </div>
                </div>

                <Alert variant={isBalanced ? "default" : "destructive"}>
                  {isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  <AlertTitle>{isBalanced ? "Bilanz ausgeglichen" : "Bilanz nicht ausgeglichen"}</AlertTitle>
                  <AlertDescription>
                    {isBalanced
                      ? "Jahresabschluss kann durchgeführt werden."
                      : "Empfehlung: Konten-Klassifikation prüfen, vor Abschluss korrigieren."}
                  </AlertDescription>
                </Alert>

                {preview.jahresergebnis !== 0 && (
                  <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>{preview.jahresergebnis > 0 ? "Jahresüberschuss" : "Jahresfehlbetrag"}</AlertTitle>
                    <AlertDescription>
                      Aus laufender Buchhaltung: <span className="font-mono font-semibold">{formatEur(preview.jahresergebnis)} €</span>. Das Ergebnis wird NICHT automatisch ins Eigenkapital vorgetragen — bitte manuelle Umbuchung.
                    </AlertDescription>
                  </Alert>
                )}

                {preview.warnings.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warnungen aus der Bilanz</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {preview.warnings.map((w, i) => (<li key={i}>{w}</li>))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">3</span>
                  Abschluss ausführen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isBalanced && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 p-3 bg-amber-50/40 dark:bg-amber-950/10">
                    <div className="space-y-0.5">
                      <Label htmlFor="unbalanced" className="text-amber-900 dark:text-amber-200">Trotz Differenz fortfahren</Label>
                      <p className="text-xs text-amber-900/70 dark:text-amber-200/70">allowUnbalanced=true — Carry-Forward läuft, Differenz wird ignoriert.</p>
                    </div>
                    <Switch id="unbalanced" checked={allowUnbalanced} onCheckedChange={setAllowUnbalanced} />
                  </div>
                )}

                <Button size="lg" className="w-full" disabled={!isBalanced && !allowUnbalanced} onClick={() => setConfirmOpen(true)}>
                  <Lock className="mr-2 h-4 w-4" />
                  Jahresabschluss ausführen
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jahresabschluss endgültig ausführen?</DialogTitle>
            <DialogDescription>
              Dieser Vorgang erzeugt:
              <ul className="list-disc pl-5 my-3 space-y-1">
                <li>Bilanz-Snapshot zum 31.12.{fiscalYear} (revisionssicher persistiert)</li>
                <li>OpeningBalance-Einträge für Wirtschaftsjahr {fiscalYear + 1}</li>
              </ul>
              <span className="block text-amber-900 dark:text-amber-200 font-medium">
                Idempotenz-Schutz: Wenn für {fiscalYear + 1} bereits Vorträge existieren, wird der Vorgang abgebrochen.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isExecuting}>Abbrechen</Button>
            <Button onClick={execute} disabled={isExecuting}>
              {isExecuting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              Jetzt ausführen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
