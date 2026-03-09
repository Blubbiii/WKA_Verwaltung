"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Plus,
  X,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ChecklistItem {
  label: string;
  required?: boolean;
}

interface ParkOption {
  id: string;
  name: string;
}

interface ChecklistDetail {
  id: string;
  title: string;
  description: string | null;
  recurrence: string | null;
  isActive: boolean;
  items: ChecklistItem[];
  park: { id: string; name: string } | null;
  parkId: string | null;
  _count: { tasks: number };
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ChecklistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [checklist, setChecklist] = useState<ChecklistDetail | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    recurrence: "",
    parkId: "",
    items: [] as ChecklistItem[],
  });

  // Fetch checklist and parks
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [checklistRes, parksRes] = await Promise.all([
          fetch(`/api/management-billing/checklists/${id}`),
          fetch("/api/parks?limit=100"),
        ]);

        if (!cancelled) {
          if (checklistRes.ok) {
            const json = await checklistRes.json();
            const c = json.checklist;
            setChecklist(c);
            setFormData({
              title: c.title ?? "",
              description: c.description ?? "",
              recurrence: c.recurrence ?? "",
              parkId: c.parkId ?? c.park?.id ?? "",
              items: Array.isArray(c.items) ? c.items : [],
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

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleItemLabelChange(index: number, label: string) {
    setFormData((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], label };
      return { ...prev, items: updated };
    });
  }

  function handleItemRequiredChange(index: number, required: boolean) {
    setFormData((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], required };
      return { ...prev, items: updated };
    });
  }

  function addItem() {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { label: "", required: false }],
    }));
  }

  function removeItem(index: number) {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      toast.error("Titel ist erforderlich");
      return;
    }

    const validItems = formData.items.filter((item) => item.label.trim());
    if (validItems.length === 0) {
      toast.error("Mindestens ein Pruefpunkt ist erforderlich");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title: formData.title.trim(),
        description: formData.description || null,
        recurrence: formData.recurrence || null,
        parkId: formData.parkId || null,
        items: validItems.map((item) => ({
          label: item.label.trim(),
          required: item.required ?? false,
        })),
      };

      const res = await fetch(`/api/management-billing/checklists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Speichern der Checkliste"
        );
      }

      const json = await res.json();
      setChecklist(json.checklist);
      toast.success("Checkliste gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Checkliste"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/management-billing/checklists/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(
        errorData?.error ?? "Fehler beim Loeschen der Checkliste"
      );
    }

    toast.success("Checkliste geloescht");
    router.push("/management-billing/checklists");
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
            {Array.from({ length: 5 }).map((_, i) => (
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

  if (isError || !checklist) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/checklists">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Checkliste nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Die Checkliste konnte nicht geladen werden. Bitte versuchen Sie es
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
            <Link href="/management-billing/checklists">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{checklist.title}</h1>
            <p className="text-muted-foreground">
              {checklist._count.tasks} verknuepfte Aufgabe
              {checklist._count.tasks !== 1 ? "n" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/management-billing/tasks/new?checklistId=${checklist.id}`}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              Aufgabe erstellen
            </Link>
          </Button>
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
        {/* Left: Form */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Allgemein</CardTitle>
              <CardDescription>
                Grundeinstellungen der Checklisten-Vorlage
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
                  placeholder="Checklistenbezeichnung"
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
                  placeholder="Optionale Beschreibung"
                  rows={3}
                />
              </div>

              {/* Recurrence + Park */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recurrence">Wiederholung</Label>
                  <Select
                    value={formData.recurrence || "none"}
                    onValueChange={(value) =>
                      handleChange(
                        "recurrence",
                        value === "none" ? "" : value
                      )
                    }
                  >
                    <SelectTrigger id="recurrence">
                      <SelectValue placeholder="Wiederholung waehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine</SelectItem>
                      <SelectItem value="DAILY">Taeglich</SelectItem>
                      <SelectItem value="WEEKLY">Woechentlich</SelectItem>
                      <SelectItem value="MONTHLY">Monatlich</SelectItem>
                      <SelectItem value="ONCE">Einmalig</SelectItem>
                    </SelectContent>
                  </Select>
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
            </CardContent>
          </Card>

          {/* Items Editor */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pruefpunkte</CardTitle>
                  <CardDescription>
                    Definieren Sie die einzelnen Punkte dieser Checkliste
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Punkt hinzufuegen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {formData.items.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Noch keine Pruefpunkte vorhanden. Klicken Sie auf
                  &quot;Punkt hinzufuegen&quot;, um den ersten Punkt zu
                  erstellen.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <span className="text-sm text-muted-foreground font-mono w-6 text-center shrink-0">
                        {index + 1}
                      </span>
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          handleItemLabelChange(index, e.target.value)
                        }
                        placeholder="Pruefpunkt beschreiben..."
                        className="flex-1"
                      />
                      <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                        <Checkbox
                          checked={item.required ?? false}
                          onCheckedChange={(checked) =>
                            handleItemRequiredChange(index, checked === true)
                          }
                        />
                        <span className="text-sm">Pflicht</span>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informationen</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">
                    Verknuepfte Aufgaben
                  </dt>
                  <dd className="text-sm font-medium">
                    {checklist._count.tasks}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Status</dt>
                  <dd className="text-sm font-medium">
                    {checklist.isActive ? "Aktiv" : "Inaktiv"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">
                    Erstellt am
                  </dt>
                  <dd className="text-sm font-medium">
                    {new Date(checklist.createdAt).toLocaleDateString("de-DE")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {checklist._count.tasks > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-800">
                  Diese Checkliste kann nicht geloescht werden, da sie von{" "}
                  {checklist._count.tasks} Aufgabe
                  {checklist._count.tasks !== 1 ? "n" : ""} referenziert wird.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Checkliste loeschen"
        itemName={checklist.title}
      />
    </div>
  );
}
