"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, BarChart2, ClipboardList } from "lucide-react";

// Lazy-loaded tab content
const MonitoringContent = dynamic(() => import("./tabs/monitoring"), { ssr: false });
const AnalyticsContent = dynamic(() => import("./tabs/analytics"), { ssr: false });
const AuditContent = dynamic(() => import("./tabs/audit"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function MonitoringAdminPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "monitoring";

  const setTab = (value: string) => {
    router.replace(`/admin/monitoring-admin?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring & Audit"
        description="System-Monitoring, Analytics und Audit-Trail"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Audit-Logs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="monitoring">
          <Suspense fallback={<LoadingSkeleton />}><MonitoringContent /></Suspense>
        </TabsContent>
        <TabsContent value="analytics">
          <Suspense fallback={<LoadingSkeleton />}><AnalyticsContent /></Suspense>
        </TabsContent>
        <TabsContent value="audit">
          <Suspense fallback={<LoadingSkeleton />}><AuditContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MonitoringAdminPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <MonitoringAdminPageInner />
    </Suspense>
  );
}
