"use client";

/**
 * P22: Bilanz-View nach HGB §266 — Aktiva/Passiva mit Identitäts-Check.
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Printer,
  Scale,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

interface BilanzLine {
  accountNumber: string;
  accountName: string;
  amount: number;
}

interface BilanzGroup {
  section: string;
  label: string;
  accounts: BilanzLine[];
  total: number;
}

interface BilanzResult {
  asOf: string;
  fiscalYear: number;
  aktiva: BilanzGroup[];
  passiva: BilanzGroup[];
  jahresergebnis: number;
  summeAktiva: number;
  summePassiva: number;
  differenz: number;
  warnings: string[];
}

function formatEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BilanzPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<BilanzResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const url = `/api/buchhaltung/bilanz?asOf=${asOf}&fiscalYear=${fiscalYear}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error("Bilanz konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Bilanz"
          description="HGB §266 — Vermögensgegenstände (Aktiva) und Mittelherkunft (Passiva)"
        />
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Stichtag wählen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Stichtag</Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Wirtschaftsjahr</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <Button onClick={() => void load()} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!data}>
              <Printer className="mr-2 h-4 w-4" />
              Drucken
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && (
        <>
          {/* Identitäts-Status */}
          {Math.abs(data.differenz) > 0.01 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Bilanz nicht ausgeglichen</AlertTitle>
              <AlertDescription>
                Differenz {formatEur(data.differenz)} € zwischen Aktiva (
                {formatEur(data.summeAktiva)} €) und Passiva (
                {formatEur(data.summePassiva)} €). Bitte Konten-Klassifikation prüfen.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Bilanz ausgeglichen</AlertTitle>
              <AlertDescription>
                Summe Aktiva = Summe Passiva = {formatEur(data.summeAktiva)} €
              </AlertDescription>
            </Alert>
          )}

          {data.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warnungen</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
            {/* AKTIVA */}
            <Card>
              <CardHeader className="bg-blue-50 dark:bg-blue-950/30 print:bg-transparent">
                <CardTitle className="flex items-center justify-between">
                  <span>AKTIVA</span>
                  <Badge variant="default" className="font-mono">
                    {formatEur(data.summeAktiva)} €
                  </Badge>
                </CardTitle>
                <CardDescription>Vermögensgegenstände</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.aktiva.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    Keine Aktiv-Positionen
                  </div>
                ) : (
                  <div className="divide-y">
                    {data.aktiva.map((g) => (
                      <div key={g.section} className="p-4">
                        <div className="flex items-center justify-between font-semibold mb-2">
                          <span className="text-sm">{g.label}</span>
                          <span className="font-mono text-sm">
                            {formatEur(g.total)} €
                          </span>
                        </div>
                        <div className="space-y-1 pl-3">
                          {g.accounts.map((a) => (
                            <div
                              key={a.accountNumber}
                              className="flex items-center justify-between text-sm text-muted-foreground"
                            >
                              <span>
                                <span className="font-mono mr-2">
                                  {a.accountNumber}
                                </span>
                                {a.accountName}
                              </span>
                              <span className="font-mono">
                                {formatEur(a.amount)} €
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PASSIVA */}
            <Card>
              <CardHeader className="bg-amber-50 dark:bg-amber-950/30 print:bg-transparent">
                <CardTitle className="flex items-center justify-between">
                  <span>PASSIVA</span>
                  <Badge variant="secondary" className="font-mono">
                    {formatEur(data.summePassiva)} €
                  </Badge>
                </CardTitle>
                <CardDescription>Eigen- und Fremdkapital</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.passiva.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    Keine Passiv-Positionen
                  </div>
                ) : (
                  <div className="divide-y">
                    {data.passiva.map((g) => (
                      <div key={g.section} className="p-4">
                        <div className="flex items-center justify-between font-semibold mb-2">
                          <span className="text-sm">{g.label}</span>
                          <span className="font-mono text-sm">
                            {formatEur(g.total)} €
                          </span>
                        </div>
                        <div className="space-y-1 pl-3">
                          {g.accounts.map((a) => (
                            <div
                              key={a.accountNumber}
                              className="flex items-center justify-between text-sm text-muted-foreground"
                            >
                              <span>
                                <span className="font-mono mr-2">
                                  {a.accountNumber}
                                </span>
                                {a.accountName}
                              </span>
                              <span className="font-mono">
                                {formatEur(a.amount)} €
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Jahresergebnis prominent */}
          {data.jahresergebnis !== 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  {data.jahresergebnis > 0
                    ? "Jahresüberschuss"
                    : "Jahresfehlbetrag"}
                </CardTitle>
                <CardDescription>
                  Aus der laufenden Buchhaltung berechnet (Erlöse − Aufwand)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-bold">
                  {formatEur(data.jahresergebnis)} €
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
