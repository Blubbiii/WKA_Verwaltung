"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { TenantPortalSettings } from "@/components/settings/TenantPortalSettings";
import { TenantEmailSettings } from "@/components/settings/TenantEmailSettings";
import { PaperlessConfigForm } from "@/components/admin/system-config/paperless-config-form";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Settings, Globe, Mail, FileArchive, Loader2 } from "lucide-react";

// =============================================================================
// Types for Paperless config loading
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

// =============================================================================
// Component
// =============================================================================

export default function AdminSettingsPage() {
  const { flags } = useFeatureFlags();
  const [paperlessConfigs, setPaperlessConfigs] = useState<ConfigValue[]>([]);
  const [paperlessKeys, setPaperlessKeys] = useState<AvailableKey[]>([]);
  const [paperlessLoading, setPaperlessLoading] = useState(false);

  const fetchPaperlessConfig = useCallback(async () => {
    setPaperlessLoading(true);
    try {
      const res = await fetch("/api/settings/paperless");
      if (res.ok) {
        const data = await res.json();
        setPaperlessConfigs(data.configs ?? []);
        setPaperlessKeys(data.availableKeys ?? []);
      }
    } catch {
      // silently fail — form will show empty
    } finally {
      setPaperlessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (flags.paperless) {
      fetchPaperlessConfig();
    }
  }, [flags.paperless, fetchPaperlessConfig]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Allgemeine Systemeinstellungen verwalten
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Allgemein
          </TabsTrigger>
          <TabsTrigger value="portal" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Portal
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            E-Mail
          </TabsTrigger>
          {flags.paperless && (
            <TabsTrigger value="paperless" className="flex items-center gap-2">
              <FileArchive className="h-4 w-4" />
              Paperless
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="portal" className="space-y-4">
          <TenantPortalSettings />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <TenantEmailSettings />
        </TabsContent>

        {flags.paperless && (
          <TabsContent value="paperless" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileArchive className="h-5 w-5" />
                  Paperless-ngx
                </CardTitle>
                <CardDescription>
                  Verbindung zu Ihrer Paperless-ngx Instanz konfigurieren
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paperlessLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <PaperlessConfigForm
                    configs={paperlessConfigs}
                    availableKeys={paperlessKeys}
                    onSave={fetchPaperlessConfig}
                    apiBasePath="/api/settings/paperless"
                    testApiPath="/api/settings/paperless/test"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
