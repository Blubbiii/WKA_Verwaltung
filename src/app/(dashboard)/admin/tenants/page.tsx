"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantManagement } from "@/components/admin/TenantManagement";
import { UserManagement } from "@/components/admin/UserManagement";
import { RoleManagement } from "@/components/admin/RoleManagement";
import { FeatureFlagsTab } from "@/components/admin/feature-flags-tab";
import { TenantLimitsTab } from "@/components/admin/tenant-limits-tab";
import {
  AlertTriangle,
  Building2,
  Users,
  Shield,
  ToggleLeft,
  Gauge,
} from "lucide-react";
import { useTabParam } from "@/hooks/useTabParam";

/** Bedienaufwand #15: erlaubte Werte fuer ?tab= — alles andere faellt auf den Standard zurueck. */
const TAB_VALUES = ["tenants", "users", "roles", "features", "limits"] as const;

export default function AdminTenantsPage() {
  const [activeTab, setActiveTab] = useTabParam("tenants", { allowed: TAB_VALUES });
  const t = useTranslations("admin.tenants");
  const { data: session } = useSession();

  if ((session?.user?.roleHierarchy ?? 0) < 100) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t("tabTenants")}
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t("tabUsers")}
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t("tabRoles")}
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            {t("tabFeatures")}
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            {t("tabLimits")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <TenantManagement />
        </TabsContent>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="roles">
          <RoleManagement />
        </TabsContent>

        <TabsContent value="features">
          <FeatureFlagsTab />
        </TabsContent>

        <TabsContent value="limits">
          <TenantLimitsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
