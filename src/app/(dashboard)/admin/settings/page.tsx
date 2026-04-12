"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { TenantPortalSettings } from "@/components/settings/TenantPortalSettings";
import { TenantEmailSettings } from "@/components/settings/TenantEmailSettings";
import { BusinessThresholds } from "@/components/settings/BusinessThresholds";
import { Settings, Globe, Mail, Sliders } from "lucide-react";

// =============================================================================
// Component
// =============================================================================

export default function AdminSettingsPage() {
  const t = useTranslations("admin.settings");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t("tabGeneral")}
          </TabsTrigger>
          <TabsTrigger value="portal" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("tabPortal")}
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t("tabEmail")}
          </TabsTrigger>
          <TabsTrigger value="thresholds" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            {t("tabThresholds")}
          </TabsTrigger>
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

        <TabsContent value="thresholds" className="space-y-4">
          <BusinessThresholds />
        </TabsContent>
      </Tabs>
    </div>
  );
}
