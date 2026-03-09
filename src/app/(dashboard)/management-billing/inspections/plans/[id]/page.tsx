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
  FileText,
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
import { Switch } from "@/components/ui/switch";
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

interface LinkedReport {
  id: string;
  inspectionDate: string;
  inspector: string | null;
  result: string | null;
  _count: { defects: number };
}

interface InspectionPlanDetail {
  id: string;
  title: string;
  description: string | null;
  recurrence: string;
  nextDueDate: string;
  isActive: boolean;
  parkId: string | null;
  turbineId: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionReports: LinkedReport[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RECURRENCE_OPTIONS = [
  { value: "MONTHLY", label: "Monatlich" },
  { value: "QUARTERLY", label: "Quartalsweise" },
  { value: "SEMI_ANNUAL", label: "Halbjährlich" },
  { value: "ANNUAL", label: "Jährlich" },
];

const resultLabels: Record<string, string> = {
  OK: "OK",
  DEFECTS_FOUND: "Mängel festgestellt",
  FAILED: "Nicht bestanden",
};

const resultBadgeColors: Record<string, string> = {
  OK: "bg-green-100 text-green-800",
  DEFECTS_FOUND: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
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

export default function InspectionPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const [plan, setPlan] = useState<InspectionPlanDetail | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    recurrence: "",
    nextDueDate: "",
    parkId: "",
    turbineId: "",
    isActive: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [planRes, parksRes] = await Promise.all([
          fetch(`/api/management-billing/inspection-plans/${id}`),
          fetch("/api/parks"),
        ]);

        if (!cancelled) {
          if (planRes.ok) {
            const planJson = await planRes.json();
            const p = planJson.plan;
            setPlan(p);
            setFormData({
              title: p.title ?? "",
              description: p.description ?? "",
              recurrence: p.recurrence ?? "",
              nextDueDate: toInputDate(p.nextDueDate),
              parkId: p.parkId ?? "",
              turbineId: p.turbineId ?? "",
              isActive: p.isActive ?? true,
            });
          } else {
            setIsError(true);
          }

          if (parksRes.ok) {
            const parksJson = await parksRes.json();
            setParks(parksJson.parks ?? parksJson.data ?? []);
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

  function handleChange(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!formData.title || !formData.recurrence || !formData.nextDueDate) {
      toast.error("Titel, Turnus und Nächster Termin sind erforderlich");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(
        `/api/management-billing/inspection-plans/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description || null,
            recurrence: formData.recurrence,
            nextDueDate: formData.nextDueDate,
            parkId: formData.parkId || null,
            turbineId: formData.turbineId || null,
            isActive: formData.isActive,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Speichern");
      }

      toast.success("Prüfplan gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Möchten Sie diesen Prüfplan wirklich löschen?")) return;

    try {
      setDeleting(true);
      const res = await fetch(
        `/api/management-billing/inspection-plans/${id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Löschen");
      }

      toast.success("Prüfplan gelöscht");
      router.push("/management-billing/inspections/plans");
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

  if (isError || !plan) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/inspections/plans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Prüfplan nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Der Prüfplan konnte nicht geladen werden.
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
            <Link href="/management-billing/inspections/plans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{plan.title}</h1>
            <p className="text-muted-foreground">Prüfplan bearbeiten</p>
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
            <CardTitle>Prüfplan-Details</CardTitle>
            <CardDescription>
              Grunddaten und Turnus der Begehung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="z.B. Jahresbegehung WEA 1-5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Optionale Beschreibung..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recurrence">Turnus *</Label>
                <Select
                  value={formData.recurrence}
                  onValueChange={(v) => handleChange("recurrence", v)}
                >
                  <SelectTrigger id="recurrence">
                    <SelectValue placeholder="Turnus wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextDueDate">Nächster Termin *</Label>
                <Input
                  id="nextDueDate"
                  type="date"
                  value={formData.nextDueDate}
                  onChange={(e) => handleChange("nextDueDate", e.target.value)}
                />
              </div>
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

            <div className="flex items-center gap-4 pt-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  handleChange("isActive", checked)
                }
              />
              <Label htmlFor="isActive">Prüfplan aktiv</Label>
            </div>
          </CardContent>
        </Card>

        {/* Linked Reports */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Zugehörige Berichte
                </CardTitle>
                <CardDescription>
                  Letzte Prüfberichte zu diesem Plan
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/management-billing/inspections/reports/new?planId=${id}`}
                >
                  Neuer Bericht
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {plan.inspectionReports && plan.inspectionReports.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Prüfer</TableHead>
                      <TableHead>Ergebnis</TableHead>
                      <TableHead className="text-center">Mängel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.inspectionReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          <Link
                            href={`/management-billing/inspections/reports/${report.id}`}
                            className="hover:underline"
                          >
                            {formatDate(report.inspectionDate)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {report.inspector ?? "-"}
                        </TableCell>
                        <TableCell>
                          {report.result ? (
                            <Badge
                              variant="secondary"
                              className={
                                resultBadgeColors[report.result] ?? ""
                              }
                            >
                              {resultLabels[report.result] ?? report.result}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {report._count.defects}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Noch keine Berichte vorhanden
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
