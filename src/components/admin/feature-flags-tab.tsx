"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
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
  "gis": boolean;
  "inbox": boolean;
  "wirtschaftsplan": boolean;
  "marketData": boolean;
  "scada-uploader-v2": boolean;
  "uploader-v2-generic": boolean;
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
// Keys (labels resolved via i18n inside component)
// =============================================================================

const FLAG_KEYS = [
  "votingEnabled",
  "portalEnabled",
  "weatherEnabled",
  "energyEnabled",
  "billingEnabled",
  "documentsEnabled",
  "reportsEnabled",
] as const satisfies readonly (keyof FeatureFlags)[];

const MODULE_KEYS = [
  "management-billing",
  "paperless",
  "communication",
  "crm",
  "gis",
  "inbox",
  "wirtschaftsplan",
  "marketData",
  "scada-uploader-v2",
  "uploader-v2-generic",
] as const satisfies readonly (keyof ModuleFlags)[];

// =============================================================================
// Component
// =============================================================================

export function FeatureFlagsTab() {
  const t = useTranslations("admin.featureFlagsUI");
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<TenantWithFlags[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/feature-flags");
      if (!response.ok) {
        throw new Error(t("loadError"));
      }
      const data = await response.json();
      setTenants(data.data);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        throw new Error(t("saveGenericError"));
      }

      toast.success(
        t("featureToggled", {
          label: t(`flag.${flagKey}`),
          tenant: tenant.name,
          state: newValue ? t("stateActivated") : t("stateDeactivated"),
        })
      );
    } catch {
      // Revert optimistic update
      setTenants((prev) =>
        prev.map((tn) =>
          tn.id === tenantId
            ? { ...tn, features: { ...updatedFlags, [flagKey]: !newValue } }
            : tn
        )
      );
      toast.error(t("saveError"));
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
        throw new Error(t("saveGenericError"));
      }

      toast.success(
        t("featureToggled", {
          label: t(`module.${moduleKey}`),
          tenant: tenant.name,
          state: newValue ? t("stateActivated") : t("stateDeactivated"),
        })
      );
      queryClient.invalidateQueries({ queryKey: ["/api/features"] });
    } catch {
      // Revert optimistic update
      setTenants((prev) =>
        prev.map((tn) =>
          tn.id === tenantId
            ? { ...tn, modules: { ...tn.modules, [moduleKey]: !newValue } }
            : tn
        )
      );
      toast.error(t("moduleSaveError"));
    } finally {
      setUpdating(null);
    }
  };

  const featureKeys = FLAG_KEYS;
  const moduleKeys = MODULE_KEYS;

  return (
    <div className="space-y-6">
      {/* Main flags table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5" />
                {t("title")}
              </CardTitle>
              <CardDescription>
                {t("description")}
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
              {t("refresh")}
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
              {t("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">{t("tenant")}</TableHead>
                    {featureKeys.map((flagKey) => (
                      <TableHead key={flagKey} className="text-center min-w-[90px]">
                        {t(`flag.${flagKey}`)}
                      </TableHead>
                    ))}
                    {/* Separator + Module flags */}
                    <TableHead className="w-[1px] px-0">
                      <div className="h-full border-l-2 border-border mx-auto" />
                    </TableHead>
                    {moduleKeys.map((moduleKey) => (
                      <TableHead key={moduleKey} className="text-center min-w-[90px]">
                        <span className="text-primary font-semibold">{t(`module.${moduleKey}`)}</span>
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
                            aria-label={`${t(`flag.${flagKey}`)} für ${tenant.name}`}
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
                            aria-label={`${t(`module.${moduleKey}`)} für ${tenant.name}`}
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

    </div>
  );
}
