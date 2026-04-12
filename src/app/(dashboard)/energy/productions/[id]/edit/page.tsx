"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { monthNames } from "@/hooks/useEnergySettlements";

// =============================================================================
// TYPES
// =============================================================================

interface ProductionData {
  id: string;
  year: number;
  month: number;
  productionKwh: number;
  revenueEur: number | null;
  source: string;
  status: string;
  notes: string | null;
  turbine: {
    id: string;
    designation: string;
    park: {
      id: string;
      name: string;
    };
  };
  revenueType: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function EditProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("energy.productionEdit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [production, setProduction] = useState<ProductionData | null>(null);

  const [formData, setFormData] = useState({
    productionKwh: "",
    revenueEur: "",
    notes: "",
  });

  // Load production data
  useEffect(() => {
    fetch(`/api/energy/productions/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("notFound"));
        return res.json();
      })
      .then((data) => {
        setProduction(data);
        setFormData({
          productionKwh: String(data.productionKwh),
          revenueEur: data.revenueEur != null ? String(data.revenueEur) : "",
          notes: data.notes || "",
        });
      })
      .catch(() => {
        toast.error(t("dataNotFound"));
        router.push("/energy/productions");
      })
      .finally(() => setLoading(false));
  }, [id, router, t]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.productionKwh || parseFloat(formData.productionKwh) < 0) {
      toast.error(t("validProductionRequired"));
      return;
    }

    try {
      setSaving(true);

      const payload = {
        productionKwh: parseFloat(formData.productionKwh),
        revenueEur: formData.revenueEur
          ? parseFloat(formData.revenueEur)
          : null,
        notes: formData.notes || null,
      };

      const response = await fetch(`/api/energy/productions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("saveError"));
      }

      toast.success(t("dataUpdated"));
      router.push(`/energy/productions?year=${production?.year || new Date().getFullYear()}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!production) return null;

  const isInvoiced = production.status === "INVOICED";
  const knownSources = ["MANUAL", "CSV_IMPORT", "EXCEL_IMPORT", "SCADA"];
  const sourceLabel = knownSources.includes(production.source)
    ? t(`sourceLabels.${production.source as "MANUAL" | "CSV_IMPORT" | "EXCEL_IMPORT" | "SCADA"}`)
    : production.source;

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
              {production.turbine.designation} -{" "}
              {monthNames[production.month]} {production.year}
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
          <Button type="submit" disabled={saving || isInvoiced}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </div>
      </div>

      {isInvoiced && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-800">
              {t("invoicedLocked")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Editable Fields */}
        <div className="space-y-6 lg:col-span-2">
          {/* Production & Revenue */}
          <Card>
            <CardHeader>
              <CardTitle>{t("productionRevenue")}</CardTitle>
              <CardDescription>
                {t("productionRevenueDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    disabled={isInvoiced}
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
                    disabled={isInvoiced}
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
                disabled={isInvoiced}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Readonly Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
              <CardDescription>
                {t("detailsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("park")}</p>
                <p className="font-medium">{production.turbine.park.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("turbine")}</p>
                <p className="font-medium">{production.turbine.designation}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("period")}</p>
                <p className="font-medium">
                  {monthNames[production.month]} {production.year}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("revenueType")}</p>
                <p className="font-medium">
                  {production.revenueType
                    ? `${production.revenueType.name} (${production.revenueType.code})`
                    : "-"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("source")}</p>
                <Badge variant="outline">
                  {sourceLabel}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
