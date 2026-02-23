"use client";

import { useState, useEffect } from "react";
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
import { Loader2, Save, Receipt, FileText, Database, Archive } from "lucide-react";
import { useTenantSettings } from "@/hooks/useTenantSettings";

interface InvoiceFormData {
  paymentTermDays: number;
  invoicePaymentText: string;
  creditNotePaymentText: string;
  // DATEV
  datevRevenueAccount: string;
  datevExpenseAccount: string;
  datevDebtorStart: number;
  datevCreditorStart: number;
  // GoBD
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
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
        datevRevenueAccount: settings.datevRevenueAccount ?? "8400",
        datevExpenseAccount: settings.datevExpenseAccount ?? "8000",
        datevDebtorStart: settings.datevDebtorStart ?? 10000,
        datevCreditorStart: settings.datevCreditorStart ?? 70000,
        gobdRetentionYearsInvoice: settings.gobdRetentionYearsInvoice ?? 10,
        gobdRetentionYearsContract: settings.gobdRetentionYearsContract ?? 10,
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
      toast.error("Zahlungsziel muss zwischen 1 und 365 Tagen liegen");
      return;
    }

    if (formData.datevRevenueAccount && !/^\d{4,10}$/.test(formData.datevRevenueAccount)) {
      toast.error("DATEV Erloeskonto muss 4-10 Ziffern enthalten");
      return;
    }

    if (formData.datevExpenseAccount && !/^\d{4,10}$/.test(formData.datevExpenseAccount)) {
      toast.error("DATEV Aufwandskonto muss 4-10 Ziffern enthalten");
      return;
    }

    if (formData.gobdRetentionYearsInvoice < 1 || formData.gobdRetentionYearsInvoice > 30) {
      toast.error("Aufbewahrungsfrist muss zwischen 1 und 30 Jahren liegen");
      return;
    }

    if (formData.gobdRetentionYearsContract < 1 || formData.gobdRetentionYearsContract > 30) {
      toast.error("Aufbewahrungsfrist muss zwischen 1 und 30 Jahren liegen");
      return;
    }

    try {
      setIsSaving(true);
      await updateSettings(formData);
      toast.success("Rechnungseinstellungen gespeichert");
      setHasChanges(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
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
            Standard-Zahlungsbedingungen fuer neue Rechnungen
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
              Anzahl der Tage bis zur Faelligkeit nach Rechnungsdatum (1-365)
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
            Individuelle Texte fuer Rechnungen und Gutschriften. Verfuegbare
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
              placeholder="Bitte ueberweisen Sie den Betrag bis zum {dueDate} auf das unten angegebene Konto..."
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
              placeholder="Der Gutschriftsbetrag wird bis zum {dueDate} auf Ihr Konto ueberwiesen..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Dieser Text erscheint auf Gutschriften unter den Positionen
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DATEV Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">DATEV Export</CardTitle>
          </div>
          <CardDescription>
            Standard-Kontenrahmen und Nummernkreise fuer den DATEV-Export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="datevRevenueAccount">Erloeskonto</Label>
              <Input
                id="datevRevenueAccount"
                value={formData.datevRevenueAccount}
                onChange={(e) =>
                  handleChange("datevRevenueAccount", e.target.value)
                }
                placeholder="8400"
              />
              <p className="text-xs text-muted-foreground">
                Standard-Sachkonto fuer Erloese (z.B. 8400 bei SKR04)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="datevExpenseAccount">Aufwandskonto</Label>
              <Input
                id="datevExpenseAccount"
                value={formData.datevExpenseAccount}
                onChange={(e) =>
                  handleChange("datevExpenseAccount", e.target.value)
                }
                placeholder="8000"
              />
              <p className="text-xs text-muted-foreground">
                Standard-Sachkonto fuer Aufwendungen (z.B. 8000 bei SKR04)
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="datevDebtorStart">Debitorennummernkreis ab</Label>
              <Input
                id="datevDebtorStart"
                type="number"
                min={1000}
                max={99999999}
                value={formData.datevDebtorStart}
                onChange={(e) =>
                  handleChange(
                    "datevDebtorStart",
                    parseInt(e.target.value, 10) || 10000
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Startnummer fuer Debitorenkonten (Standard: 10000)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="datevCreditorStart">Kreditorennummernkreis ab</Label>
              <Input
                id="datevCreditorStart"
                type="number"
                min={1000}
                max={99999999}
                value={formData.datevCreditorStart}
                onChange={(e) =>
                  handleChange(
                    "datevCreditorStart",
                    parseInt(e.target.value, 10) || 70000
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Startnummer fuer Kreditorenkonten (Standard: 70000)
              </p>
            </div>
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
            Gesetzliche Aufbewahrungsfristen gemaess §147 AO fuer die automatische Archivierung
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gobdRetentionYearsInvoice">
                Rechnungen & Buchungsbelege (Jahre)
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
                Vertraege & Korrespondenz (Jahre)
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
