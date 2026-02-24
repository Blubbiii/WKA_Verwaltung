"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

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

interface FeaturesConfigFormProps {
  configs: ConfigValue[];
  availableKeys: AvailableKey[];
  onSave: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FeaturesConfigForm({
  configs,
  onSave,
}: FeaturesConfigFormProps) {
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  // Form state
  const [managementBillingEnabled, setManagementBillingEnabled] = useState(
    getConfigValue("management-billing.enabled") === "true"
  );

  // UI state
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    try {
      setSaving(true);

      const configsToSave = [
        {
          key: "management-billing.enabled",
          value: managementBillingEnabled ? "true" : "false",
          category: "features",
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

      toast.success("Feature-Konfiguration gespeichert");
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
      {/* Management Billing */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Betriebsführung</h3>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label
              htmlFor="management-billing-enabled"
              className="cursor-pointer"
            >
              BF-Abrechnung aktivieren
            </Label>
            <p className="text-sm text-muted-foreground">
              Aktiviert das Modul für Betriebsführungs-Abrechnungen
              (Konstellationen, Berechnung, Rechnungserstellung)
            </p>
          </div>
          <Switch
            id="management-billing-enabled"
            checked={managementBillingEnabled}
            onCheckedChange={setManagementBillingEnabled}
          />
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
