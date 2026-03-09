"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// =============================================================================
// CONSTANTS
// =============================================================================

const RECURRENCE_OPTIONS = [
  { value: "MONTHLY", label: "Monatlich" },
  { value: "QUARTERLY", label: "Quartalsweise" },
  { value: "SEMI_ANNUAL", label: "Halbjährlich" },
  { value: "ANNUAL", label: "Jährlich" },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewInspectionPlanPage() {
  const router = useRouter();
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    recurrence: "",
    nextDueDate: "",
    parkId: "",
    turbineId: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setParksLoading(true);
      try {
        const res = await fetch("/api/parks");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setParks(json.parks ?? json.data ?? []);
        }
      } catch {
        // Silently fail for parks loading
      } finally {
        if (!cancelled) setParksLoading(false);
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
    if (!formData.recurrence) {
      toast.error("Bitte wählen Sie einen Turnus");
      return;
    }
    if (!formData.nextDueDate) {
      toast.error("Bitte geben Sie den nächsten Termin ein");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/management-billing/inspection-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          recurrence: formData.recurrence,
          nextDueDate: formData.nextDueDate,
          parkId: formData.parkId || null,
          turbineId: formData.turbineId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Fehler beim Erstellen");
      }

      toast.success("Prüfplan erstellt");
      router.push("/management-billing/inspections/plans");
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
            <Link href="/management-billing/inspections/plans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neuen Prüfplan anlegen</h1>
            <p className="text-muted-foreground">
              Wiederkehrende Begehung oder Kontrolle planen
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
              <CardTitle>Prüfplan-Details</CardTitle>
              <CardDescription>
                Grunddaten und Turnus der wiederkehrenden Begehung
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
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Optionale Beschreibung der Begehung..."
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recurrence">Turnus *</Label>
                  <Select
                    value={formData.recurrence || "none"}
                    onValueChange={(v) =>
                      handleChange("recurrence", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger id="recurrence">
                      <SelectValue placeholder="Turnus wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Turnus wählen...
                      </SelectItem>
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
                    onChange={(e) =>
                      handleChange("nextDueDate", e.target.value)
                    }
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
              <CardDescription>
                Windpark und Anlage zuordnen
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
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Nach dem Erstellen können Sie dem Prüfplan Begehungsberichte
                zuordnen und den Status verfolgen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
