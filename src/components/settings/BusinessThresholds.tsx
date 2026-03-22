"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, Activity, FileText, BarChart2 } from "lucide-react";

interface ThresholdSettings {
  availabilityWarning: number;
  availabilityCritical: number;
  contractWarningDays: number;
  contractUrgentDays: number;
  contractLookaheadDays: number;
  parkHealthLookbackDays: number;
}

const DEFAULTS: ThresholdSettings = {
  availabilityWarning: 85,
  availabilityCritical: 70,
  contractWarningDays: 30,
  contractUrgentDays: 7,
  contractLookaheadDays: 90,
  parkHealthLookbackDays: 7,
};

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function BusinessThresholds() {
  const [formData, setFormData] = useState<ThresholdSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    fetch("/api/admin/settings/thresholds")
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json();
      })
      .then((data: ThresholdSettings) => {
        setFormData(data);
        setHasChanges(false);
      })
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = <K extends keyof ThresholdSettings>(
    key: K,
    value: ThresholdSettings[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleNumberInput = (
    key: keyof ThresholdSettings,
    raw: string,
    fallback: number
  ) => {
    const parsed = parseInt(raw, 10);
    handleChange(key, isNaN(parsed) ? fallback : parsed);
  };

  const handleSave = async () => {
    if (!formData) return;

    // Client-side validation mirrors server validation
    if (
      formData.availabilityCritical >= formData.availabilityWarning ||
      formData.availabilityWarning > 100 ||
      formData.availabilityCritical < 0
    ) {
      toast.error(
        "Kritische Schwelle muss kleiner als Warnschwelle sein (0–100 %)"
      );
      return;
    }

    if (formData.contractUrgentDays >= formData.contractWarningDays) {
      toast.error(
        "Dringend-Schwelle muss kleiner als Warn-Schwelle sein"
      );
      return;
    }

    if (formData.parkHealthLookbackDays < 1 || formData.parkHealthLookbackDays > 90) {
      toast.error("Analysezeitraum muss zwischen 1 und 90 Tagen liegen");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/admin/settings/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? "Fehler beim Speichern"
        );
      }

      const saved: ThresholdSettings = await res.json();
      setFormData(saved);
      setHasChanges(false);
      toast.success("Schwellenwerte gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Schwellenwerte
      </div>
    );
  }

  if (isLoading || !formData) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Verfügbarkeit */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Turbinen-Verfügbarkeit</CardTitle>
          </div>
          <CardDescription>
            Turbinenverfügbarkeit unter diesen Werten zeigt Warn- bzw.
            Fehlerstatus im Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="availabilityWarning">Warnschwelle (%)</Label>
            <Input
              id="availabilityWarning"
              type="number"
              min={0}
              max={100}
              value={formData.availabilityWarning}
              onChange={(e) =>
                handleNumberInput(
                  "availabilityWarning",
                  e.target.value,
                  DEFAULTS.availabilityWarning
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Verfügbarkeit unter diesem Wert wird gelb markiert (Standard:{" "}
              {DEFAULTS.availabilityWarning} %)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="availabilityCritical">Kritische Schwelle (%)</Label>
            <Input
              id="availabilityCritical"
              type="number"
              min={0}
              max={100}
              value={formData.availabilityCritical}
              onChange={(e) =>
                handleNumberInput(
                  "availabilityCritical",
                  e.target.value,
                  DEFAULTS.availabilityCritical
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Verfügbarkeit unter diesem Wert wird rot markiert — muss kleiner
              als die Warnschwelle sein (Standard:{" "}
              {DEFAULTS.availabilityCritical} %)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Vertragswarnungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Vertragswarnungen</CardTitle>
          </div>
          <CardDescription>
            Ab wann laufende Verträge im Dashboard als &quot;läuft bald ab&quot; markiert
            werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contractWarningDays">
              Warnung ab (Tage vor Ablauf)
            </Label>
            <Input
              id="contractWarningDays"
              type="number"
              min={1}
              max={365}
              value={formData.contractWarningDays}
              onChange={(e) =>
                handleNumberInput(
                  "contractWarningDays",
                  e.target.value,
                  DEFAULTS.contractWarningDays
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Verträge werden ab dieser Anzahl verbleibender Tage gelb
              markiert (Standard: {DEFAULTS.contractWarningDays} Tage)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="contractUrgentDays">
              Dringend ab (Tage vor Ablauf)
            </Label>
            <Input
              id="contractUrgentDays"
              type="number"
              min={1}
              max={365}
              value={formData.contractUrgentDays}
              onChange={(e) =>
                handleNumberInput(
                  "contractUrgentDays",
                  e.target.value,
                  DEFAULTS.contractUrgentDays
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Verträge werden ab dieser Anzahl verbleibender Tage rot markiert
              — muss kleiner als die Warn-Schwelle sein (Standard:{" "}
              {DEFAULTS.contractUrgentDays} Tage)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="contractLookaheadDays">
              Vorausschau im Kalender (Tage)
            </Label>
            <Input
              id="contractLookaheadDays"
              type="number"
              min={1}
              max={730}
              value={formData.contractLookaheadDays}
              onChange={(e) =>
                handleNumberInput(
                  "contractLookaheadDays",
                  e.target.value,
                  DEFAULTS.contractLookaheadDays
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Wie weit in die Zukunft der Kalender ablaufende Verträge
              anzeigt (Standard: {DEFAULTS.contractLookaheadDays} Tage)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Park-Health */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Park-Health</CardTitle>
          </div>
          <CardDescription>
            Zeitfenster für die Park-Status-Anzeige im Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parkHealthLookbackDays">
              Analysezeitraum (Tage)
            </Label>
            <Input
              id="parkHealthLookbackDays"
              type="number"
              min={1}
              max={90}
              value={formData.parkHealthLookbackDays}
              onChange={(e) =>
                handleNumberInput(
                  "parkHealthLookbackDays",
                  e.target.value,
                  DEFAULTS.parkHealthLookbackDays
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Wie viele vergangene Tage der Park-Status-Balken im Dashboard
              berücksichtigt (1–90 Tage, Standard:{" "}
              {DEFAULTS.parkHealthLookbackDays} Tage)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Speichern */}
      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="lg"
          className="shadow-lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  );
}
