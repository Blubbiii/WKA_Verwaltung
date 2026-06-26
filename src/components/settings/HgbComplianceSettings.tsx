"use client";

/**
 * P21: HGB-Compliance Tenant-Settings (Audit B/C + P10/P11/P13).
 *
 * Pflege der 7 HGB-Compliance-spezifischen Felder:
 *  - kleinunternehmer (§19 UStG)
 *  - useTaxSplit (P11 USt-Split Feature-Flag)
 *  - fourEyesThresholdEur (P13 4-Augen-Schwelle)
 *  - bankMatchToleranceEur (Audit B Bank-Match-Toleranz)
 *  - bilanzToleranceEur (Audit B Bilanz-Identität-Toleranz)
 *  - datevAccountAnnualResult (Audit B Jahresergebnis-Konto)
 *  - chartOfAccountsVersion (Audit C SKR03/SKR04-Switch)
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, AlertTriangle, Scale, ShieldCheck } from "lucide-react";

interface HgbSettings {
  kleinunternehmer: boolean;
  useTaxSplit: boolean;
  fourEyesThresholdEur: number | null;
  bankMatchToleranceEur: number;
  bilanzToleranceEur: number;
  datevAccountAnnualResult: string;
  chartOfAccountsVersion: "SKR03" | "SKR04";
}

const DEFAULTS: HgbSettings = {
  kleinunternehmer: false,
  useTaxSplit: false,
  fourEyesThresholdEur: 1000,
  bankMatchToleranceEur: 0.02,
  bilanzToleranceEur: 0.01,
  datevAccountAnnualResult: "9999",
  chartOfAccountsVersion: "SKR04",
};

function LoadingSkel() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function HgbComplianceSettings() {
  const [formData, setFormData] = useState<HgbSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tenant-settings")
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json();
      })
      .then((data) => {
        // Server liefert verschachteltes Object — wir extrahieren nur die HGB-Felder
        // mit Fallback auf Defaults für noch nicht persistierte Werte.
        const merged: HgbSettings = {
          kleinunternehmer: data.kleinunternehmer ?? DEFAULTS.kleinunternehmer,
          useTaxSplit: data.useTaxSplit ?? DEFAULTS.useTaxSplit,
          fourEyesThresholdEur:
            data.fourEyesThresholdEur === undefined
              ? DEFAULTS.fourEyesThresholdEur
              : data.fourEyesThresholdEur,
          bankMatchToleranceEur:
            data.bankMatchToleranceEur ?? DEFAULTS.bankMatchToleranceEur,
          bilanzToleranceEur:
            data.bilanzToleranceEur ?? DEFAULTS.bilanzToleranceEur,
          datevAccountAnnualResult:
            data.datevAccountAnnualResult ?? DEFAULTS.datevAccountAnnualResult,
          chartOfAccountsVersion:
            data.chartOfAccountsVersion ?? DEFAULTS.chartOfAccountsVersion,
        };
        setFormData(merged);
        setHasChanges(false);
      })
      .catch(() => {
        setFormData(DEFAULTS);
        toast.error("Einstellungen konnten nicht geladen werden");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = <K extends keyof HgbSettings>(
    key: K,
    value: HgbSettings[K],
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }
      toast.success("HGB-Compliance-Einstellungen gespeichert");
      setHasChanges(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "HGB-Einstellungen konnten nicht gespeichert werden");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !formData) return <LoadingSkel />;

  return (
    <div className="space-y-6">
      {/* §19 UStG + USt-Split */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Umsatzsteuer-Modus
          </CardTitle>
          <CardDescription>
            Kleinunternehmer §19 UStG und USt-Split-Engine (Phase 11) konfigurieren
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="kleinunternehmer" className="text-base">
                Kleinunternehmer §19 UStG
              </Label>
              <p className="text-sm text-muted-foreground">
                Aus: Ausgangsrechnungen ohne USt-Ausweis, keine UStVA-Pflicht.
              </p>
            </div>
            <Switch
              id="kleinunternehmer"
              checked={formData.kleinunternehmer}
              onCheckedChange={(v) => handleChange("kleinunternehmer", v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="useTaxSplit" className="text-base">
                USt-Split aktivieren (Phase 11)
              </Label>
              <p className="text-sm text-muted-foreground">
                Auto-Posting splittet Brutto in Netto + USt (3-Lines). Default OFF
                während Shadow-Phase — erst nach Goldmaster-Validierung aktivieren!
              </p>
            </div>
            <Switch
              id="useTaxSplit"
              checked={formData.useTaxSplit}
              onCheckedChange={(v) => handleChange("useTaxSplit", v)}
              disabled={formData.kleinunternehmer}
            />
          </div>
        </CardContent>
      </Card>

      {/* P13: 4-Augen-Schwelle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Kreditoren-Härtung (P13)
          </CardTitle>
          <CardDescription>
            Vier-Augen-Prinzip für Eingangsrechnungen oberhalb einer Schwelle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fourEyesThreshold">
              4-Augen-Schwelle (EUR) — leer lassen für immer 4-Augen
            </Label>
            <Input
              id="fourEyesThreshold"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              value={formData.fourEyesThresholdEur ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                handleChange(
                  "fourEyesThresholdEur",
                  v === "" ? null : Number(v),
                );
              }}
              placeholder="z.B. 1000"
            />
            <p className="text-xs text-muted-foreground">
              Rechnungen über dieser Schwelle müssen von einer anderen Person als
              dem Ersteller freigegeben werden. null/leer = immer 4-Augen.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Toleranzen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Cent-Toleranzen
          </CardTitle>
          <CardDescription>
            Rundungs-Toleranzen für Bank-Match und Bilanz-Identitäts-Check
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankTol">Bank-Match-Toleranz (EUR)</Label>
              <Input
                id="bankTol"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.bankMatchToleranceEur}
                onChange={(e) =>
                  handleChange("bankMatchToleranceEur", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default 0,02 €. Wird auch für isFullyPaid-Übergang genutzt.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bilanzTol">Bilanz-Toleranz (EUR)</Label>
              <Input
                id="bilanzTol"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.bilanzToleranceEur}
                onChange={(e) =>
                  handleChange("bilanzToleranceEur", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default 0,01 €. Bei großen Bilanzen ggf. erhöhen.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Konten + Kontenrahmen */}
      <Card>
        <CardHeader>
          <CardTitle>Konten & Kontenrahmen</CardTitle>
          <CardDescription>
            Jahresergebnis-Konto und Kontenrahmen-Variante festlegen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="annualResultAcct">
                Jahresergebnis-Vortragskonto
              </Label>
              <Input
                id="annualResultAcct"
                type="text"
                value={formData.datevAccountAnnualResult}
                onChange={(e) =>
                  handleChange("datevAccountAnnualResult", e.target.value)
                }
                placeholder='Default "9999"'
              />
              <p className="text-xs text-muted-foreground">
                Konto auf das Jahresüberschuss/Jahresfehlbetrag fließt. SKR04
                z.B. &quot;2010&quot; / &quot;2120&quot;, SKR03 z.B. &quot;0860&quot;.
                &quot;9999&quot; = synthetisch (kein automatischer Vortrag).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chartVersion">Kontenrahmen</Label>
              <Select
                value={formData.chartOfAccountsVersion}
                onValueChange={(v) =>
                  handleChange("chartOfAccountsVersion", v as "SKR03" | "SKR04")
                }
              >
                <SelectTrigger id="chartVersion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SKR04">
                    SKR04 (Bilanzorientiert, Standard)
                  </SelectItem>
                  <SelectItem value="SKR03">
                    SKR03 (BWA-orientiert, klassisch)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Achtung: Wechsel ändert die Bilanz-Section-Zuordnung der Konten.
                Nach Wechsel ggf. balanceSheetSection-Backfill erneut laufen lassen.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </div>
  );
}
