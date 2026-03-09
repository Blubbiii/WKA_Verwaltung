"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface ChecklistItem {
  label: string;
  required?: boolean;
  checked?: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  taskType: string;
  category: string | null;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  checklistData: ChecklistItem[] | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; name: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  checklist: { id: string; title: string } | null;
  createdBy: { id: string; name: string; email: string } | null;
  parkId: string | null;
  turbineId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ParkOption {
  id: string;
  name: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusLabels: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  CANCELLED: "Abgebrochen",
};

const statusColors: Record<TaskStatus, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("de-DE");
  } catch {
    return "-";
  }
}

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "OPEN" as TaskStatus,
    priority: 2,
    dueDate: "",
    notes: "",
    parkId: "",
    checklistData: null as ChecklistItem[] | null,
  });

  // Fetch task and parks
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [taskRes, parksRes] = await Promise.all([
          fetch(`/api/management-billing/tasks/${id}`),
          fetch("/api/parks?limit=100"),
        ]);

        if (!cancelled) {
          if (taskRes.ok) {
            const json = await taskRes.json();
            const t = json.task;
            setTask(t);
            setFormData({
              title: t.title ?? "",
              description: t.description ?? "",
              status: t.status ?? "OPEN",
              priority: t.priority ?? 2,
              dueDate: toDateInputValue(t.dueDate),
              notes: t.notes ?? "",
              parkId: t.parkId ?? t.park?.id ?? "",
              checklistData: Array.isArray(t.checklistData)
                ? t.checklistData
                : null,
            });
          } else {
            setIsError(true);
          }

          if (parksRes.ok) {
            const json = await parksRes.json();
            setParks(
              (json.data ?? []).map((p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
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

  function handleChange(field: string, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleChecklistToggle(index: number, checked: boolean) {
    setFormData((prev) => {
      if (!prev.checklistData) return prev;
      const updated = [...prev.checklistData];
      updated[index] = { ...updated[index], checked };
      return { ...prev, checklistData: updated };
    });
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      toast.error("Titel ist erforderlich");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title: formData.title.trim(),
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate || null,
        notes: formData.notes || null,
        parkId: formData.parkId || null,
        checklistData: formData.checklistData,
      };

      const res = await fetch(`/api/management-billing/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Speichern der Aufgabe"
        );
      }

      const json = await res.json();
      setTask(json.task);
      toast.success("Aufgabe gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Aufgabe"
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
      throw new Error(
        errorData?.error ?? "Fehler beim Loeschen der Aufgabe"
      );
    }

    toast.success("Aufgabe geloescht");
    router.push("/management-billing/tasks");
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
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================

  if (isError || !task) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/tasks">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Aufgabe nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Die Aufgabe konnte nicht geladen werden. Bitte versuchen Sie es
              erneut oder kehren Sie zur Uebersicht zurueck.
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
            <Link href="/management-billing/tasks">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <Badge
                variant="secondary"
                className={statusColors[task.status] ?? ""}
              >
                {statusLabels[task.status] ?? task.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {task.park?.name ?? "Kein Park"} - Erstellt{" "}
              {formatDateTime(task.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
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
        {/* Left: Main form */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Aufgabendetails</CardTitle>
              <CardDescription>
                Bearbeiten Sie die Aufgabe und aktualisieren Sie den Status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Aufgabenbezeichnung"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleChange("description", e.target.value)
                  }
                  placeholder="Detaillierte Beschreibung der Aufgabe"
                  rows={4}
                />
              </div>

              {/* Status + Priority */}
              <div className="grid gap-4 sm:grid-cols-2">
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
                      <SelectItem value="IN_PROGRESS">
                        In Bearbeitung
                      </SelectItem>
                      <SelectItem value="DONE">Erledigt</SelectItem>
                      <SelectItem value="CANCELLED">Abgebrochen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioritaet</Label>
                  <Select
                    value={String(formData.priority)}
                    onValueChange={(value) =>
                      handleChange("priority", parseInt(value, 10))
                    }
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Hoch</SelectItem>
                      <SelectItem value="2">Normal</SelectItem>
                      <SelectItem value="3">Niedrig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Due Date + Park */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Faellig am</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => handleChange("dueDate", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parkId">Windpark</Label>
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) =>
                      handleChange("parkId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Park waehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Park</SelectItem>
                      {parks.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notizen</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Zusaetzliche Notizen"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Checklist */}
          {formData.checklistData && formData.checklistData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Checkliste</CardTitle>
                <CardDescription>
                  {formData.checklistData.filter((item) => item.checked).length}{" "}
                  von {formData.checklistData.length} Punkten erledigt
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {formData.checklistData.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={item.checked ?? false}
                        onCheckedChange={(checked) =>
                          handleChecklistToggle(index, checked === true)
                        }
                      />
                      <span
                        className={
                          item.checked
                            ? "line-through text-muted-foreground"
                            : ""
                        }
                      >
                        {item.label}
                      </span>
                      {item.required && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          Pflicht
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Metadata */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informationen</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">
                    Zugewiesen an
                  </dt>
                  <dd className="text-sm font-medium">
                    {task.assignedTo?.name ?? "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">
                    Erstellt von
                  </dt>
                  <dd className="text-sm font-medium">
                    {task.createdBy?.name ?? "-"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">
                    Erstellt am
                  </dt>
                  <dd className="text-sm font-medium">
                    {formatDateTime(task.createdAt)}
                  </dd>
                </div>
                {task.completedAt && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">
                      Abgeschlossen
                    </dt>
                    <dd className="text-sm font-medium">
                      {formatDateTime(task.completedAt)}
                    </dd>
                  </div>
                )}
                {task.turbine && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">
                      Turbine
                    </dt>
                    <dd className="text-sm font-medium">
                      {task.turbine.name}
                    </dd>
                  </div>
                )}
                {task.checklist && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">
                      Checkliste
                    </dt>
                    <dd className="text-sm font-medium">
                      <Link
                        href={`/management-billing/checklists/${task.checklist.id}`}
                        className="text-primary hover:underline"
                      >
                        {task.checklist.title}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Aufgabe loeschen"
        itemName={task.title}
      />
    </div>
  );
}
