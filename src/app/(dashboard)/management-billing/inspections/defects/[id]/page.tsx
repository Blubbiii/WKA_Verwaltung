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
  Shield,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface InsuranceClaim {
  id: string;
  claimNumber: string | null;
  title: string;
  status: string;
  incidentDate: string | null;
}

interface DefectDetail {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  dueDate: string | null;
  costEstimateEur: number | null;
  actualCostEur: number | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  parkId: string | null;
  turbineId: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionReport: {
    id: string;
    inspectionDate: string;
    inspector: string | null;
    result: string | null;
  } | null;
  insuranceClaims: InsuranceClaim[];
  createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
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

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Offen" },
  { value: "IN_PROGRESS", label: "In Bearbeitung" },
  { value: "DONE", label: "Erledigt" },
  { value: "CANCELLED", label: "Abgebrochen" },
];

const severityBadgeColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

const resultLabels: Record<string, string> = {
  OK: "OK",
  DEFECTS_FOUND: "Mängel festgestellt",
  FAILED: "Nicht bestanden",
};

const claimStatusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
  PAID: "Bezahlt",
  CLOSED: "Geschlossen",
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

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function DefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const [defect, setDefect] = useState<DefectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    severity: "",
    status: "",
    dueDate: "",
    costEstimateEur: "",
    actualCostEur: "",
    resolutionNotes: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch(`/api/management-billing/defects/${id}`);

        if (!cancelled) {
          if (res.ok) {
            const json = await res.json();
            const d = json.defect;
            setDefect(d);
            setFormData({
              title: d.title ?? "",
              description: d.description ?? "",
              severity: d.severity ?? "MEDIUM",
              status: d.status ?? "OPEN",
              dueDate: toInputDate(d.dueDate),
              costEstimateEur:
                d.costEstimateEur !== null ? String(d.costEstimateEur) : "",
              actualCostEur:
                d.actualCostEur !== null ? String(d.actualCostEur) : "",
              resolutionNotes: d.resolutionNotes ?? "",
            });
          } else {
            setIsError(true);
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
    if (!formData.title) {
      toast.error("Bitte geben Sie einen Titel ein");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/management-billing/defects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          severity: formData.severity,
          status: formData.status,
          dueDate: formData.dueDate || null,
          costEstimateEur: formData.costEstimateEur
            ? parseFloat(formData.costEstimateEur)
            : null,
          actualCostEur: formData.actualCostEur
            ? parseFloat(formData.actualCostEur)
            : null,
          resolutionNotes: formData.resolutionNotes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Speichern");
      }

      toast.success("Mangel gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Möchten Sie diesen Mangel wirklich löschen?")) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/management-billing/defects/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Löschen");
      }

      toast.success("Mangel gelöscht");
      router.push("/management-billing/inspections/defects");
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
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
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

  if (isError || !defect) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/inspections/defects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Mangel nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Der Mangel konnte nicht geladen werden.
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
            <Link href="/management-billing/inspections/defects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{defect.title}</h1>
              <Badge
                variant="secondary"
                className={severityBadgeColors[defect.severity] ?? ""}
              >
                {SEVERITY_OPTIONS.find((o) => o.value === defect.severity)
                  ?.label ?? defect.severity}
              </Badge>
              <Badge
                variant="secondary"
                className={statusBadgeColors[defect.status] ?? ""}
              >
                {STATUS_OPTIONS.find((o) => o.value === defect.status)?.label ??
                  defect.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {defect.park?.name ?? "Kein Park"}
              {defect.turbine ? ` - ${defect.turbine.designation}` : ""}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form (Left/Center) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mangeldetails</CardTitle>
            <CardDescription>Mangel bearbeiten und dokumentieren</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Kurzbeschreibung des Mangels"
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
                <Label htmlFor="severity">Schweregrad</Label>
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
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => handleChange("status", v)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="dueDate">Frist</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => handleChange("dueDate", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="costEstimateEur">Geschätzte Kosten (EUR)</Label>
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="actualCostEur">Tatsächliche Kosten (EUR)</Label>
                <Input
                  id="actualCostEur"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.actualCostEur}
                  onChange={(e) =>
                    handleChange("actualCostEur", e.target.value)
                  }
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolutionNotes">Behebungsnotizen</Label>
              <Textarea
                id="resolutionNotes"
                value={formData.resolutionNotes}
                onChange={(e) =>
                  handleChange("resolutionNotes", e.target.value)
                }
                placeholder="Dokumentation der Mangelbehebung..."
                rows={3}
              />
            </div>

            {defect.resolvedAt && (
              <p className="text-sm text-muted-foreground">
                Behoben am: {formatDate(defect.resolvedAt)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sidebar (Right) */}
        <div className="space-y-6">
          {/* Linked Inspection Report */}
          {defect.inspectionReport && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Prüfbericht
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Datum</dt>
                    <dd className="font-medium">
                      {formatDate(defect.inspectionReport.inspectionDate)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Prüfer</dt>
                    <dd className="font-medium">
                      {defect.inspectionReport.inspector ?? "-"}
                    </dd>
                  </div>
                  {defect.inspectionReport.result && (
                    <div className="flex justify-between text-sm">
                      <dt className="text-muted-foreground">Ergebnis</dt>
                      <dd>
                        <Badge variant="secondary">
                          {resultLabels[defect.inspectionReport.result] ??
                            defect.inspectionReport.result}
                        </Badge>
                      </dd>
                    </div>
                  )}
                </dl>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  asChild
                >
                  <Link
                    href={`/management-billing/inspections/reports/${defect.inspectionReport.id}`}
                  >
                    Bericht anzeigen
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Insurance Claims */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Versicherungsfälle
              </CardTitle>
              <CardDescription>
                Verknüpfte Versicherungsmeldungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {defect.insuranceClaims && defect.insuranceClaims.length > 0 ? (
                <div className="space-y-2">
                  {defect.insuranceClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{claim.title}</span>
                        <Badge variant="secondary">
                          {claimStatusLabels[claim.status] ?? claim.status}
                        </Badge>
                      </div>
                      {claim.claimNumber && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Nr. {claim.claimNumber}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Keine Versicherungsfälle verknüpft
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                asChild
              >
                <Link
                  href={`/management-billing/insurance/claims/new?defectId=${id}`}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Versicherungsfall melden
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Meta Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informationen</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Park</dt>
                  <dd className="font-medium">
                    {defect.park?.name ?? "-"}
                  </dd>
                </div>
                {defect.turbine && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Anlage</dt>
                    <dd className="font-medium">
                      {defect.turbine.designation}
                    </dd>
                  </div>
                )}
                {defect.createdBy && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Erstellt von</dt>
                    <dd className="font-medium">
                      {`${defect.createdBy.firstName ?? ""} ${defect.createdBy.lastName ?? ""}`.trim() ||
                        "-"}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
