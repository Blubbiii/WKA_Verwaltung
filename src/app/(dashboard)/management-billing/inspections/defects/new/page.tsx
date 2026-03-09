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

interface ReportOption {
  id: string;
  inspectionDate: string;
  inspector: string | null;
  park: { id: string; name: string } | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Gering" },
  { value: "MEDIUM", label: "Mittel" },
  { value: "HIGH", label: "Hoch" },
  { value: "CRITICAL", label: "Kritisch" },
];

// =============================================================================
// HELPERS
// =============================================================================

function formatReportLabel(report: ReportOption): string {
  const date = new Date(report.inspectionDate).toLocaleDateString("de-DE");
  const inspector = report.inspector ?? "Unbekannt";
  const park = report.park?.name ?? "";
  return `${date} - ${inspector}${park ? ` (${park})` : ""}`;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewDefectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedReportId = searchParams.get("reportId") ?? "";

  const [parks, setParks] = useState<ParkOption[]>([]);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    severity: "MEDIUM",
    dueDate: "",
    costEstimateEur: "",
    parkId: "",
    turbineId: "",
    inspectionReportId: preselectedReportId,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [parksRes, reportsRes] = await Promise.all([
          fetch("/api/parks"),
          fetch("/api/management-billing/inspection-reports"),
        ]);

        if (!cancelled) {
          if (parksRes.ok) {
            const json = await parksRes.json();
            setParks(json.parks ?? json.data ?? []);
          }
          if (reportsRes.ok) {
            const json = await reportsRes.json();
            setReports(
              (json.reports ?? []).map(
                (r: {
                  id: string;
                  inspectionDate: string;
                  inspector: string | null;
                  park: { id: string; name: string } | null;
                }) => ({
                  id: r.id,
                  inspectionDate: r.inspectionDate,
                  inspector: r.inspector,
                  park: r.park,
                })
              )
            );
          }
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setParksLoading(false);
          setReportsLoading(false);
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

    if (!formData.title) {
      toast.error("Bitte geben Sie einen Titel ein");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/management-billing/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          severity: formData.severity,
          dueDate: formData.dueDate || null,
          costEstimateEur: formData.costEstimateEur
            ? parseFloat(formData.costEstimateEur)
            : null,
          parkId: formData.parkId || null,
          turbineId: formData.turbineId || null,
          inspectionReportId: formData.inspectionReportId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Erstellen");
      }

      toast.success("Mangel erfasst");

      // If created from a report, go back to that report
      if (preselectedReportId) {
        router.push(
          `/management-billing/inspections/reports/${preselectedReportId}`
        );
      } else {
        router.push("/management-billing/inspections/defects");
      }
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
            <Link href="/management-billing/inspections/defects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neuen Mangel erfassen</h1>
            <p className="text-muted-foreground">
              Mangel aus einer Begehung oder Kontrolle dokumentieren
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
              <CardTitle>Mangeldetails</CardTitle>
              <CardDescription>
                Beschreibung und Schwere des Mangels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="z.B. Korrosion an Turmflansch"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Detaillierte Beschreibung des Mangels..."
                  rows={4}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="severity">Schweregrad *</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(v) => handleChange("severity", v)}
                  >
                    <SelectTrigger id="severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dueDate">Behebungsfrist</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => handleChange("dueDate", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="costEstimateEur">
                  Geschätzte Kosten (EUR)
                </Label>
                <Input
                  id="costEstimateEur"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.costEstimateEur}
                  onChange={(e) =>
                    handleChange("costEstimateEur", e.target.value)
                  }
                  placeholder="0,00"
                  className="max-w-sm"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
              <CardDescription>Park und Prüfbericht verknüpfen</CardDescription>
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
                <Label htmlFor="inspectionReportId">
                  Prüfbericht (optional)
                </Label>
                {reportsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.inspectionReportId || "none"}
                    onValueChange={(v) =>
                      handleChange("inspectionReportId", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger id="inspectionReportId">
                      <SelectValue placeholder="Bericht wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Bericht</SelectItem>
                      {reports.map((report) => (
                        <SelectItem key={report.id} value={report.id}>
                          {formatReportLabel(report)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Ordnet diesen Mangel einem Prüfbericht zu
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Nach dem Erstellen können Sie den Mangel bearbeiten, Kosten
                dokumentieren und einen Versicherungsfall melden.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
