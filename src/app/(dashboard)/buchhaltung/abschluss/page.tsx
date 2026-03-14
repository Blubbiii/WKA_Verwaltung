"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const DatevContent = dynamic(() => import("./tabs/datev"), { ssr: false });
const JahresabschlussContent = dynamic(() => import("./tabs/jahresabschluss"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function AbschlussPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "datev";
  const setTab = (value: string) => {
    router.replace(`/buchhaltung/abschluss?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Export & Abschluss" description="DATEV-Export und Jahresabschluss" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="datev">DATEV-Export</TabsTrigger>
          <TabsTrigger value="jahresabschluss">Jahresabschluss</TabsTrigger>
        </TabsList>
        <TabsContent value="datev">
          <Suspense fallback={<LoadingSkeleton />}><DatevContent /></Suspense>
        </TabsContent>
        <TabsContent value="jahresabschluss">
          <Suspense fallback={<LoadingSkeleton />}><JahresabschlussContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AbschlussPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AbschlussPageInner />
    </Suspense>
  );
}
