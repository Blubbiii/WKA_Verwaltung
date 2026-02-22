"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { TenantPortalSettings } from "@/components/settings/TenantPortalSettings";
import { TenantEmailSettings } from "@/components/settings/TenantEmailSettings";
import { Settings, Globe, Mail } from "lucide-react";

export default function AdminSettingsPage() {
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
      </Tabs>
    </div>
  );
}
