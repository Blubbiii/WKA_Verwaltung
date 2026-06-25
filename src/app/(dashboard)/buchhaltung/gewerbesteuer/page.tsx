"use client";

/**
 * P22: GewSt-Hinzurechnung §8 Nr 1 GewStG — Reports-View.
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { AlertCircle, Printer, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

interface GewStLine {
  key: string;
  label: string;
  aufwand: number;
  quote: number;
  bemessung: number;
}

interface ContributingAccount {
  key: string;
  accountNumber: string;
  accountName: string;
  aufwand: number;
}

interface GewStResult {
  fiscalYear: number;
  lines: GewStLine[];
  summeBemessung: number;
  freibetrag: number;
  ueberFreibetrag: number;
  hinzurechnungsBetrag: number;
  contributingAccounts: ContributingAccount[];
  warnings: string[];
}

function formatEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function GewerbesteuerPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<GewStResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/gewerbesteuer?year=${year}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error("GewSt-Report konnte nicht geladen werden");
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
          title="Gewerbesteuer-Hinzurechnung"
          description="§8 Nr 1 GewStG — Hinzurechnung zum Gewerbeertrag"
        />
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Wirtschaftsjahr</Label>
            <Input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
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
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && (
        <>
          {data.warnings.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Hinzurechnungs-Berechnung */}
          <Card>
            <CardHeader>
              <CardTitle>Hinzurechnungs-Positionen (Wirtschaftsjahr {data.fiscalYear})</CardTitle>
              <CardDescription>
                Aufwand × Quote = Bemessungsgrundlage je Position
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Aufwand</TableHead>
                    <TableHead className="text-center">Quote</TableHead>
                    <TableHead className="text-right">Bemessung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <div className="font-medium">{l.label}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatEur(l.aufwand)} €
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {(l.quote * 100).toFixed(0)} %
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatEur(l.bemessung)} €
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">
                      Summe Bemessungsgrundlagen
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatEur(data.summeBemessung)} €
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      − Freibetrag §8 Nr 1 GewStG
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      −{formatEur(data.freibetrag)} €
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t">
                    <TableCell className="font-semibold">
                      Über Freibetrag
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatEur(data.ueberFreibetrag)} €
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      × 25% (Hinzurechnungs-Quote)
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Ergebnis prominent */}
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Hinzurechnung zum Gewerbeertrag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-bold">
                {formatEur(data.hinzurechnungsBetrag)} €
              </div>
            </CardContent>
          </Card>

          {/* Beitragende Konten (Drill-down) */}
          {data.contributingAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Beitragende Konten</CardTitle>
                <CardDescription>
                  Konten mit gewStAddBackKey-Markierung im LedgerAccount-Stamm
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Konto</TableHead>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead className="text-right">Aufwand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.contributingAccounts.map((a) => (
                      <TableRow key={a.accountNumber}>
                        <TableCell className="font-mono">{a.accountNumber}</TableCell>
                        <TableCell>{a.accountName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {a.key}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatEur(a.aufwand)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
