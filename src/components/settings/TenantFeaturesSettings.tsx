"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Briefcase, Loader2, ToggleLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface FeaturesResponse {
  features: Record<string, boolean>;
  available: Array<{
    key: string;
    label: string;
    description: string;
  }>;
}

export function TenantFeaturesSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [available, setAvailable] = useState<FeaturesResponse["available"]>([]);

  const loadFeatures = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/features");

      if (!response.ok) {
        throw new Error("Fehler beim Laden");
      }

      const data: FeaturesResponse = await response.json();
      setFeatures(data.features);
      setAvailable(data.available);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Feature-Flags"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  async function handleSave() {
    try {
      setSaving(true);

      const response = await fetch("/api/admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Feature-Einstellungen gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Map feature keys to icons
  const getIcon = (key: string) => {
    if (key.includes("management-billing")) return Briefcase;
    return ToggleLeft;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5" />
          Optionale Module
        </CardTitle>
        <CardDescription>
          Aktivieren oder deaktivieren Sie optionale Module fuer Ihren Mandanten
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {available.map((flag) => {
          const Icon = getIcon(flag.key);
          return (
            <div key={flag.key}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">{flag.label}</h3>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label
                    htmlFor={`feature-${flag.key}`}
                    className="cursor-pointer"
                  >
                    {flag.label} aktivieren
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {flag.description}
                  </p>
                </div>
                <Switch
                  id={`feature-${flag.key}`}
                  checked={features[flag.key] ?? false}
                  onCheckedChange={(checked) =>
                    setFeatures((prev) => ({ ...prev, [flag.key]: checked }))
                  }
                />
              </div>
            </div>
          );
        })}

        <Separator />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
