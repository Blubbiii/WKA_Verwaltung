"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Cog, ToggleLeft, HardDrive, Languages, Shield } from "lucide-react";

// Lazy-loaded tab content
const HealthContent = dynamic(() => import("./tabs/health"), { ssr: false });
const ConfigContent = dynamic(() => import("./tabs/config"), { ssr: false });
const FlagsContent = dynamic(() => import("./tabs/flags"), { ssr: false });
const BackupContent = dynamic(() => import("./tabs/backup"), { ssr: false });
const TranslationsContent = dynamic(() => import("./tabs/translations"), { ssr: false });
const WidgetVisibilityContent = dynamic(() => import("./tabs/widget-visibility"), { ssr: false });

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
  const t = useTranslations("admin.systemAdmin");
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "health";

  const setTab = (value: string) => {
    router.replace(`/admin/system-admin?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {t("tabHealth")}
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            {t("tabConfig")}
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            {t("tabFlags")}
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t("tabBackup")}
          </TabsTrigger>
          <TabsTrigger value="translations" className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            {t("tabTranslations")}
          </TabsTrigger>
          <TabsTrigger value="widgets" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t("tabWidgets")}
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
        <TabsContent value="translations">
          <Suspense fallback={<LoadingSkeleton />}><TranslationsContent /></Suspense>
        </TabsContent>
        <TabsContent value="widgets">
          <Suspense fallback={<LoadingSkeleton />}><WidgetVisibilityContent /></Suspense>
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
