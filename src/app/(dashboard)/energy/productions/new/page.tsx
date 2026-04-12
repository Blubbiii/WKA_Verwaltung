"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("energy.productionNew");
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
      toast.error(t("errPark"));
      return;
    }
    if (!formData.turbineId) {
      toast.error(t("errTurbine"));
      return;
    }
    if (!formData.month) {
      toast.error(t("errMonth"));
      return;
    }
    if (!formData.revenueTypeId) {
      toast.error(t("errRevenueType"));
      return;
    }
    if (!formData.productionKwh || parseFloat(formData.productionKwh) < 0) {
      toast.error(t("errProduction"));
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
          error.details || error.error || t("errCreate")
        );
      }

      toast.success(t("success"));
      router.push(`/energy/productions?year=${formData.year}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errCreate")
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
          {t("noticeBanner")}
          <Link href="/energy/productions" className="underline ml-1 font-medium">
            {t("toOverview")}
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
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Main Fields */}
        <div className="space-y-6 lg:col-span-2">
          {/* Park & Turbine */}
          <Card>
            <CardHeader>
              <CardTitle>{t("turbinePeriod")}</CardTitle>
              <CardDescription>
                {t("turbinePeriodDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Park */}
                <div className="space-y-2">
                  <Label htmlFor="parkId">{t("park")}</Label>
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) =>
                      handleChange("parkId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder={t("selectPark")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        {t("selectParkPlaceholder")}
                      </SelectItem>
                      {parksLoading ? (
                        <SelectItem value="loading" disabled>
                          {t("loading")}
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
                  <Label htmlFor="turbineId">{t("turbineWka")}</Label>
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
                            ? t("selectParkFirst")
                            : t("selectTurbine")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        {t("selectTurbinePlaceholder")}
                      </SelectItem>
                      {turbinesLoading ? (
                        <SelectItem value="loading" disabled>
                          {t("loading")}
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
                  <Label htmlFor="year">{t("year")}</Label>
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
                  <Label htmlFor="month">{t("month")}</Label>
                  <Select
                    value={formData.month || "none"}
                    onValueChange={(value) =>
                      handleChange("month", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="month">
                      <SelectValue placeholder={t("selectMonth")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        {t("selectMonthPlaceholder")}
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
              <CardTitle>{t("productionRevenue")}</CardTitle>
              <CardDescription>
                {t("productionRevenueDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Revenue Type */}
              <div className="space-y-2">
                <Label htmlFor="revenueTypeId">{t("revenueType")}</Label>
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
                    <SelectValue placeholder={t("selectRevenueType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      {t("selectRevenueTypePlaceholder")}
                    </SelectItem>
                    {revenueTypesLoading ? (
                      <SelectItem value="loading" disabled>
                        {t("loading")}
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
                  <Label htmlFor="productionKwh">{t("productionKwh")}</Label>
                  <Input
                    id="productionKwh"
                    type="number"
                    min="0"
                    step="0.001"
                    value={formData.productionKwh}
                    onChange={(e) =>
                      handleChange("productionKwh", e.target.value)
                    }
                    placeholder={t("productionPlaceholder")}
                    required
                  />
                </div>

                {/* Revenue */}
                <div className="space-y-2">
                  <Label htmlFor="revenueEur">{t("revenueEur")}</Label>
                  <Input
                    id="revenueEur"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.revenueEur}
                    onChange={(e) =>
                      handleChange("revenueEur", e.target.value)
                    }
                    placeholder={t("revenueOptional")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>{t("notes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder={t("notesPlaceholder")}
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
                {t("infoDraft", { draft: t("draft"), manual: t("manual") })}
              </p>
              <p className="text-sm text-blue-800">
                {t("infoUnique")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
