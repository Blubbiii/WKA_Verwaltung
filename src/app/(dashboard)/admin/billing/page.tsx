"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Receipt, CalendarClock } from "lucide-react";

// Lazy-loaded tab content
const SequencesContent = dynamic(() => import("./tabs/sequences"), { ssr: false });
const RulesContent = dynamic(() => import("./tabs/rules"), { ssr: false });
const PeriodsContent = dynamic(() => import("./tabs/periods"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "nummernkreise";

  const setTab = (value: string) => {
    router.replace(`/admin/billing?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abrechnung"
        description="Nummernkreise, Abrechnungsregeln und Perioden verwalten"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nummernkreise" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Nummernkreise & Vorlagen
          </TabsTrigger>
          <TabsTrigger value="regeln" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Abrechnungsregeln
          </TabsTrigger>
          <TabsTrigger value="perioden" className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Perioden
          </TabsTrigger>
        </TabsList>
        <TabsContent value="nummernkreise">
          <Suspense fallback={<LoadingSkeleton />}><SequencesContent /></Suspense>
        </TabsContent>
        <TabsContent value="regeln">
          <Suspense fallback={<LoadingSkeleton />}><RulesContent /></Suspense>
        </TabsContent>
        <TabsContent value="perioden">
          <Suspense fallback={<LoadingSkeleton />}><PeriodsContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BillingPageInner />
    </Suspense>
  );
}
