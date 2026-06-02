"use client";

/**
 * P22: Anlagenspiegel HGB §284 Abs. 3.
 */

import { useEffect, useState } from "react";
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
import { Printer, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface AnlagenspiegelRow {
  category: string;
  assetCount: number;
  ahkBeginn: number;
  ahkZugaenge: number;
  ahkAbgaenge: number;
  ahkUmbuchungen: number;
  ahkEnde: number;
  afaKumBeginn: number;
  afaJahr: number;
  afaAbgaenge: number;
  afaKumEnde: number;
  buchwertEnde: number;
  buchwertVorjahresEnde: number;
}

interface AnlagenspiegelResult {
  fiscalYear: number;
  rows: AnlagenspiegelRow[];
  totals: AnlagenspiegelRow;
}

function formatEur(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2 });
}

export default function AnlagenspiegelPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnlagenspiegelResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/anlagenspiegel?year=${year}`);
      if (!res.ok) throw new Error("Fehler");
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error("Anlagenspiegel konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Anlagenspiegel"
          description="HGB §284 Abs. 3 — Pflicht-Anhang zur Bilanz, Mehrjahres-Darstellung des Anlagevermögens"
        />
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Wirtschaftsjahr</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!data}>
            <Printer className="mr-2 h-4 w-4" />
            Drucken
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-96 w-full" />}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Wirtschaftsjahr {data.fiscalYear}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2}>Kategorie</TableHead>
                  <TableHead colSpan={5} className="text-center border-l">
                    Anschaffungs-/Herstellungskosten
                  </TableHead>
                  <TableHead colSpan={4} className="text-center border-l">
                    Kumulierte Abschreibungen
                  </TableHead>
                  <TableHead colSpan={2} className="text-center border-l">
                    Buchwerte
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-right text-xs border-l">Beginn</TableHead>
                  <TableHead className="text-right text-xs">Zugang</TableHead>
                  <TableHead className="text-right text-xs">Abgang</TableHead>
                  <TableHead className="text-right text-xs">Umbuch.</TableHead>
                  <TableHead className="text-right text-xs">Ende</TableHead>
                  <TableHead className="text-right text-xs border-l">Beginn</TableHead>
                  <TableHead className="text-right text-xs">Jahres-AfA</TableHead>
                  <TableHead className="text-right text-xs">Abgang</TableHead>
                  <TableHead className="text-right text-xs">Ende</TableHead>
                  <TableHead className="text-right text-xs border-l">Ende</TableHead>
                  <TableHead className="text-right text-xs">Vorjahr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="font-medium">
                      {r.category}
                      <div className="text-xs text-muted-foreground">
                        {r.assetCount} Asset(s)
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm border-l">{formatEur(r.ahkBeginn)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatEur(r.ahkZugaenge)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatEur(r.ahkAbgaenge)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatEur(r.ahkUmbuchungen)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatEur(r.ahkEnde)}</TableCell>
                    <TableCell className="text-right font-mono text-sm border-l">{formatEur(r.afaKumBeginn)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatEur(r.afaJahr)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatEur(r.afaAbgaenge)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatEur(r.afaKumEnde)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold border-l">{formatEur(r.buchwertEnde)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatEur(r.buchwertVorjahresEnde)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/30">
                  <TableCell className="font-bold">
                    {data.totals.category}
                    <div className="text-xs text-muted-foreground">
                      {data.totals.assetCount} Asset(s)
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold border-l">{formatEur(data.totals.ahkBeginn)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.ahkZugaenge)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.ahkAbgaenge)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.ahkUmbuchungen)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.ahkEnde)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold border-l">{formatEur(data.totals.afaKumBeginn)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.afaJahr)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.afaAbgaenge)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">{formatEur(data.totals.afaKumEnde)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold border-l">{formatEur(data.totals.buchwertEnde)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-muted-foreground">{formatEur(data.totals.buchwertVorjahresEnde)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
