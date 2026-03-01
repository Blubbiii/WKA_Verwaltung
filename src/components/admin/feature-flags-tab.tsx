"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// Types
// =============================================================================

interface FeatureFlags {
  votingEnabled: boolean;
  portalEnabled: boolean;
  weatherEnabled: boolean;
  energyEnabled: boolean;
  billingEnabled: boolean;
  documentsEnabled: boolean;
  reportsEnabled: boolean;
}

interface ModuleFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "inbox": boolean;
}

interface TenantWithFlags {
  id: string;
  name: string;
  slug: string;
  status: string;
  features: FeatureFlags;
  modules: ModuleFlags;
}

// =============================================================================
// Labels
// =============================================================================

const FLAG_LABELS: Record<keyof FeatureFlags, string> = {
  votingEnabled: "Abstimmungen",
  portalEnabled: "Portal",
  weatherEnabled: "Wetter",
  energyEnabled: "Energie",
  billingEnabled: "Billing",
  documentsEnabled: "Dokumente",
  reportsEnabled: "Berichte",
};

const MODULE_LABELS: Record<keyof ModuleFlags, string> = {
  "management-billing": "Betriebsführung",
  "paperless": "Paperless",
  "communication": "Kommunikation",
  "crm": "CRM",
  "inbox": "Inbox",
};

// =============================================================================
// Component
// =============================================================================

export function FeatureFlagsTab() {
  const [tenants, setTenants] = useState<TenantWithFlags[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/feature-flags");
      if (!response.ok) {
        throw new Error("Fehler beim Laden der Feature-Flags");
      }
      const data = await response.json();
      setTenants(data.data);
    } catch {
      toast.error("Fehler beim Laden der Feature-Flags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  // Toggle legacy feature flag (stored in tenant.settings.features)
  const handleToggleFeature = async (
    tenantId: string,
    flagKey: keyof FeatureFlags,
    newValue: boolean
  ) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;

    const updatedFlags = {
      ...tenant.features,
      [flagKey]: newValue,
    };

    // Optimistic update
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId ? { ...t, features: updatedFlags } : t
      )
    );

    setUpdating(`${tenantId}-${flagKey}`);

    try {
      const response = await fetch(`/api/admin/feature-flags/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFlags),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern");
      }

      toast.success(
        `${FLAG_LABELS[flagKey]} für "${tenant.name}" ${newValue ? "aktiviert" : "deaktiviert"}`
      );
    } catch {
      // Revert optimistic update
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, features: { ...updatedFlags, [flagKey]: !newValue } }
            : t
        )
      );
      toast.error("Fehler beim Speichern der Feature-Flag");
    } finally {
      setUpdating(null);
    }
  };

  // Toggle module flag (stored in SystemConfig table with tenantId)
  const handleToggleModule = async (
    tenantId: string,
    moduleKey: keyof ModuleFlags,
    newValue: boolean
  ) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;

    // Optimistic update
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId
          ? { ...t, modules: { ...t.modules, [moduleKey]: newValue } }
          : t
      )
    );

    const cellKey = `${tenantId}-mod-${moduleKey}`;
    setUpdating(cellKey);

    try {
      const response = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `${moduleKey}.enabled`,
          value: String(newValue),
          category: "features",
          tenantId,
        }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern");
      }

      toast.success(
        `${MODULE_LABELS[moduleKey]} für "${tenant.name}" ${newValue ? "aktiviert" : "deaktiviert"}`
      );
      // Revalidate sidebar feature flags so menu updates immediately
      mutate("/api/features");
    } catch {
      // Revert optimistic update
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, modules: { ...t.modules, [moduleKey]: !newValue } }
            : t
        )
      );
      toast.error("Fehler beim Speichern des Modul-Flags");
    } finally {
      setUpdating(null);
    }
  };

  const featureKeys = Object.keys(FLAG_LABELS) as Array<keyof FeatureFlags>;
  const moduleKeys = Object.keys(MODULE_LABELS) as Array<keyof ModuleFlags>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ToggleLeft className="h-5 w-5" />
              Feature-Flags
            </CardTitle>
            <CardDescription>
              Module pro Mandant aktivieren oder deaktivieren
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFlags}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Keine aktiven Mandanten gefunden
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Mandant</TableHead>
                  {Object.values(FLAG_LABELS).map((label) => (
                    <TableHead key={label} className="text-center min-w-[90px]">
                      {label}
                    </TableHead>
                  ))}
                  {/* Separator + Module flags */}
                  <TableHead className="w-[1px] px-0">
                    <div className="h-full border-l-2 border-border mx-auto" />
                  </TableHead>
                  {Object.values(MODULE_LABELS).map((label) => (
                    <TableHead key={label} className="text-center min-w-[90px]">
                      <span className="text-primary font-semibold">{label}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tenant.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {tenant.slug}
                        </Badge>
                      </div>
                    </TableCell>
                    {featureKeys.map((flagKey) => (
                      <TableCell key={flagKey} className="text-center">
                        <Switch
                          checked={tenant.features[flagKey]}
                          onCheckedChange={(checked) =>
                            handleToggleFeature(tenant.id, flagKey, checked)
                          }
                          disabled={
                            updating === `${tenant.id}-${flagKey}`
                          }
                          aria-label={`${FLAG_LABELS[flagKey]} für ${tenant.name}`}
                        />
                      </TableCell>
                    ))}
                    {/* Separator */}
                    <TableCell className="w-[1px] px-0">
                      <div className="h-full border-l-2 border-border mx-auto" />
                    </TableCell>
                    {/* Module flags */}
                    {moduleKeys.map((moduleKey) => (
                      <TableCell key={moduleKey} className="text-center">
                        <Switch
                          checked={tenant.modules[moduleKey]}
                          onCheckedChange={(checked) =>
                            handleToggleModule(tenant.id, moduleKey, checked)
                          }
                          disabled={
                            updating === `${tenant.id}-mod-${moduleKey}`
                          }
                          aria-label={`${MODULE_LABELS[moduleKey]} für ${tenant.name}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
