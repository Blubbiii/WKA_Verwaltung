"use client";

/**
 * Belegexport für den Steuerberater.
 *
 * Ein Zeitraum, ein Knopf, eine ZIP-Datei mit allen Ausgangsrechnungen und
 * Gutschriften darin — Belege als PDF plus ein Verzeichnis.
 *
 * Ersetzt das Hochladen von Hand in DATEV Unternehmen online. Warum der
 * Export so gebaut ist, steht in `lib/invoices/beleg-export.ts`.
 */

import { useState } from "react";
import { Download, FileArchive, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { downloadFromResponse } from "@/lib/download";

/** Erster und letzter Tag des Vormonats — der Regelfall bei der Übergabe. */
function vormonat(): { von: string; bis: string } {
  const heute = new Date();
  const ersterDiesenMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  const letzterVormonat = new Date(ersterDiesenMonat.getTime() - 86_400_000);
  const ersterVormonat = new Date(
    letzterVormonat.getFullYear(),
    letzterVormonat.getMonth(),
    1,
  );
  const alsText = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { von: alsText(ersterVormonat), bis: alsText(letzterVormonat) };
}

export default function BelegExportSeite() {
  const anfang = vormonat();
  const [von, setVon] = useState(anfang.von);
  const [bis, setBis] = useState(anfang.bis);
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);

  async function exportieren() {
    setLaeuft(true);
    setHinweis(null);
    try {
      const res = await fetch(
        `/api/invoices/beleg-export?von=${von}&bis=${bis}`,
      );

      if (!res.ok) {
        const rumpf = await res.json().catch(() => null);
        throw new Error(
          rumpf?.error || rumpf?.message || `Export fehlgeschlagen (HTTP ${res.status})`,
        );
      }

      const gesamt = res.headers.get("X-Belege-Gesamt") ?? "?";
      const fehlgeschlagen = Number(res.headers.get("X-Belege-Fehlgeschlagen") ?? "0");

      await downloadFromResponse(res, `Belege_${von}_bis_${bis}.zip`);
      toast.success(`${gesamt} Belege exportiert`);

      /*
        Ein fehlgeschlagenes PDF steht im Verzeichnis ohne Dateiverweis. Das
        muss der Nutzer erfahren, BEVOR er die Datei weitergibt — sonst
        merkt es erst der Steuerberater, oder niemand.
      */
      if (fehlgeschlagen > 0) {
        setHinweis(
          `${fehlgeschlagen} Beleg(e) konnten nicht als PDF erzeugt werden. ` +
            `Sie stehen im Verzeichnis, aber ohne Datei — bitte vor der ` +
            `Weitergabe prüfen.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Belegexport"
        description="Ausgangsrechnungen und Gutschriften eines Zeitraums für den Steuerberater"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" aria-hidden />
            Zeitraum wählen
          </CardTitle>
          <CardDescription>
            Sie erhalten eine ZIP-Datei mit den Belegen als PDF und einem
            Verzeichnis im CSV-Format. Entwürfe sind nicht enthalten,
            Stornorechnungen schon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="von">Von</Label>
              <Input
                id="von"
                type="date"
                value={von}
                onChange={(e) => setVon(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bis">Bis</Label>
              <Input
                id="bis"
                type="date"
                value={bis}
                onChange={(e) => setBis(e.target.value)}
              />
            </div>
          </div>

          {hinweis && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertDescription>{hinweis}</AlertDescription>
            </Alert>
          )}

          <Button onClick={exportieren} disabled={laeuft || !von || !bis}>
            <Download className="h-4 w-4" aria-hidden />
            {laeuft ? "Wird erstellt …" : "Belege exportieren"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
