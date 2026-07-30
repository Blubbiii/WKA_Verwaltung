"use client";

/**
 * Bundesanzeiger-Offenlegung §325 HGB — XBRL-Export.
 *
 * TF-11 (Audit 2026-07): `/api/buchhaltung/bundesanzeiger` war vollständig
 * implementiert und hatte keinen UI-Aufrufer. Die Offenlegung ist
 * fristgebunden; der Umfang hängt an der Größenklasse (§267 HGB).
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

/** Größenklassen nach §267 HGB / §267a HGB (Kleinstkapitalgesellschaft). */
const COMPANY_SIZES = ["kleinst", "klein", "mittel", "gross"] as const;
type CompanySize = (typeof COMPANY_SIZES)[number];

export default function BundesanzeigerContent() {
  const t = useTranslations("buchhaltung.abschlussBundesanzeiger");

  const lastYear = new Date().getFullYear() - 1;
  const [fiscalYear, setFiscalYear] = useState(String(lastYear));
  const [asOf, setAsOf] = useState(`${lastYear}-12-31`);
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState<CompanySize>("klein");
  const [handelsregisterNummer, setHandelsregisterNummer] = useState("");
  const [registeredOffice, setRegisteredOffice] = useState("");
  const [downloading, setDownloading] = useState(false);

  // companyName ist serverseitig Pflicht (min 1).
  const companyNameValid = companyName.trim().length > 0;

  async function handleExport() {
    setDownloading(true);
    try {
      const res = await fetch("/api/buchhaltung/bundesanzeiger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: Number(fiscalYear),
          asOf,
          companyName: companyName.trim(),
          companySize,
          handelsregisterNummer: handelsregisterNummer.trim() || undefined,
          registeredOffice: registeredOffice.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? json?.error ?? t("errorExport"));
      }

      await downloadFromResponse(res, `bundesanzeiger-${fiscalYear}.xml`);
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
            <Label htmlFor="ba-year">{t("fiscalYear")}</Label>
            <Input
              id="ba-year"
              type="number"
              min={2000}
              max={2100}
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ba-asof">{t("asOf")}</Label>
            <Input
              id="ba-asof"
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ba-size">{t("companySize")}</Label>
            <Select value={companySize} onValueChange={(v) => setCompanySize(v as CompanySize)}>
              <SelectTrigger id="ba-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {t(`companySizes.${size}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="ba-company">{t("companyName")}</Label>
            <Input
              id="ba-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("companyNamePlaceholder")}
              maxLength={200}
            />
            {!companyNameValid && companyName.length > 0 && (
              <p className="text-xs text-destructive">{t("companyNameRequired")}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="ba-hrb">{t("handelsregisterNummer")}</Label>
            <Input
              id="ba-hrb"
              value={handelsregisterNummer}
              onChange={(e) => setHandelsregisterNummer(e.target.value)}
              placeholder={t("handelsregisterPlaceholder")}
              maxLength={100}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ba-office">{t("registeredOffice")}</Label>
            <Input
              id="ba-office"
              value={registeredOffice}
              onChange={(e) => setRegisteredOffice(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleExport} disabled={downloading || !companyNameValid}>
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
