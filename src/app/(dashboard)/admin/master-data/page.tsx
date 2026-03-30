"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Building2, Percent, Radio, Code2, Link2 } from "lucide-react";

// Lazy-loaded tab content
const RevenueTypesContent = dynamic(() => import("./tabs/revenue-types"), { ssr: false });
const FundCategoriesContent = dynamic(() => import("./tabs/fund-categories"), { ssr: false });
const TaxRatesContent = dynamic(() => import("./tabs/tax-rates"), { ssr: false });
const WebhooksContent = dynamic(() => import("./tabs/webhooks"), { ssr: false });
const ScadaCodesContent = dynamic(() => import("./tabs/scada-codes"), { ssr: false });
const SidebarLinksContent = dynamic(() => import("./tabs/sidebar-links"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function MasterDataPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "verguetung";

  const setTab = (value: string) => {
    router.replace(`/admin/master-data?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stammdaten"
        description="Vergütungsarten, Steuersätze, Gesellschaftstypen und weitere Konfiguration"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="verguetung" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Vergütungsarten
          </TabsTrigger>
          <TabsTrigger value="gesellschaftstypen" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Gesellschaftstypen
          </TabsTrigger>
          <TabsTrigger value="steuersaetze" className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Steuersätze
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="scada-codes" className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            SCADA-Codes
          </TabsTrigger>
          <TabsTrigger value="sidebar-links" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Sidebar-Links
          </TabsTrigger>
        </TabsList>
        <TabsContent value="verguetung">
          <Suspense fallback={<LoadingSkeleton />}><RevenueTypesContent /></Suspense>
        </TabsContent>
        <TabsContent value="gesellschaftstypen">
          <Suspense fallback={<LoadingSkeleton />}><FundCategoriesContent /></Suspense>
        </TabsContent>
        <TabsContent value="steuersaetze">
          <Suspense fallback={<LoadingSkeleton />}><TaxRatesContent /></Suspense>
        </TabsContent>
        <TabsContent value="webhooks">
          <Suspense fallback={<LoadingSkeleton />}><WebhooksContent /></Suspense>
        </TabsContent>
        <TabsContent value="scada-codes">
          <Suspense fallback={<LoadingSkeleton />}><ScadaCodesContent /></Suspense>
        </TabsContent>
        <TabsContent value="sidebar-links">
          <Suspense fallback={<LoadingSkeleton />}><SidebarLinksContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MasterDataPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <MasterDataPageInner />
    </Suspense>
  );
}
