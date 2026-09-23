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
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
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
import { belegExportDateiname, type Zeitraum } from "@/lib/invoices/beleg-zeitraum";

/** Erster und letzter Tag des Vormonats — der Regelfall bei der Übergabe. */
function vormonat(): Zeitraum {
  const heute = new Date();
  const ersterDiesenMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  const letzterVormonat = new Date(ersterDiesenMonat.getTime() - 86_400_000);
  const ersterVormonat = new Date(
    letzterVormonat.getFullYear(),
    letzterVormonat.getMonth(),
    1,
  );
  // Ortszeit des Browsers ist hier richtig: „Vormonat" meint den Monat, in
  // dem der Nutzer lebt.
  const alsText = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { von: alsText(ersterVormonat), bis: alsText(letzterVormonat) };
}

interface ExportErgebnis {
  gesamt: string;
  fehlgeschlagen: number;
}

export default function BelegExportSeite() {
  const t = useTranslations("belegExport");
  const [zeitraum, setZeitraum] = useState<Zeitraum>(vormonat);
  const [fehlendePdfs, setFehlendePdfs] = useState(0);

  const exportieren = useMutation({
    mutationFn: async ({ von, bis }: Zeitraum): Promise<ExportErgebnis> => {
      const res = await fetch(
        `/api/invoices/beleg-export?von=${encodeURIComponent(von)}&bis=${encodeURIComponent(bis)}`,
      );
      if (!res.ok) {
        const rumpf = await res.json().catch(() => null);
        throw new Error(rumpf?.error || t("errorHttp", { status: res.status }));
      }
      const ergebnis = {
        gesamt: res.headers.get("X-Belege-Gesamt") ?? "?",
        fehlgeschlagen: Number(res.headers.get("X-Belege-Fehlgeschlagen") ?? "0"),
      };
      await downloadFromResponse(res, belegExportDateiname({ von, bis }));
      return ergebnis;
    },
    onMutate: () => setFehlendePdfs(0),
    onSuccess: ({ gesamt, fehlgeschlagen }) => {
      toast.success(t("success", { count: gesamt }));
      /*
        Ein fehlgeschlagenes PDF steht im Verzeichnis ohne Dateiverweis. Das
        muss der Nutzer erfahren, BEVOR er die Datei weitergibt — sonst
        merkt es erst der Steuerberater, oder niemand.
      */
      setFehlendePdfs(fehlgeschlagen);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("errorFallback")),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" aria-hidden />
            {t("cardTitle")}
          </CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="von">{t("from")}</Label>
              <Input
                id="von"
                type="date"
                value={zeitraum.von}
                onChange={(e) => setZeitraum((z) => ({ ...z, von: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bis">{t("to")}</Label>
              <Input
                id="bis"
                type="date"
                value={zeitraum.bis}
                onChange={(e) => setZeitraum((z) => ({ ...z, bis: e.target.value }))}
              />
            </div>
          </div>

          {fehlendePdfs > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertDescription>{t("pdfMissing", { count: fehlendePdfs })}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={() => exportieren.mutate(zeitraum)}
            disabled={exportieren.isPending || !zeitraum.von || !zeitraum.bis}
          >
            <Download className="h-4 w-4" aria-hidden />
            {exportieren.isPending ? t("running") : t("submit")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
