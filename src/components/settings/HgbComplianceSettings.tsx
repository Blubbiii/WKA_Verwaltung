"use client";

/**
 * Tenant check rules:
 *  - fourEyesThresholdEur: four-eyes approval threshold for incoming invoices
 *  - bankMatchToleranceEur: rounding tolerance when matching payments
 */

import { useEffect, useState } from "react";
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
import { Loader2, Save, AlertTriangle, Scale } from "lucide-react";

interface HgbSettings {
  fourEyesThresholdEur: number | null;
  bankMatchToleranceEur: number;
}

const DEFAULTS: HgbSettings = {
  fourEyesThresholdEur: 1000,
  bankMatchToleranceEur: 0.02,
};

function LoadingSkel() {
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

export function HgbComplianceSettings() {
  const [formData, setFormData] = useState<HgbSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tenant-settings")
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json();
      })
      .then((data) => {
        // Server returns all tenant settings — pick the check-rule fields
        // mit Fallback auf Defaults für noch nicht persistierte Werte.
        const merged: HgbSettings = {
          fourEyesThresholdEur:
            data.fourEyesThresholdEur === undefined
              ? DEFAULTS.fourEyesThresholdEur
              : data.fourEyesThresholdEur,
          bankMatchToleranceEur:
            data.bankMatchToleranceEur ?? DEFAULTS.bankMatchToleranceEur,
        };
        setFormData(merged);
        setHasChanges(false);
      })
      .catch(() => {
        setFormData(DEFAULTS);
        toast.error("Einstellungen konnten nicht geladen werden");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = <K extends keyof HgbSettings>(
    key: K,
    value: HgbSettings[K],
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }
      toast.success("Prüfregeln gespeichert");
      setHasChanges(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Prüfregeln konnten nicht gespeichert werden");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !formData) return <LoadingSkel />;

  return (
    <div className="space-y-6">
      {/* Four-eyes threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Vier-Augen-Freigabe
          </CardTitle>
          <CardDescription>
            Vier-Augen-Prinzip für Eingangsrechnungen oberhalb einer Schwelle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fourEyesThreshold">
              Schwelle (EUR) — leer lassen, wenn jede Rechnung zwei Personen braucht
            </Label>
            <Input
              id="fourEyesThreshold"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              value={formData.fourEyesThresholdEur ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                handleChange(
                  "fourEyesThresholdEur",
                  v === "" ? null : Number(v),
                );
              }}
              placeholder="z.B. 1000"
            />
            <p className="text-xs text-muted-foreground">
              Eingangsrechnungen über dieser Schwelle muss eine andere Person
              freigeben als die, die sie erfasst hat.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Toleranzen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Zahlungsabgleich
          </CardTitle>
          <CardDescription>
            Rundungs-Toleranz für den Zahlungsabgleich
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankTol">Rundungs-Toleranz (EUR)</Label>
              <Input
                id="bankTol"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.bankMatchToleranceEur}
                onChange={(e) =>
                  handleChange("bankMatchToleranceEur", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Standard 0,02 €. Weicht eine Zahlung höchstens um diesen Betrag ab,
                gilt die Rechnung als vollständig bezahlt.
              </p>
            </div>

          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </div>
  );
}
