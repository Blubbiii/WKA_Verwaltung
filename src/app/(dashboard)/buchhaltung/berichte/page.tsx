"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const SuSaContent = dynamic(() => import("./tabs/susa"), { ssr: false });
const BwaContent = dynamic(() => import("./tabs/bwa"), { ssr: false });
const EuerContent = dynamic(() => import("./tabs/euer"), { ssr: false });
const GuvContent = dynamic(() => import("./tabs/guv"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function BerichtePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "susa";

  const setTab = (value: string) => {
    router.replace(`/buchhaltung/berichte?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Berichte"
        description="Finanzberichte und Auswertungen"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="susa">Summen & Salden</TabsTrigger>
          <TabsTrigger value="bwa">BWA</TabsTrigger>
          <TabsTrigger value="euer">EÜR</TabsTrigger>
          <TabsTrigger value="guv">GuV</TabsTrigger>
        </TabsList>
        <TabsContent value="susa">
          <Suspense fallback={<LoadingSkeleton />}><SuSaContent /></Suspense>
        </TabsContent>
        <TabsContent value="bwa">
          <Suspense fallback={<LoadingSkeleton />}><BwaContent /></Suspense>
        </TabsContent>
        <TabsContent value="euer">
          <Suspense fallback={<LoadingSkeleton />}><EuerContent /></Suspense>
        </TabsContent>
        <TabsContent value="guv">
          <Suspense fallback={<LoadingSkeleton />}><GuvContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BerichtePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BerichtePageInner />
    </Suspense>
  );
}
