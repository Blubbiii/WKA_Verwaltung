"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { RefreshCw, Download } from "lucide-react";

interface ZmLine {
  countryCode: string;
  vatId: string;
  recipientName: string;
  type: "L" | "S";
  amount: number;
}

interface ZmResult {
  lines: ZmLine[];
  periodStart: string;
  periodEnd: string;
  quarter: number;
  year: number;
  totalAmount: number;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Österreich", BE: "Belgien", BG: "Bulgarien", CY: "Zypern",
  CZ: "Tschechien", DK: "Dänemark", EE: "Estland", ES: "Spanien",
  FI: "Finnland", FR: "Frankreich", GR: "Griechenland", HR: "Kroatien",
  HU: "Ungarn", IE: "Irland", IT: "Italien", LT: "Litauen",
  LU: "Luxemburg", LV: "Lettland", MT: "Malta", NL: "Niederlande",
  PL: "Polen", PT: "Portugal", RO: "Rumänien", SE: "Schweden",
  SI: "Slowenien", SK: "Slowakei",
};

function buildQuarterOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const year = now.getFullYear();

  for (let y = year; y >= year - 2; y--) {
    for (let q = 4; q >= 1; q--) {
      if (y === year && q > Math.ceil((now.getMonth() + 1) / 3)) continue;
      const from = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
      const toMonth = q * 3;
      const toDay = new Date(y, toMonth, 0).getDate();
      const to = `${y}-${String(toMonth).padStart(2, "0")}-${toDay}`;
      options.push({
        value: `${from}|${to}`,
        label: `Q${q} ${y}`,
      });
    }
  }
  return options;
}

export default function ZmPage() {
  const [data, setData] = useState<ZmResult | null>(null);
  const [loading, setLoading] = useState(true);

  const quarterOptions = buildQuarterOptions();
  const [selectedQuarter, setSelectedQuarter] = useState(quarterOptions[0]?.value || "");

  const fetchData = useCallback(async () => {
    if (!selectedQuarter) return;
    setLoading(true);
    try {
      const [from, to] = selectedQuarter.split("|");
      const res = await fetch(`/api/buchhaltung/zm?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || null);
    } catch {
      toast.error("ZM konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [selectedQuarter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function downloadXml() {
    if (!selectedQuarter) return;
    const [from, to] = selectedQuarter.split("|");
    window.open(`/api/buchhaltung/zm/xml?from=${from}&to=${to}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zusammenfassende Meldung (ZM)"
        description="Innergemeinschaftliche Umsätze für die Meldung an das BZSt"
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1 min-w-[160px]">
              <Label>Meldezeitraum</Label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {quarterOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
            </Button>
            <Button variant="outline" onClick={downloadXml} disabled={!data || data.lines.length === 0}>
              <Download className="h-4 w-4 mr-2" />XML herunterladen
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data || data.lines.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Keine innergemeinschaftlichen Umsätze im gewählten Zeitraum.
              <br />
              <span className="text-xs">Hinweis: Rechnungen benötigen Land und USt-IdNr des Empfängers.</span>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Land</TableHead>
                      <TableHead>USt-IdNr</TableHead>
                      <TableHead>Empfänger</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead className="text-right">Bemessungsgrundlage (€)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{line.countryCode}</span>
                            <span className="text-xs text-muted-foreground">
                              {COUNTRY_NAMES[line.countryCode] || ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{line.vatId}</TableCell>
                        <TableCell>{line.recipientName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {line.type === "L" ? "Lieferung" : "Leistung"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(line.amount)}</TableCell>
                      </TableRow>
                    ))}

                    {/* Total */}
                    <TableRow className="font-bold border-t-2 bg-muted/30">
                      <TableCell colSpan={4}>Gesamt</TableCell>
                      <TableCell className="text-right font-mono">{fmt(data.totalAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Meldezeitraum: Q{data.quarter}/{data.year} · {data.lines.length} Meldepositionen · Beträge in vollen Euro
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
