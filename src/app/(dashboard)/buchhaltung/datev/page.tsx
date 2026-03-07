"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Search, Loader2 } from "lucide-react";

interface PreviewData {
  journalEntries: number;
  outgoingInvoices: number;
  incomingInvoices: number;
  periodStart: string;
  periodEnd: string;
}

function defaultPeriod(): { from: string; to: string } {
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

export default function DatevExportPage() {
  const defaults = defaultPeriod();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [mode, setMode] = useState<"journal" | "invoices" | "both">("journal");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/datev?preview=true&from=${from}&to=${to}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      setPreview(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Laden der Vorschau");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/buchhaltung/datev?from=${from}&to=${to}&mode=${mode}`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] || `EXTF_Export_${from}_${to}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const count = res.headers.get("X-Export-Count");
      toast.success(`DATEV-Export heruntergeladen (${count} Eintraege)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export fehlgeschlagen");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="DATEV-Export" description="Buchungsstapel (EXTF) fuer den Steuerberater exportieren" />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <Label>Von</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bis</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Export-Modus</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="journal">Journal-Buchungen</SelectItem>
                  <SelectItem value="invoices">Nur Rechnungen</SelectItem>
                  <SelectItem value="both">Kombiniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadPreview} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Vorschau
              </Button>
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Journal-Buchungen</div>
              <div className="text-2xl font-bold">{preview.journalEntries}</div>
              <Badge variant={preview.journalEntries > 0 ? "default" : "secondary"} className="mt-1">
                {preview.journalEntries > 0 ? "Verfuegbar" : "Keine"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Ausgangsrechnungen</div>
              <div className="text-2xl font-bold">{preview.outgoingInvoices}</div>
              <Badge variant={preview.outgoingInvoices > 0 ? "default" : "secondary"} className="mt-1">
                SENT / PAID
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Eingangsrechnungen</div>
              <div className="text-2xl font-bold">{preview.incomingInvoices}</div>
              <Badge variant={preview.incomingInvoices > 0 ? "default" : "secondary"} className="mt-1">
                APPROVED / PAID
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">Hinweise zum DATEV-Import</h3>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
            <li><strong>Format:</strong> EXTF v510, Kategorie 21 (Buchungsstapel), UTF-8 mit BOM</li>
            <li><strong>Journal-Buchungen</strong> enthalten alle gebuchten Eintraege (Auto-Buchungen bei Rechnungsversand, AfA, manuelle Buchungen)</li>
            <li><strong>Nur Rechnungen</strong> exportiert Ausgangsrechnungen direkt (ohne JournalEntry-Umweg)</li>
            <li><strong>Kombiniert</strong> exportiert Journal-Buchungen + Rechnungen die noch nicht gebucht wurden</li>
            <li>Kontenzuordnung basiert auf dem SKR03-Kontenrahmen (konfigurierbar unter Einstellungen)</li>
            <li>Die CSV-Datei kann direkt in DATEV Unternehmen Online oder DATEV Kanzlei-Rechnungswesen importiert werden</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
