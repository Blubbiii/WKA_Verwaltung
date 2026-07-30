"use client";

/**
 * P24: DATEV-EXTF-Export UI.
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
import { Download, Info, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { downloadFromResponse } from "@/lib/download";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useTranslations } from "next-intl";

export default function DatevExportPage() {
  const tRange = useTranslations("common.dateRange");
  const lastYear = new Date().getFullYear() - 1;
  const [from, setFrom] = useState(`${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31`);
  const [consultantNumber, setConsultantNumber] = useState(99999);
  const [clientNumber, setClientNumber] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    fileName: string;
    recordCount: string;
  } | null>(null);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/datev-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          datevConsultantNumber: consultantNumber,
          datevClientNumber: clientNumber,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Export fehlgeschlagen");
      }

      const recordCount = res.headers.get("X-DATEV-Record-Count") || "?";
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "EXTF_Buchungsstapel.csv";

      await downloadFromResponse(res, fileName);

      setLastResult({ fileName, recordCount });
      toast.success("DATEV-Export erstellt und heruntergeladen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DATEV-Export (EXTF)"
        description="Buchungsstapel im DATEV-Standardformat für Steuerberater-Import"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Format-Hinweis</AlertTitle>
        <AlertDescription>
          DATEV EXTF (Format-Version 700, Kategorie 21 Buchungsstapel).
          Die CSV-Datei kann direkt im DATEV-Rechnungswesen-Modul importiert
          werden. Mandanten- und Beraternummer werden vom Steuerberater
          vergeben.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>DATEV-Identifikation</CardTitle>
          <CardDescription>
            Vom Steuerberater vergebene Nummern
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Berater-Nummer</Label>
            <Input
              type="number"
              value={consultantNumber}
              onChange={(e) => setConsultantNumber(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Mandanten-Nummer</Label>
            <Input
              type="number"
              value={clientNumber}
              onChange={(e) => setClientNumber(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export-Zeitraum</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            {/* Bedienaufwand #18 (Audit 2026-07): Zeitraum mit Schnellauswahl.
                Vorher zwei rohe Date-Felder ohne jedes Preset — fuer "letztes
                Quartal" viermal im Monat von Hand getippt. */}
            <div className="space-y-2 sm:col-span-2">
              <Label>{tRange("label")}</Label>
              <DateRangePicker
                value={{ from, to }}
                onChange={(range) => {
                  setFrom(range.from);
                  setTo(range.to);
                }}
              />
            </div>
            <Button onClick={handleExport} disabled={isLoading} size="lg">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              CSV herunterladen
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
              <div>Buchungen: {lastResult.recordCount}</div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
