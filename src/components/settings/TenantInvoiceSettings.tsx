"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Save, Receipt, FileText, Archive, Bell } from "lucide-react";
import { useTenantSettings } from "@/hooks/useTenantSettings";

interface InvoiceFormData {
  paymentTermDays: number;
  invoicePaymentText: string;
  creditNotePaymentText: string;
  // Geschäftsjahr
  fiscalYearStartMonth: number;
  // GoBD
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
  // Mahnwesen
  reminderEnabled: boolean;
  reminderDays1: number;
  reminderDays2: number;
  reminderDays3: number;
  reminderFee1: number;
  reminderFee2: number;
  reminderFee3: number;
}

function InvoiceSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function TenantInvoiceSettings() {
  const t = useTranslations("admin.settingsUI.tenantInvoice");
  const { settings, isLoading, isError, updateSettings } =
    useTenantSettings();
  const [formData, setFormData] = useState<InvoiceFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        paymentTermDays: settings.paymentTermDays,
        invoicePaymentText: settings.invoicePaymentText,
        creditNotePaymentText: settings.creditNotePaymentText,
        fiscalYearStartMonth: settings.fiscalYearStartMonth ?? 1,
        gobdRetentionYearsInvoice: settings.gobdRetentionYearsInvoice ?? 10,
        gobdRetentionYearsContract: settings.gobdRetentionYearsContract ?? 10,
        reminderEnabled: settings.reminderEnabled ?? true,
        reminderDays1: settings.reminderDays1 ?? 7,
        reminderDays2: settings.reminderDays2 ?? 21,
        reminderDays3: settings.reminderDays3 ?? 42,
        reminderFee1: settings.reminderFee1 ?? 0,
        reminderFee2: settings.reminderFee2 ?? 5,
        reminderFee3: settings.reminderFee3 ?? 10,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof InvoiceFormData>(
    key: K,
    value: InvoiceFormData[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    if (!formData) return;

    if (formData.paymentTermDays < 1 || formData.paymentTermDays > 365) {
      toast.error(t("saveError"));
      return;
    }

    if (formData.gobdRetentionYearsInvoice < 1 || formData.gobdRetentionYearsInvoice > 30) {
      toast.error(t("saveError"));
      return;
    }

    if (formData.gobdRetentionYearsContract < 1 || formData.gobdRetentionYearsContract > 30) {
      toast.error(t("saveError"));
      return;
    }

    try {
      setIsSaving(true);
      await updateSettings(formData);
      toast.success(t("saved"));
      setHasChanges(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Rechnungseinstellungen
      </div>
    );
  }

  if (isLoading || !formData) {
    return <InvoiceSettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Zahlungsbedingungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Zahlungsbedingungen</CardTitle>
          </div>
          <CardDescription>
            Standard-Zahlungsbedingungen für neue Rechnungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zahlungsziel */}
          <div className="space-y-2">
            <Label htmlFor="paymentTermDays">Zahlungsziel (Tage)</Label>
            <Input
              id="paymentTermDays"
              type="number"
              min={1}
              max={365}
              value={formData.paymentTermDays}
              onChange={(e) =>
                handleChange(
                  "paymentTermDays",
                  parseInt(e.target.value, 10) || 30
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Anzahl der Tage bis zur Fälligkeit nach Rechnungsdatum (1-365)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dokumenttexte */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Dokumenttexte</CardTitle>
          </div>
          <CardDescription>
            Individuelle Texte für Rechnungen und Gutschriften. Verfügbare
            Platzhalter: <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{dueDate}"}</code>{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{invoiceNumber}"}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rechnungstext */}
          <div className="space-y-2">
            <Label htmlFor="invoicePaymentText">
              Zahlungsbedingungen (Rechnung)
            </Label>
            <Textarea
              id="invoicePaymentText"
              value={formData.invoicePaymentText}
              onChange={(e) =>
                handleChange("invoicePaymentText", e.target.value)
              }
              placeholder="Bitte überweisen Sie den Betrag bis zum {dueDate} auf das unten angegebene Konto..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Dieser Text erscheint auf Rechnungen unter den Positionen
            </p>
          </div>

          <Separator />

          {/* Gutschriftstext */}
          <div className="space-y-2">
            <Label htmlFor="creditNotePaymentText">
              Zahlungshinweis (Gutschrift)
            </Label>
            <Textarea
              id="creditNotePaymentText"
              value={formData.creditNotePaymentText}
              onChange={(e) =>
                handleChange("creditNotePaymentText", e.target.value)
              }
              placeholder="Der Gutschriftsbetrag wird bis zum {dueDate} auf Ihr Konto überwiesen..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Dieser Text erscheint auf Gutschriften unter den Positionen
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Geschäftsjahr */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Geschäftsjahr</CardTitle>
          </div>
          <CardDescription>
            Beginn des Geschaeftsjahres für BWA und Jahresvergleiche
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="fiscalYearStartMonth">Geschäftsjahr beginnt im</Label>
            <select
              id="fiscalYearStartMonth"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={formData.fiscalYearStartMonth}
              onChange={(e) => handleChange("fiscalYearStartMonth", parseInt(e.target.value, 10))}
            >
              {[
                { value: 1, label: "Januar" }, { value: 2, label: "Februar" },
                { value: 3, label: "März" }, { value: 4, label: "April" },
                { value: 5, label: "Mai" }, { value: 6, label: "Juni" },
                { value: 7, label: "Juli" }, { value: 8, label: "August" },
                { value: 9, label: "September" }, { value: 10, label: "Oktober" },
                { value: 11, label: "November" }, { value: 12, label: "Dezember" },
              ].map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Standard: Januar (Kalenderjahr = Geschaeftsjahr)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* GoBD Aufbewahrung */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">GoBD Aufbewahrungsfristen</CardTitle>
          </div>
          <CardDescription>
            Gesetzliche Aufbewahrungsfristen gemaess §147 AO für die automatische Archivierung
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gobdRetentionYearsInvoice">
                Rechnungen & Belege (Jahre)
              </Label>
              <Input
                id="gobdRetentionYearsInvoice"
                type="number"
                min={1}
                max={30}
                value={formData.gobdRetentionYearsInvoice}
                onChange={(e) =>
                  handleChange(
                    "gobdRetentionYearsInvoice",
                    parseInt(e.target.value, 10) || 10
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Gesetzl. Mindestfrist: 10 Jahre (§147 Abs. 3 AO)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gobdRetentionYearsContract">
                Verträge & Korrespondenz (Jahre)
              </Label>
              <Input
                id="gobdRetentionYearsContract"
                type="number"
                min={1}
                max={30}
                value={formData.gobdRetentionYearsContract}
                onChange={(e) =>
                  handleChange(
                    "gobdRetentionYearsContract",
                    parseInt(e.target.value, 10) || 10
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Gesetzl. Mindestfrist: 6 Jahre (Handels-/Geschaeftsbriefe)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mahnwesen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Mahnwesen</CardTitle>
          </div>
          <CardDescription>
            Mahnstufen, Fristen und Gebühren für den Mahnprozess
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 font-medium text-muted-foreground w-40">Stufe</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground w-36">Tage nach Fälligkeit</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground w-32">Mahngebühr (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(
                  [
                    { label: "1. Zahlungserinnerung", daysKey: "reminderDays1", feeKey: "reminderFee1" },
                    { label: "2. Mahnung", daysKey: "reminderDays2", feeKey: "reminderFee2" },
                    { label: "3. Mahnung (Letzte)", daysKey: "reminderDays3", feeKey: "reminderFee3" },
                  ] as const
                ).map(({ label, daysKey, feeKey }) => (
                  <tr key={daysKey} className="py-2">
                    <td className="py-2 pr-4 text-sm">{label}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">+</span>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          className="h-7 w-20 font-mono text-sm"
                          value={formData[daysKey]}
                          onChange={(e) =>
                            handleChange(daysKey, parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <span className="text-xs text-muted-foreground">Tage</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={999.99}
                          step={0.01}
                          className="h-7 w-24 font-mono text-sm"
                          value={formData[feeKey]}
                          onChange={(e) =>
                            handleChange(feeKey, parseFloat(e.target.value) || 0)
                          }
                        />
                        <span className="text-xs text-muted-foreground">€</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Gebühren von 0 € bedeuten: keine Mahngebühr für diese Stufe.
          </p>
        </CardContent>
      </Card>

      {/* Speichern Button */}
      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="lg"
          className="shadow-lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  );
}
