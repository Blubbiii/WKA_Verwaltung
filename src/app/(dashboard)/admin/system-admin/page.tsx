"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Cog, ToggleLeft, HardDrive } from "lucide-react";

// Lazy-loaded tab content
const HealthContent = dynamic(() => import("./tabs/health"), { ssr: false });
const ConfigContent = dynamic(() => import("./tabs/config"), { ssr: false });
const FlagsContent = dynamic(() => import("./tabs/flags"), { ssr: false });
const BackupContent = dynamic(() => import("./tabs/backup"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function SystemAdminPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "health";

  const setTab = (value: string) => {
    router.replace(`/admin/system-admin?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        description="Server, Konfiguration, Feature-Flags und Backups"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Server & Health
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Konfiguration
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature-Flags & Limits
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Backup & Speicher
          </TabsTrigger>
        </TabsList>
        <TabsContent value="health">
          <Suspense fallback={<LoadingSkeleton />}><HealthContent /></Suspense>
        </TabsContent>
        <TabsContent value="config">
          <Suspense fallback={<LoadingSkeleton />}><ConfigContent /></Suspense>
        </TabsContent>
        <TabsContent value="flags">
          <Suspense fallback={<LoadingSkeleton />}><FlagsContent /></Suspense>
        </TabsContent>
        <TabsContent value="backup">
          <Suspense fallback={<LoadingSkeleton />}><BackupContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SystemAdminPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <SystemAdminPageInner />
    </Suspense>
  );
}
