"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureFlagsTab } from "@/components/admin/feature-flags-tab";
import { TenantLimitsTab } from "@/components/admin/tenant-limits-tab";
import { MaintenanceModeTab } from "@/components/admin/maintenance-mode-tab";
import { ToggleLeft, Gauge, Wrench } from "lucide-react";

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          SuperAdmin-Einstellungen
        </h1>
        <p className="text-muted-foreground">
          Systemweite Einstellungen fuer Feature-Flags, Mandanten-Limits und
          Wartungsmodus
        </p>
      </div>

      <Tabs defaultValue="feature-flags" className="space-y-4">
        <TabsList>
          <TabsTrigger
            value="feature-flags"
            className="flex items-center gap-2"
          >
            <ToggleLeft className="h-4 w-4" />
            Feature-Flags
          </TabsTrigger>
          <TabsTrigger
            value="tenant-limits"
            className="flex items-center gap-2"
          >
            <Gauge className="h-4 w-4" />
            Mandanten-Limits
          </TabsTrigger>
          <TabsTrigger
            value="maintenance"
            className="flex items-center gap-2"
          >
            <Wrench className="h-4 w-4" />
            Wartungsmodus
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feature-flags" className="space-y-4">
          <FeatureFlagsTab />
        </TabsContent>

        <TabsContent value="tenant-limits" className="space-y-4">
          <TenantLimitsTab />
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <MaintenanceModeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
