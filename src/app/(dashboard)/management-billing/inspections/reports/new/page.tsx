"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface ParkOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  title: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RESULT_OPTIONS = [
  { value: "OK", label: "OK" },
  { value: "DEFECTS_FOUND", label: "Mängel festgestellt" },
  { value: "FAILED", label: "Nicht bestanden" },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewInspectionReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPlanId = searchParams.get("planId") ?? "";

  const [parks, setParks] = useState<ParkOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    inspectionDate: "",
    inspector: "",
    result: "",
    summary: "",
    parkId: "",
    turbineId: "",
    inspectionPlanId: preselectedPlanId,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [parksRes, plansRes] = await Promise.all([
          fetch("/api/parks"),
          fetch("/api/management-billing/inspection-plans?isActive=true"),
        ]);

        if (!cancelled) {
          if (parksRes.ok) {
            const json = await parksRes.json();
            setParks(json.parks ?? json.data ?? []);
          }
          if (plansRes.ok) {
            const json = await plansRes.json();
            setPlans(
              (json.plans ?? []).map((p: { id: string; title: string }) => ({
                id: p.id,
                title: p.title,
              }))
            );
          }
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setParksLoading(false);
          setPlansLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.inspectionDate) {
      toast.error("Bitte geben Sie ein Begehungsdatum ein");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/management-billing/inspection-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionDate: formData.inspectionDate,
          inspector: formData.inspector || null,
          result: formData.result || null,
          summary: formData.summary || null,
          parkId: formData.parkId || null,
          turbineId: formData.turbineId || null,
          inspectionPlanId: formData.inspectionPlanId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Erstellen");
      }

      toast.success("Prüfbericht erstellt");
      router.push("/management-billing/inspections/reports");
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
            <Link href="/management-billing/inspections/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neuen Prüfbericht anlegen</h1>
            <p className="text-muted-foreground">
              Begehungsergebnis dokumentieren
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
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Berichtsdetails</CardTitle>
              <CardDescription>
                Grunddaten der Begehung erfassen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inspectionDate">Begehungsdatum *</Label>
                  <Input
                    id="inspectionDate"
                    type="date"
                    value={formData.inspectionDate}
                    onChange={(e) =>
                      handleChange("inspectionDate", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inspector">Prüfer</Label>
                  <Input
                    id="inspector"
                    value={formData.inspector}
                    onChange={(e) => handleChange("inspector", e.target.value)}
                    placeholder="Name des Prüfers"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="result">Ergebnis</Label>
                <Select
                  value={formData.result || "none"}
                  onValueChange={(v) =>
                    handleChange("result", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger id="result" className="max-w-sm">
                    <SelectValue placeholder="Ergebnis wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Ergebnis</SelectItem>
                    {RESULT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Zusammenfassung</Label>
                <Textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleChange("summary", e.target.value)}
                  placeholder="Zusammenfassung der Begehung..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
              <CardDescription>
                Park und Prüfplan verknüpfen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="parkId">Windpark</Label>
                {parksLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(v) =>
                      handleChange("parkId", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Park wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Park</SelectItem>
                      {parks.map((park) => (
                        <SelectItem key={park.id} value={park.id}>
                          {park.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspectionPlanId">Prüfplan (optional)</Label>
                {plansLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.inspectionPlanId || "none"}
                    onValueChange={(v) =>
                      handleChange("inspectionPlanId", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger id="inspectionPlanId">
                      <SelectValue placeholder="Prüfplan wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Prüfplan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Ordnet diesen Bericht einem bestehenden Prüfplan zu
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Nach dem Erstellen können Sie dem Bericht Mängel hinzufügen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
