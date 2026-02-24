"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Cog, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// =============================================================================
// TYPES
// =============================================================================

interface ConfigValue {
  key: string;
  value: string;
  encrypted: boolean;
  category: string;
  label: string | null;
  tenantId: string | null;
  updatedAt: string;
}

interface AvailableKey {
  key: string;
  category: string;
  label: string;
  encrypted: boolean;
  envFallback?: string;
  defaultValue?: string;
}

interface GeneralConfigFormProps {
  configs: ConfigValue[];
  availableKeys: AvailableKey[];
  onSave: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GeneralConfigForm({
  configs,
  availableKeys,
  onSave,
}: GeneralConfigFormProps) {
  // Get initial values from configs
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  // Form state
  const [appName, setAppName] = useState(
    getConfigValue("general.app.name") || "WindparkManager"
  );
  const [timezone, setTimezone] = useState(
    getConfigValue("general.app.timezone") || "Europe/Berlin"
  );
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(
    getConfigValue("general.maintenance.enabled") === "true"
  );
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    getConfigValue("general.maintenance.message") ||
      "Das System wird gewartet. Bitte versuchen Sie es später erneut."
  );

  // UI state
  const [saving, setSaving] = useState(false);

  // Save configuration
  async function handleSave() {
    try {
      setSaving(true);

      // Build configs array
      const configsToSave = [
        { key: "general.app.name", value: appName, category: "general" },
        { key: "general.app.timezone", value: timezone, category: "general" },
        {
          key: "general.maintenance.enabled",
          value: maintenanceEnabled ? "true" : "false",
          category: "general",
        },
        {
          key: "general.maintenance.message",
          value: maintenanceMessage,
          category: "general",
        },
      ];

      const response = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: configsToSave }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Allgemeine Konfiguration gespeichert");
      onSave();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Konfiguration"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Application Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cog className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Anwendung</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="app-name">
              Anwendungsname
              <Badge variant="outline" className="ml-2 text-xs">
                APP_NAME
              </Badge>
            </Label>
            <Input
              id="app-name"
              placeholder="WindparkManager"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Wird in E-Mails und der Oberflaeche angezeigt
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">
              Zeitzone
              <Badge variant="outline" className="ml-2 text-xs">
                APP_TIMEZONE
              </Badge>
            </Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Berlin">
                  Europe/Berlin (Deutschland)
                </SelectItem>
                <SelectItem value="Europe/Vienna">
                  Europe/Vienna (Oesterreich)
                </SelectItem>
                <SelectItem value="Europe/Zurich">
                  Europe/Zurich (Schweiz)
                </SelectItem>
                <SelectItem value="Europe/Amsterdam">
                  Europe/Amsterdam (Niederlande)
                </SelectItem>
                <SelectItem value="Europe/London">
                  Europe/London (UK)
                </SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Zeitzone für Datums- und Zeitanzeigen
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Maintenance Mode */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Wartungsmodus</h3>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label htmlFor="maintenance-enabled" className="cursor-pointer">
              Wartungsmodus aktivieren
            </Label>
            <p className="text-sm text-muted-foreground">
              Wenn aktiviert, wird Benutzern eine Wartungsnachricht angezeigt
            </p>
          </div>
          <Switch
            id="maintenance-enabled"
            checked={maintenanceEnabled}
            onCheckedChange={setMaintenanceEnabled}
          />
        </div>

        {maintenanceEnabled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Achtung:</strong> Der Wartungsmodus ist aktiviert! Normale
              Benutzer können das System nicht verwenden.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="maintenance-message">
            Wartungsnachricht
            <Badge variant="outline" className="ml-2 text-xs">
              MAINTENANCE_MESSAGE
            </Badge>
          </Label>
          <Textarea
            id="maintenance-message"
            placeholder="Das System wird gewartet..."
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Diese Nachricht wird Benutzern waehrend des Wartungsmodus angezeigt
          </p>
        </div>
      </div>

      <Separator />

      {/* System Information (Read-only) */}
      <div className="space-y-4">
        <h3 className="font-medium">System-Informationen</h3>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="p-3 border rounded-lg">
            <p className="text-sm text-muted-foreground">Node.js Version</p>
            <p className="font-medium">{process.version || "N/A"}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-sm text-muted-foreground">Umgebung</p>
            <p className="font-medium">
              {process.env.NODE_ENV || "development"}
            </p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-sm text-muted-foreground">Aktuelle Zeitzone</p>
            <p className="font-medium">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Konfiguration speichern
        </Button>
      </div>
    </div>
  );
}
