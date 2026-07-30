"use client";

/**
 * Feature Flags / SuperAdmin Settings Tab Content
 * Moved from admin/system-settings/page.tsx
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureFlagsTab } from "@/components/admin/feature-flags-tab";
import { TenantLimitsTab } from "@/components/admin/tenant-limits-tab";
import { MaintenanceModeTab } from "@/components/admin/maintenance-mode-tab";
import { ToggleLeft, Gauge, Wrench } from "lucide-react";
import { useTabParam } from "@/hooks/useTabParam";

/** Bedienaufwand #15: erlaubte Werte fuer ?subtab= — alles andere faellt auf den Standard zurueck. */
const SUBTAB_VALUES = ["feature-flags", "tenant-limits", "maintenance"] as const;

export default function FlagsTab() {
  const [activeTab, setActiveTab] = useTabParam("feature-flags", { allowed: SUBTAB_VALUES, paramName: "subtab" });
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="feature-flags" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature-Flags
          </TabsTrigger>
          <TabsTrigger value="tenant-limits" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Mandanten-Limits
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-2">
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
