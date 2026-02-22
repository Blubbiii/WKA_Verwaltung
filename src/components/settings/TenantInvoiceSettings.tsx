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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Save, Receipt, Percent, FileText } from "lucide-react";
import { useTenantSettings } from "@/hooks/useTenantSettings";

interface InvoiceFormData {
  paymentTermDays: number;
  defaultTaxRate: number;
  taxExempt: boolean;
  taxExemptNote: string;
  invoicePaymentText: string;
  creditNotePaymentText: string;
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
        defaultTaxRate: settings.defaultTaxRate,
        taxExempt: settings.taxExempt,
        taxExemptNote: settings.taxExemptNote,
        invoicePaymentText: settings.invoicePaymentText,
        creditNotePaymentText: settings.creditNotePaymentText,
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

    if (formData.defaultTaxRate < 0 || formData.defaultTaxRate > 100) {
      toast.error("Steuersatz muss zwischen 0% und 100% liegen");
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

      {/* Steuereinstellungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Steuereinstellungen</CardTitle>
          </div>
          <CardDescription>
            Mehrwertsteuer-Konfiguration fuer Rechnungen und Gutschriften
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Standard MwSt-Satz */}
          <div className="space-y-2">
            <Label htmlFor="defaultTaxRate">Standard-MwSt-Satz (%)</Label>
            <Input
              id="defaultTaxRate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={formData.defaultTaxRate}
              onChange={(e) =>
                handleChange(
                  "defaultTaxRate",
                  parseFloat(e.target.value) || 19
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Wird als Standard bei neuen Rechnungen vorbelegt (z.B. 19 fuer 19%)
            </p>
          </div>

          <Separator />

          {/* Steuerbefreiung */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="taxExempt">Steuerbefreiung aktiv</Label>
              <p className="text-sm text-muted-foreground">
                Rechnungen werden standardmaessig ohne Mehrwertsteuer erstellt
              </p>
            </div>
            <Switch
              id="taxExempt"
              checked={formData.taxExempt}
              onCheckedChange={(checked) => handleChange("taxExempt", checked)}
            />
          </div>

          {/* Steuerbefreiungshinweis */}
          {formData.taxExempt && (
            <div className="space-y-2">
              <Label htmlFor="taxExemptNote">Steuerbefreiungshinweis</Label>
              <Textarea
                id="taxExemptNote"
                value={formData.taxExemptNote}
                onChange={(e) =>
                  handleChange("taxExemptNote", e.target.value)
                }
                placeholder="Steuerfrei gem. &sect;4 Nr.12 UStG"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Dieser Hinweis wird auf steuerbefreiten Rechnungen angezeigt
              </p>
            </div>
          )}
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
