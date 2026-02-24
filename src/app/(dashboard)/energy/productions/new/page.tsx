"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
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
import { monthNames } from "@/hooks/useEnergySettlements";

// =============================================================================
// TYPES
// =============================================================================

interface Turbine {
  id: string;
  designation: string;
}

interface RevenueType {
  id: string;
  name: string;
  code: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 11 }, (_, i) => currentYear + 1 - i);

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewProductionPage() {
  const router = useRouter();
  const { parks, isLoading: parksLoading } = useParks();
  const [saving, setSaving] = useState(false);

  // Turbines for selected park
  const [turbines, setTurbines] = useState<Turbine[]>([]);
  const [turbinesLoading, setTurbinesLoading] = useState(false);

  // Revenue types
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [revenueTypesLoading, setRevenueTypesLoading] = useState(true);

  const [formData, setFormData] = useState({
    parkId: "",
    turbineId: "",
    year: currentYear.toString(),
    month: "",
    revenueTypeId: "",
    productionKwh: "",
    revenueEur: "",
    notes: "",
  });

  // Load revenue types on mount
  useEffect(() => {
    fetch("/api/energy/revenue-types")
      .then((res) => res.json())
      .then((data) => setRevenueTypes(data.data || []))
      .catch(() => setRevenueTypes([]))
      .finally(() => setRevenueTypesLoading(false));
  }, []);

  // Load turbines when park changes
  useEffect(() => {
    if (formData.parkId) {
      setTurbinesLoading(true);
      setFormData((prev) => ({ ...prev, turbineId: "" }));
      fetch(`/api/parks/${formData.parkId}`)
        .then((res) => res.json())
        .then((data) => setTurbines(data.turbines || []))
        .catch(() => setTurbines([]))
        .finally(() => setTurbinesLoading(false));
    } else {
      setTurbines([]);
    }
  }, [formData.parkId]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.parkId) {
      toast.error("Bitte waehlen Sie einen Park aus");
      return;
    }
    if (!formData.turbineId) {
      toast.error("Bitte waehlen Sie eine Anlage aus");
      return;
    }
    if (!formData.month) {
      toast.error("Bitte waehlen Sie einen Monat aus");
      return;
    }
    if (!formData.revenueTypeId) {
      toast.error("Bitte waehlen Sie eine Vergütungsart aus");
      return;
    }
    if (!formData.productionKwh || parseFloat(formData.productionKwh) < 0) {
      toast.error("Bitte geben Sie eine gültige Produktionsmenge ein");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        turbineId: formData.turbineId,
        year: parseInt(formData.year),
        month: parseInt(formData.month),
        revenueTypeId: formData.revenueTypeId,
        productionKwh: parseFloat(formData.productionKwh),
        revenueEur: formData.revenueEur
          ? parseFloat(formData.revenueEur)
          : null,
        source: "MANUAL" as const,
        notes: formData.notes || null,
      };

      const response = await fetch("/api/energy/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.details || error.error || "Fehler beim Erstellen"
        );
      }

      toast.success("Produktionsdaten erfolgreich erfasst");
      router.push(`/energy/productions?year=${formData.year}`);
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
      {/* Notice banner */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          Die manuelle Erfassung ist auch direkt über die Produktionsdaten-Seite erreichbar.
          <Link href="/energy/productions" className="underline ml-1 font-medium">
            Zur Übersicht
          </Link>
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href="/energy/productions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Produktionsdaten erfassen</h1>
            <p className="text-muted-foreground">
              Manuelle Eingabe von Produktionsdaten einer Anlage
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
            Speichern
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Main Fields */}
        <div className="space-y-6 lg:col-span-2">
          {/* Park & Turbine */}
          <Card>
            <CardHeader>
              <CardTitle>Anlage & Zeitraum</CardTitle>
              <CardDescription>
                Waehlen Sie die Anlage und den Zeitraum
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
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

                {/* Turbine */}
                <div className="space-y-2">
                  <Label htmlFor="turbineId">Anlage (WKA) *</Label>
                  <Select
                    value={formData.turbineId || "none"}
                    onValueChange={(value) =>
                      handleChange("turbineId", value === "none" ? "" : value)
                    }
                    disabled={!formData.parkId || turbinesLoading}
                  >
                    <SelectTrigger id="turbineId">
                      <SelectValue
                        placeholder={
                          !formData.parkId
                            ? "Zuerst Park waehlen"
                            : "Anlage waehlen"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Anlage waehlen...
                      </SelectItem>
                      {turbinesLoading ? (
                        <SelectItem value="loading" disabled>
                          Laden...
                        </SelectItem>
                      ) : (
                        turbines.map((turbine) => (
                          <SelectItem key={turbine.id} value={turbine.id}>
                            {turbine.designation}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="month">Monat *</Label>
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
              <CardTitle>Produktion & Erlös</CardTitle>
              <CardDescription>
                Produktionsdaten und Erlöse eintragen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Revenue Type */}
              <div className="space-y-2">
                <Label htmlFor="revenueTypeId">Vergütungsart *</Label>
                <Select
                  value={formData.revenueTypeId || "none"}
                  onValueChange={(value) =>
                    handleChange(
                      "revenueTypeId",
                      value === "none" ? "" : value
                    )
                  }
                  disabled={revenueTypesLoading}
                >
                  <SelectTrigger id="revenueTypeId">
                    <SelectValue placeholder="Vergütungsart waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      Vergütungsart waehlen...
                    </SelectItem>
                    {revenueTypesLoading ? (
                      <SelectItem value="loading" disabled>
                        Laden...
                      </SelectItem>
                    ) : (
                      revenueTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.name} ({rt.code})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Production */}
                <div className="space-y-2">
                  <Label htmlFor="productionKwh">Produktion (kWh) *</Label>
                  <Input
                    id="productionKwh"
                    type="number"
                    min="0"
                    step="0.001"
                    value={formData.productionKwh}
                    onChange={(e) =>
                      handleChange("productionKwh", e.target.value)
                    }
                    placeholder="0,000"
                    required
                  />
                </div>

                {/* Revenue */}
                <div className="space-y-2">
                  <Label htmlFor="revenueEur">Erlös (EUR)</Label>
                  <Input
                    id="revenueEur"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.revenueEur}
                    onChange={(e) =>
                      handleChange("revenueEur", e.target.value)
                    }
                    placeholder="optional"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Bemerkungen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Optionale Bemerkungen"
                rows={3}
                maxLength={1000}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Info */}
        <div className="space-y-6">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-blue-800">
                Der Datensatz wird als <strong>Entwurf</strong> mit der Quelle{" "}
                <strong>Manuell</strong> erstellt.
              </p>
              <p className="text-sm text-blue-800">
                Pro Anlage, Monat und Vergütungsart kann nur ein Eintrag
                existieren.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
