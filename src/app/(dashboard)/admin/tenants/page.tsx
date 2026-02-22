"use client";

import { useSession } from "next-auth/react";
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

export default function AdminTenantsPage() {
  const { data: session } = useSession();

  if (session?.user?.role !== "SUPERADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>Nur SuperAdmins koennen Mandanten verwalten.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mandantenverwaltung"
        description="Mandanten, Benutzer, Rollen und Feature-Konfiguration"
      />

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Mandanten
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Benutzer
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Rollen & Rechte
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature-Flags
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Limits
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
