"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

// =============================================================================
// TYPES
// =============================================================================

interface MeasureDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  costEstimateEur: number | string | null;
  actualCostEur: number | string | null;
  benefitNotes: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
  ON_HOLD: "Pausiert",
};

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
};

const priorityLabels: Record<string, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
  CRITICAL: "Kritisch",
};

const CATEGORY_OPTIONS = [
  "Ertragssteigerung",
  "Kostensenkung",
  "Verfuegbarkeit",
  "Sicherheit",
  "Sonstiges",
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function MeasureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const [measure, setMeasure] = useState<MeasureDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Editable form
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    priority: "MEDIUM",
    status: "OPEN",
    dueDate: "",
    costEstimateEur: "",
    actualCostEur: "",
    benefitNotes: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch(`/api/management-billing/tasks/${id}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        const data: MeasureDetail = json.task ?? json;
        if (!cancelled) {
          setMeasure(data);
          setFormData({
            title: data.title,
            description: data.description ?? "",
            category: data.category ?? "",
            priority: data.priority,
            status: data.status,
            dueDate: data.dueDate ? data.dueDate.slice(0, 10) : "",
            costEstimateEur: data.costEstimateEur != null ? String(parseFloat(String(data.costEstimateEur))) : "",
            actualCostEur: data.actualCostEur != null ? String(parseFloat(String(data.actualCostEur))) : "",
            benefitNotes: data.benefitNotes ?? "",
          });
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      toast.error("Bitte geben Sie einen Titel ein");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: formData.title,
        description: formData.description || null,
        category: formData.category || null,
        priority: formData.priority,
        status: formData.status,
        dueDate: formData.dueDate || null,
        costEstimateEur: formData.costEstimateEur ? parseFloat(formData.costEstimateEur) : null,
        actualCostEur: formData.actualCostEur ? parseFloat(formData.actualCostEur) : null,
        benefitNotes: formData.benefitNotes || null,
        taskType: "IMPROVEMENT",
      };

      const res = await fetch(`/api/management-billing/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error ?? "Fehler beim Speichern");
      }

      const json = await res.json();
      setMeasure(json.task ?? json);
      toast.success("Massnahme gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/management-billing/tasks/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error ?? "Fehler beim Loeschen");
    }
    toast.success("Massnahme geloescht");
    router.push("/management-billing/optimization");
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
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
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

  if (isError || !measure) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/optimization">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Massnahme nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Die Massnahme konnte nicht geladen werden.
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
            <Link href="/management-billing/optimization">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{measure.title}</h1>
              <Badge
                variant="secondary"
                className={statusBadgeColors[measure.status] ?? ""}
              >
                {statusLabels[measure.status] ?? measure.status}
              </Badge>
            </div>
            {measure.category && (
              <p className="text-muted-foreground text-sm">{measure.category}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Loeschen
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
        {/* Left: Editable fields */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Massnahme</CardTitle>
              <CardDescription>Grundlegende Informationen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Kategorie</Label>
                  <Select
                    value={formData.category || "none"}
                    onValueChange={(value) =>
                      handleChange("category", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Kategorie waehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine Kategorie</SelectItem>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  rows={4}
                  placeholder="Detaillierte Beschreibung der Massnahme..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="priority">Prioritaet</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleChange("priority", value)}
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Niedrig</SelectItem>
                      <SelectItem value="MEDIUM">Mittel</SelectItem>
                      <SelectItem value="HIGH">Hoch</SelectItem>
                      <SelectItem value="CRITICAL">Kritisch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleChange("status", value)}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Offen</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Bearbeitung</SelectItem>
                      <SelectItem value="COMPLETED">Abgeschlossen</SelectItem>
                      <SelectItem value="CANCELLED">Abgebrochen</SelectItem>
                      <SelectItem value="ON_HOLD">Pausiert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Faellig am</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => handleChange("dueDate", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kosten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="costEstimateEur">Geschaetzte Kosten (EUR)</Label>
                  <Input
                    id="costEstimateEur"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.costEstimateEur}
                    onChange={(e) => handleChange("costEstimateEur", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualCostEur">Tatsaechliche Kosten (EUR)</Label>
                  <Input
                    id="actualCostEur"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.actualCostEur}
                    onChange={(e) => handleChange("actualCostEur", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kosten-Nutzen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="benefitNotes">Kosten-Nutzen-Beschreibung</Label>
                <Textarea
                  id="benefitNotes"
                  value={formData.benefitNotes}
                  onChange={(e) => handleChange("benefitNotes", e.target.value)}
                  rows={3}
                  placeholder="Erwarteter Nutzen, ROI-Betrachtung, Einsparungen..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                {measure.park && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Park</dt>
                    <dd className="text-sm font-medium">{measure.park.name}</dd>
                  </div>
                )}
                {measure.turbine && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Anlage</dt>
                    <dd className="text-sm font-medium">{measure.turbine.name}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Prioritaet</dt>
                  <dd className="text-sm font-medium">
                    {priorityLabels[measure.priority] ?? measure.priority}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Erstellt am</dt>
                  <dd className="text-sm font-medium">
                    {formatDate(measure.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Zuletzt geaendert</dt>
                  <dd className="text-sm font-medium">
                    {formatDate(measure.updatedAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Aenderungen werden erst nach Klick auf &quot;Speichern&quot; uebernommen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Massnahme loeschen"
        itemName={measure.title}
      />
    </div>
  );
}
