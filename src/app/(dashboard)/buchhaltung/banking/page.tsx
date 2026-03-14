"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const BankImportContent = dynamic(() => import("./tabs/import"), { ssr: false });
const BankKontenContent = dynamic(() => import("./tabs/konten"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function BankingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "import";
  const setTab = (value: string) => {
    router.replace(`/buchhaltung/banking?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Banking" description="Bankimport und Kontenverwaltung" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="import">Bankimport</TabsTrigger>
          <TabsTrigger value="konten">Bankkonten</TabsTrigger>
        </TabsList>
        <TabsContent value="import">
          <Suspense fallback={<LoadingSkeleton />}><BankImportContent /></Suspense>
        </TabsContent>
        <TabsContent value="konten">
          <Suspense fallback={<LoadingSkeleton />}><BankKontenContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BankingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BankingPageInner />
    </Suspense>
  );
}
