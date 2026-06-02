"use client";

/**
 * P22: GoBD Z3-Export UI — Datenträgerüberlassung §147 Abs. 6 AO.
 */

import { useState } from "react";
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
import { toast } from "sonner";
import { Download, Info, Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default function GobdExportPage() {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const [from, setFrom] = useState(`${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31`);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    fileName: string;
    fileHash: string;
    recordCount: string;
  } | null>(null);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/gobd-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Export fehlgeschlagen");
      }

      const fileHash = res.headers.get("X-GoBD-File-Hash") || "";
      const recordCount = res.headers.get("X-GoBD-Total-Records") || "?";
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? `gobd-z3-${from}-${to}.zip`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastResult({ fileName, fileHash, recordCount });
      toast.success("GoBD-Z3-Export erstellt und heruntergeladen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="GoBD Z3-Export"
        description="Datenträgerüberlassung §147 Abs. 6 AO im IDEA-Format für Betriebsprüfung"
      />

      <Alert className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
        <ShieldAlert className="h-4 w-4 text-amber-900 dark:text-amber-200" />
        <AlertTitle className="text-amber-900 dark:text-amber-200">
          Hinweis zur Verwendung
        </AlertTitle>
        <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
          Der GoBD-Z3-Export wird ausschließlich bei Betriebsprüfung an den
          Prüfer übergeben. Das ZIP enthält Journal, Rechnungen, Sachkonten und
          Saldenvorträge als IDEA-CSV plus index.xml + DTD. Der SHA-256-Hash
          der erzeugten Datei wird im Audit-Log persistiert.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Export-Zeitraum</CardTitle>
          <CardDescription>
            Üblich: ein abgeschlossenes Wirtschaftsjahr
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-2">
              <Label>Von</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bis</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button onClick={handleExport} disabled={isLoading} size="lg">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              ZIP herunterladen
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Letzter Export</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-sm font-mono mt-2">
              <div>Datei: {lastResult.fileName}</div>
              <div>SHA-256: {lastResult.fileHash}</div>
              <div>Datensätze gesamt: {lastResult.recordCount}</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Enthaltene Tabellen</CardTitle>
          <CardDescription>
            Pro Tabelle eine CSV-Datei + index.xml + gdpdu-01-08-2002.dtd
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">journal_entries.csv</code>
              <span>Buchungsjournal (POSTED Entries)</span>
            </li>
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">journal_entry_lines.csv</code>
              <span>Buchungspositionen (Soll/Haben)</span>
            </li>
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">invoices.csv</code>
              <span>Ausgangsrechnungen</span>
            </li>
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">incoming_invoices.csv</code>
              <span>Eingangsrechnungen</span>
            </li>
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">ledger_accounts.csv</code>
              <span>Sachkontenstamm</span>
            </li>
            <li className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded">opening_balances.csv</code>
              <span>Saldenvortrag (Eröffnungsbilanz)</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
