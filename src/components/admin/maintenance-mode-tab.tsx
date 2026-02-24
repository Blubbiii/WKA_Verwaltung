"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Wrench, Save, AlertTriangle, Eye } from "lucide-react";

interface MaintenanceStatus {
  active: boolean;
  message: string;
}

const DEFAULT_MESSAGE =
  "Das System befindet sich im Wartungsmodus. Bitte versuchen Sie es später erneut.";

export function MaintenanceModeTab() {
  const [status, setStatus] = useState<MaintenanceStatus>({
    active: false,
    message: DEFAULT_MESSAGE,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalStatus, setOriginalStatus] = useState<MaintenanceStatus>({
    active: false,
    message: DEFAULT_MESSAGE,
  });

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/maintenance");
      if (!response.ok) {
        throw new Error("Fehler beim Laden");
      }
      const data: MaintenanceStatus = await response.json();
      setStatus(data);
      setOriginalStatus(data);
      setHasChanges(false);
    } catch {
      toast.error("Fehler beim Laden des Wartungsmodus-Status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const updateStatus = (updates: Partial<MaintenanceStatus>) => {
    const newStatus = { ...status, ...updates };
    setStatus(newStatus);
    setHasChanges(
      newStatus.active !== originalStatus.active ||
        newStatus.message !== originalStatus.message
    );
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: status.active,
          message: status.message,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      setOriginalStatus(status);
      setHasChanges(false);
      toast.success(
        status.active
          ? "Wartungsmodus aktiviert"
          : "Wartungsmodus deaktiviert"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern des Wartungsmodus"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Wartungsmodus
          </CardTitle>
          <CardDescription>
            Wartungsmodus aktivieren und Bannernachricht konfigurieren. Im
            Wartungsmodus sehen alle Benutzer ein Wartungsbanner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">
                Wartungsmodus aktivieren
              </Label>
              <p className="text-sm text-muted-foreground">
                {status.active
                  ? "Der Wartungsmodus ist aktiv. Alle Benutzer sehen das Wartungsbanner."
                  : "Der Wartungsmodus ist deaktiviert."}
              </p>
            </div>
            <Switch
              checked={status.active}
              onCheckedChange={(checked) => updateStatus({ active: checked })}
            />
          </div>

          {/* Warning when active */}
          {status.active && (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-950">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Achtung: Wartungsmodus ist aktiv
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Alle Benutzer sehen ein Wartungsbanner. Stellen Sie sicher,
                  dass Sie den Modus nach Abschluss der Wartung deaktivieren.
                </p>
              </div>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Wartungsbanner-Text</Label>
            <Textarea
              id="maintenance-message"
              value={status.message}
              onChange={(e) => updateStatus({ message: e.target.value })}
              placeholder="Geben Sie den Text ein, der im Wartungsbanner angezeigt wird..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Dieser Text wird im Wartungsbanner am oberen Seitenrand angezeigt.
              Maximal 500 Zeichen.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Banner Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Vorschau
          </CardTitle>
          <CardDescription>
            So sieht das Wartungsbanner für die Benutzer aus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            {status.active ? (
              <div className="bg-yellow-500 text-yellow-900 px-4 py-2 text-center text-sm font-medium">
                {status.message || DEFAULT_MESSAGE}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                Wartungsmodus ist deaktiviert. Kein Banner sichtbar.
              </div>
            )}
            <div className="bg-muted/30 px-4 py-8 text-center text-muted-foreground text-xs">
              (Seiteninhalt)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
