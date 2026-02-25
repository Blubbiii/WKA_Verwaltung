"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useParks } from "@/hooks/useParks";
import {
  createEnergySettlement,
  fetchProductionsForSettlement,
  monthNames,
  type ProductionForSettlement,
} from "@/hooks/useEnergySettlements";

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 11 }, (_, i) => currentYear + 5 - i);

const DISTRIBUTION_MODES = [
  { value: "PROPORTIONAL", label: "Proportional" },
  { value: "SMOOTHED", label: "Geglaettet" },
  { value: "TOLERATED", label: "Mit Duldung" },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewSettlementPage() {
  const router = useRouter();
  const { parks, isLoading: parksLoading } = useParks();
  const [saving, setSaving] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillData, setAutoFillData] = useState<ProductionForSettlement | null>(null);

  const [formData, setFormData] = useState({
    parkId: "",
    year: currentYear.toString(),
    month: "", // empty = no selection yet
    netOperatorRevenueEur: "",
    totalProductionKwh: "",
    distributionMode: "SMOOTHED",
    smoothingFactor: "0.5",
    tolerancePercentage: "5",
    netOperatorReference: "",
    notes: "",
  });

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Reset auto-fill data when park/year/month changes, so user knows
    // they need to re-fetch if they change the period
    if (field === "parkId" || field === "year" || field === "month") {
      setAutoFillData(null);
    }
  }

  async function handleAutoFill() {
    if (!formData.parkId) {
      toast.error("Bitte waehlen Sie zuerst einen Park aus");
      return;
    }
    if (!formData.month || formData.month === "annual") {
      // For annual settlements: we still fetch all months
    }

    try {
      setAutoFilling(true);
      const monthValue =
        formData.month && formData.month !== "annual"
          ? parseInt(formData.month)
          : undefined;

      const data = await fetchProductionsForSettlement({
        parkId: formData.parkId,
        year: parseInt(formData.year),
        month: monthValue ?? null,
        status: "DRAFT",
      });

      setAutoFillData(data);

      if (data.recordCount === 0) {
        toast.info(
          "Keine Produktionsdaten im Status DRAFT für diesen Zeitraum gefunden"
        );
        return;
      }

      // Auto-fill the form fields with the aggregated data
      setFormData((prev) => ({
        ...prev,
        totalProductionKwh: data.totalProductionKwh.toFixed(3),
      }));

      toast.success(
        `Produktionsdaten übernommen: ${data.turbineCount} Turbinen, ${data.recordCount} Einträge`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Produktionsdaten"
      );
    } finally {
      setAutoFilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!formData.parkId) {
      toast.error("Bitte waehlen Sie einen Park aus");
      return;
    }
    if (!formData.netOperatorRevenueEur || parseFloat(formData.netOperatorRevenueEur) < 0) {
      toast.error("Bitte geben Sie einen gültigen Erlösbetrag ein");
      return;
    }
    if (!formData.totalProductionKwh || parseFloat(formData.totalProductionKwh) < 0) {
      toast.error("Bitte geben Sie eine gültige Produktionsmenge ein");
      return;
    }

    try {
      setSaving(true);

      const monthValue = formData.month === "annual" ? null : formData.month ? parseInt(formData.month) : null;

      const payload = {
        parkId: formData.parkId,
        year: parseInt(formData.year),
        month: monthValue,
        netOperatorRevenueEur: parseFloat(formData.netOperatorRevenueEur),
        totalProductionKwh: parseFloat(formData.totalProductionKwh),
        distributionMode: formData.distributionMode as
          | "PROPORTIONAL"
          | "SMOOTHED"
          | "TOLERATED",
        smoothingFactor:
          formData.distributionMode === "SMOOTHED" && formData.smoothingFactor
            ? parseFloat(formData.smoothingFactor)
            : null,
        tolerancePercentage:
          formData.distributionMode === "TOLERATED" &&
          formData.tolerancePercentage
            ? parseFloat(formData.tolerancePercentage)
            : null,
        netOperatorReference: formData.netOperatorReference || null,
        notes: formData.notes || null,
      };

      const result = await createEnergySettlement(payload);
      toast.success("Abrechnung erfolgreich erstellt");
      router.push(`/energy/settlements/${result.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href="/energy">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Netzbetreiber-Daten erfassen</h1>
            <p className="text-muted-foreground">
              Neue Netzbetreiber-Abrechnung erstellen
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Erstellen
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Main Fields */}
        <div className="space-y-6 lg:col-span-2">
          {/* Park & Period */}
          <Card>
            <CardHeader>
              <CardTitle>Park & Zeitraum</CardTitle>
              <CardDescription>
                Waehlen Sie den Windpark und den Abrechnungszeitraum
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Park */}
                <div className="space-y-2">
                  <Label htmlFor="parkId">Park *</Label>
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) =>
                      handleChange("parkId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Park waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Park waehlen...
                      </SelectItem>
                      {parksLoading ? (
                        <SelectItem value="loading" disabled>
                          Laden...
                        </SelectItem>
                      ) : (
                        parks?.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Year */}
                <div className="space-y-2">
                  <Label htmlFor="year">Jahr *</Label>
                  <Select
                    value={formData.year}
                    onValueChange={(value) => handleChange("year", value)}
                  >
                    <SelectTrigger id="year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Month */}
                <div className="space-y-2">
                  <Label htmlFor="month">Monat</Label>
                  <Select
                    value={formData.month || "none"}
                    onValueChange={(value) =>
                      handleChange("month", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="month">
                      <SelectValue placeholder="Monat waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Monat waehlen...
                      </SelectItem>
                      <SelectItem value="annual">
                        Jahresabrechnung
                      </SelectItem>
                      {Object.entries(monthNames).map(([num, name]) => (
                        <SelectItem key={num} value={num}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production & Revenue */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Produktion & Erlös</CardTitle>
                  <CardDescription>
                    Daten vom Netzbetreiber eintragen oder aus Produktionsdaten übernehmen
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  disabled={autoFilling || !formData.parkId}
                  title={
                    !formData.parkId
                      ? "Bitte zuerst einen Park auswaehlen"
                      : "Produktionsdaten (DRAFT) für den gewaehlten Zeitraum laden"
                  }
                >
                  {autoFilling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Auto-Fill
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Revenue */}
                <div className="space-y-2">
                  <Label htmlFor="netOperatorRevenueEur">
                    Netzeinspeisung Erlös (EUR) *
                  </Label>
                  <Input
                    id="netOperatorRevenueEur"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.netOperatorRevenueEur}
                    onChange={(e) =>
                      handleChange("netOperatorRevenueEur", e.target.value)
                    }
                    placeholder="0,00"
                    required
                  />
                </div>

                {/* Production */}
                <div className="space-y-2">
                  <Label htmlFor="totalProductionKwh">
                    Gesamtproduktion (kWh) *
                  </Label>
                  <Input
                    id="totalProductionKwh"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.totalProductionKwh}
                    onChange={(e) =>
                      handleChange("totalProductionKwh", e.target.value)
                    }
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-2">
                <Label htmlFor="netOperatorReference">
                  Netzbetreiber-Referenz (optional)
                </Label>
                <Input
                  id="netOperatorReference"
                  value={formData.netOperatorReference}
                  onChange={(e) =>
                    handleChange("netOperatorReference", e.target.value)
                  }
                  placeholder="z.B. Abrechnungsnummer des Netzbetreibers"
                />
              </div>

              {/* Auto-Fill Summary */}
              {autoFillData && autoFillData.recordCount > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-green-800">
                    Produktionsdaten übernommen
                  </p>
                  <div className="text-sm text-green-700 space-y-1">
                    <p>
                      {autoFillData.turbineCount} Turbine(n), {autoFillData.recordCount} Datensaetze (Status: DRAFT)
                    </p>
                    {autoFillData.turbineSummary.map((t) => (
                      <div key={t.turbineId} className="flex justify-between text-xs font-mono">
                        <span>{t.designation}</span>
                        <span>
                          {new Intl.NumberFormat("de-DE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(t.totalKwh)}{" "}
                          kWh
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-green-600">
                    Der Erlösbetrag muss ggf. manuell vom Netzbetreiber-Beleg übernommen werden.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Optionale Notizen zur Abrechnung"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Distribution Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verteilung</CardTitle>
              <CardDescription>
                Wie soll der Erlös verteilt werden?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Distribution Mode */}
              <div className="space-y-2">
                <Label htmlFor="distributionMode">Verteilungsmodus</Label>
                <Select
                  value={formData.distributionMode}
                  onValueChange={(value) =>
                    handleChange("distributionMode", value)
                  }
                >
                  <SelectTrigger id="distributionMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISTRIBUTION_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Smoothing Factor (only for SMOOTHED) */}
              {formData.distributionMode === "SMOOTHED" && (
                <div className="space-y-2">
                  <Label htmlFor="smoothingFactor">
                    Glaettungsfaktor (0-1)
                  </Label>
                  <Input
                    id="smoothingFactor"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.smoothingFactor}
                    onChange={(e) =>
                      handleChange("smoothingFactor", e.target.value)
                    }
                    placeholder="0.5"
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = keine Glaettung, 1 = maximale Glaettung
                  </p>
                </div>
              )}

              {/* Tolerance Percentage (only for TOLERATED) */}
              {formData.distributionMode === "TOLERATED" && (
                <div className="space-y-2">
                  <Label htmlFor="tolerancePercentage">
                    Toleranz (%)
                  </Label>
                  <Input
                    id="tolerancePercentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.tolerancePercentage}
                    onChange={(e) =>
                      handleChange("tolerancePercentage", e.target.value)
                    }
                    placeholder="5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Erlaubte Abweichung in Prozent
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Box */}
          <Card className="border-teal-200 bg-teal-50">
            <CardContent className="pt-6">
              <p className="text-sm text-teal-800">
                Die Abrechnung wird als <strong>Entwurf</strong> erstellt.
                Nach der Erstellung können Sie die Berechnung starten, um
                die Abrechnungspositionen zu generieren.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
