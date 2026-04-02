"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

interface InspectionPlanOption {
  id: string;
  title: string;
}

interface DefectEntry {
  id: string;
  title: string;
  severity: string;
  status: string;
  dueDate: string | null;
  costEstimateEur: number | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
}

interface InspectionReportDetail {
  id: string;
  inspectionDate: string;
  inspector: string | null;
  result: string | null;
  summary: string | null;
  parkId: string | null;
  turbineId: string | null;
  inspectionPlanId: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionPlan: { id: string; title: string } | null;
  defects: DefectEntry[];
  createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RESULT_OPTIONS = [
  { value: "OK", label: "OK" },
  { value: "DEFECTS_FOUND", label: "Mängel festgestellt" },
  { value: "FAILED", label: "Nicht bestanden" },
];

const resultBadgeColors: Record<string, string> = {
  OK: "bg-green-100 text-green-800",
  DEFECTS_FOUND: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
};

const severityLabels: Record<string, string> = {
  LOW: "Gering",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
  CRITICAL: "Kritisch",
};

const severityBadgeColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  CANCELLED: "Abgebrochen",
};

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy", { locale: de });
  } catch {
    return "-";
  }
}

function toInputDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function InspectionReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const [report, setReport] = useState<InspectionReportDetail | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [_plans, setPlans] = useState<InspectionPlanOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    inspectionDate: "",
    inspector: "",
    result: "",
    summary: "",
    parkId: "",
    turbineId: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [reportRes, parksRes, plansRes] = await Promise.all([
          fetch(`/api/management-billing/inspection-reports/${id}`),
          fetch("/api/parks"),
          fetch("/api/management-billing/inspection-plans?isActive=true"),
        ]);

        if (!cancelled) {
          if (reportRes.ok) {
            const json = await reportRes.json();
            const r = json.report;
            setReport(r);
            setFormData({
              inspectionDate: toInputDate(r.inspectionDate),
              inspector: r.inspector ?? "",
              result: r.result ?? "",
              summary: r.summary ?? "",
              parkId: r.parkId ?? "",
              turbineId: r.turbineId ?? "",
            });
          } else {
            setIsError(true);
          }

          if (parksRes.ok) {
            const parksJson = await parksRes.json();
            setParks(parksJson.parks ?? parksJson.data ?? []);
          }

          if (plansRes.ok) {
            const plansJson = await plansRes.json();
            setPlans(
              (plansJson.plans ?? []).map((p: { id: string; title: string }) => ({
                id: p.id,
                title: p.title,
              }))
            );
          }
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!formData.inspectionDate) {
      toast.error("Bitte geben Sie ein Datum ein");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(
        `/api/management-billing/inspection-reports/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionDate: formData.inspectionDate,
            inspector: formData.inspector || null,
            result: formData.result || null,
            summary: formData.summary || null,
            parkId: formData.parkId || null,
            turbineId: formData.turbineId || null,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Speichern");
      }

      toast.success("Prüfbericht gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Möchten Sie diesen Prüfbericht wirklich löschen?")) return;

    try {
      setDeleting(true);
      const res = await fetch(
        `/api/management-billing/inspection-reports/${id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Löschen");
      }

      toast.success("Prüfbericht gelöscht");
      router.push("/management-billing/inspections/reports");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Löschen"
      );
    } finally {
      setDeleting(false);
    }
  }

  // =========================================================================
  // LOADING STATE
  // =========================================================================

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================

  if (isError || !report) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/inspections/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Prüfbericht nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Der Prüfbericht konnte nicht geladen werden.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // MAIN RENDER
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/inspections/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                Prüfbericht {formatDate(report.inspectionDate)}
              </h1>
              {report.result && (
                <Badge
                  variant="secondary"
                  className={resultBadgeColors[report.result] ?? ""}
                >
                  {RESULT_OPTIONS.find((o) => o.value === report.result)?.label ??
                    report.result}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {report.park?.name ?? "Kein Park"}
              {report.inspectionPlan
                ? ` - ${report.inspectionPlan.title}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Löschen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Berichtsdetails</CardTitle>
            <CardDescription>Begehungsdaten bearbeiten</CardDescription>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="result">Ergebnis</Label>
                <Select
                  value={formData.result || "none"}
                  onValueChange={(v) =>
                    handleChange("result", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger id="result">
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
                <Label htmlFor="parkId">Windpark</Label>
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
              </div>
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

            {report.inspectionPlan && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Verknüpfter Prüfplan</p>
                <Link
                  href={`/management-billing/inspections/plans/${report.inspectionPlan.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {report.inspectionPlan.title}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Defects List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Mängel ({report.defects.length})
                </CardTitle>
                <CardDescription>
                  Festgestellte Mängel bei dieser Begehung
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/management-billing/inspections/defects/new?reportId=${id}`}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Mangel hinzufügen
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {report.defects.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Schweregrad</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Frist</TableHead>
                      <TableHead className="text-right">Kosten</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.defects.map((defect) => (
                      <TableRow key={defect.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/management-billing/inspections/defects/${defect.id}`}
                            className="hover:underline"
                          >
                            {defect.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              severityBadgeColors[defect.severity] ?? ""
                            }
                          >
                            {severityLabels[defect.severity] ??
                              defect.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              statusBadgeColors[defect.status] ?? ""
                            }
                          >
                            {statusLabels[defect.status] ?? defect.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(defect.dueDate)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(defect.costEstimateEur)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Keine Mängel erfasst
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
