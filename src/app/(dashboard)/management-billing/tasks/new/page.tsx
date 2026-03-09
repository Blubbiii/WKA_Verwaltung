"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface ParkOption {
  id: string;
  name: string;
}

interface ChecklistItem {
  label: string;
  required?: boolean;
  checked?: boolean;
}

interface ChecklistTemplate {
  id: string;
  title: string;
  description: string | null;
  items: ChecklistItem[];
  park: { id: string; name: string } | null;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checklistIdFromQuery = searchParams.get("checklistId");

  const [saving, setSaving] = useState(false);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: 2,
    dueDate: "",
    notes: "",
    parkId: "",
    checklistId: "",
    checklistData: null as ChecklistItem[] | null,
  });

  // Fetch parks and checklists
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [parksRes, checklistsRes] = await Promise.all([
          fetch("/api/parks?limit=100"),
          fetch("/api/management-billing/checklists"),
        ]);

        if (!cancelled) {
          if (parksRes.ok) {
            const json = await parksRes.json();
            setParks(
              (json.data ?? []).map((p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
              }))
            );
          }

          if (checklistsRes.ok) {
            const json = await checklistsRes.json();
            const list = json.checklists ?? [];
            setChecklists(list);

            // Pre-fill from query parameter
            if (checklistIdFromQuery) {
              const template = list.find(
                (c: ChecklistTemplate) => c.id === checklistIdFromQuery
              );
              if (template) {
                const items = Array.isArray(template.items)
                  ? template.items.map((item: ChecklistItem) => ({
                      ...item,
                      checked: false,
                    }))
                  : null;
                setFormData((prev) => ({
                  ...prev,
                  checklistId: template.id,
                  checklistData: items,
                  parkId: template.park?.id ?? prev.parkId,
                  title: `${template.title} - ${new Date().toLocaleDateString("de-DE")}`,
                }));
              }
            }
          }
        }
      } catch {
        if (!cancelled) toast.error("Fehler beim Laden der Daten");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [checklistIdFromQuery]);

  function handleChange(field: string, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleChecklistSelect(checklistId: string) {
    if (checklistId === "none") {
      setFormData((prev) => ({
        ...prev,
        checklistId: "",
        checklistData: null,
      }));
      return;
    }

    const template = checklists.find((c) => c.id === checklistId);
    if (template) {
      const items = Array.isArray(template.items)
        ? template.items.map((item) => ({ ...item, checked: false }))
        : null;
      setFormData((prev) => ({
        ...prev,
        checklistId: template.id,
        checklistData: items,
        parkId: template.park?.id ?? prev.parkId,
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Titel ist erforderlich");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title: formData.title.trim(),
        description: formData.description || null,
        priority: formData.priority,
        dueDate: formData.dueDate || null,
        notes: formData.notes || null,
        parkId: formData.parkId || null,
        checklistId: formData.checklistId || null,
        checklistData: formData.checklistData,
        taskType: "OPERATIONAL",
      };

      const res = await fetch("/api/management-billing/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Erstellen der Aufgabe"
        );
      }

      toast.success("Aufgabe erfolgreich erstellt");
      router.push("/management-billing/tasks");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Aufgabe"
      );
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Card>
          <CardContent className="py-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href="/management-billing/tasks">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neue Aufgabe anlegen</h1>
            <p className="text-muted-foreground">
              Erstellen Sie eine neue betriebliche Aufgabe
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
        {/* Left: Main Form */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Aufgabendetails</CardTitle>
              <CardDescription>
                Beschreiben Sie die Aufgabe und legen Sie Prioritaet und Termin
                fest
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
                  required
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

              {/* Priority + Due Date */}
              <div className="grid gap-4 sm:grid-cols-2">
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

              {/* Park */}
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
        </div>

        {/* Right: Checklist Template */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Checkliste</CardTitle>
              <CardDescription>
                Optional eine Checklisten-Vorlage verknuepfen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="checklistId">Vorlage</Label>
                <Select
                  value={formData.checklistId || "none"}
                  onValueChange={handleChecklistSelect}
                >
                  <SelectTrigger id="checklistId">
                    <SelectValue placeholder="Vorlage waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Vorlage</SelectItem>
                    {checklists.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.checklistData &&
                formData.checklistData.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      {formData.checklistData.length} Pruefpunkte werden
                      uebernommen
                    </p>
                    <ul className="space-y-1">
                      {formData.checklistData.map((item, index) => (
                        <li
                          key={index}
                          className="text-sm flex items-center gap-2"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          {item.label}
                          {item.required && (
                            <span className="text-xs text-muted-foreground">
                              (Pflicht)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Info Box */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Die Aufgabe wird mit Status &quot;Offen&quot; erstellt. Sie
                koennen den Status jederzeit in der Detailansicht aendern.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
