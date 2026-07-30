"use client";

/**
 * E-Bilanz §5b EStG — XBRL-Export für die ELSTER-Übermittlung.
 *
 * TF-11 (Audit 2026-07): `/api/buchhaltung/ebilanz` war vollständig
 * implementiert und hatte keinen einzigen UI-Aufrufer. Eine gesetzliche
 * Übermittlungspflicht ohne Oberfläche.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Download, Loader2, Info } from "lucide-react";
import { downloadFromResponse } from "@/lib/download";

/** Rechtsform-Schlüssel der Taxonomie (KS = Kapital-, PE = Personen-, EU = Einzelunternehmen). */
const LEGAL_FORMS = ["KS", "PE", "EU"] as const;
type LegalForm = (typeof LEGAL_FORMS)[number];

export default function EBilanzContent() {
  const t = useTranslations("buchhaltung.abschlussEbilanz");

  // Vorbelegung: abgelaufenes Geschäftsjahr — das ist das, was übermittelt wird.
  const lastYear = new Date().getFullYear() - 1;
  const [fiscalYear, setFiscalYear] = useState(String(lastYear));
  const [asOf, setAsOf] = useState(`${lastYear}-12-31`);
  const [taxNumber, setTaxNumber] = useState("");
  const [vatId, setVatId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [legalForm, setLegalForm] = useState<LegalForm>("KS");
  const [downloading, setDownloading] = useState(false);

  // Serverseitiges Minimum aus dem Zod-Schema, hier gespiegelt damit der User
  // nicht erst am 400 scheitert.
  const taxNumberValid = taxNumber.trim().length >= 5;

  async function handleExport() {
    setDownloading(true);
    try {
      const res = await fetch("/api/buchhaltung/ebilanz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: Number(fiscalYear),
          asOf,
          taxNumber: taxNumber.trim(),
          vatId: vatId.trim() || undefined,
          companyName: companyName.trim() || undefined,
          legalForm,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? json?.error ?? t("errorExport"));
      }

      await downloadFromResponse(res, `ebilanz-${fiscalYear}.xml`);
      toast.success(t("successExport", { year: fiscalYear }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorExport"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t("info")}</AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ebilanz-year">{t("fiscalYear")}</Label>
            <Input
              id="ebilanz-year"
              type="number"
              min={2000}
              max={2100}
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ebilanz-asof">{t("asOf")}</Label>
            <Input
              id="ebilanz-asof"
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ebilanz-legalform">{t("legalForm")}</Label>
            <Select value={legalForm} onValueChange={(v) => setLegalForm(v as LegalForm)}>
              <SelectTrigger id="ebilanz-legalform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_FORMS.map((form) => (
                  <SelectItem key={form} value={form}>
                    {t(`legalForms.${form}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ebilanz-taxnumber">{t("taxNumber")}</Label>
            <Input
              id="ebilanz-taxnumber"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder={t("taxNumberPlaceholder")}
              maxLength={50}
            />
            {taxNumber.length > 0 && !taxNumberValid && (
              <p className="text-xs text-destructive">{t("taxNumberTooShort")}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="ebilanz-vatid">{t("vatId")}</Label>
            <Input
              id="ebilanz-vatid"
              value={vatId}
              onChange={(e) => setVatId(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ebilanz-company">{t("companyName")}</Label>
            <Input
              id="ebilanz-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("companyNamePlaceholder")}
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleExport} disabled={downloading || !taxNumberValid}>
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t("export")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
