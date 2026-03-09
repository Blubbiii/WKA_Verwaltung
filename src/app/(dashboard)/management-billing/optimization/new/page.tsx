"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
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

// =============================================================================
// CONSTANTS
// =============================================================================

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

export default function NewOptimizationPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Options
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    priority: "MEDIUM",
    dueDate: "",
    costEstimateEur: "",
    benefitNotes: "",
    parkId: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadParks() {
      setParksLoading(true);
      try {
        const res = await fetch("/api/management-billing/available-parks");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setParks(json.parks ?? json.data ?? []);
        }
      } catch {
        // Parks are optional for the form
      } finally {
        if (!cancelled) setParksLoading(false);
      }
    }

    loadParks();
    return () => { cancelled = true; };
  }, []);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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
        dueDate: formData.dueDate || null,
        costEstimateEur: formData.costEstimateEur
          ? parseFloat(formData.costEstimateEur)
          : null,
        benefitNotes: formData.benefitNotes || null,
        parkId: formData.parkId || null,
        taskType: "IMPROVEMENT",
      };

      const res = await fetch("/api/management-billing/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error ?? "Fehler beim Erstellen der Massnahme");
      }

      toast.success("Massnahme erfolgreich erstellt");
      router.push("/management-billing/optimization");
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
            <Link href="/management-billing/optimization">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neue Optimierungsmassnahme</h1>
            <p className="text-muted-foreground">
              Verbesserungsmassnahme fuer Windpark planen
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
        {/* Left: Main fields */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Massnahme</CardTitle>
              <CardDescription>Grunddaten der Optimierungsmassnahme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    placeholder="z.B. Rotorblattkanten-Optimierung"
                    required
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
                  <Label htmlFor="dueDate">Faellig am</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => handleChange("dueDate", e.target.value)}
                  />
                </div>
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kosten-Nutzen</CardTitle>
              <CardDescription>
                Erwarteter Nutzen und ROI-Betrachtung
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="benefitNotes">Kosten-Nutzen-Beschreibung</Label>
                <Textarea
                  id="benefitNotes"
                  value={formData.benefitNotes}
                  onChange={(e) => handleChange("benefitNotes", e.target.value)}
                  rows={4}
                  placeholder="Erwarteter Nutzen, Einsparungen, ROI-Betrachtung..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Park selection */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Standort</CardTitle>
              <CardDescription>Betroffener Windpark</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="parkId">Windpark</Label>
                {parksLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) =>
                      handleChange("parkId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Park auswaehlen..." />
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
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Nach dem Erstellen koennen Sie weitere Details wie
                tatsaechliche Kosten und Ergebnisse hinzufuegen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
