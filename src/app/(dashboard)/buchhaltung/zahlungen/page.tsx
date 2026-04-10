"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const MahnwesenContent = dynamic(() => import("./tabs/mahnwesen"), { ssr: false });
const SepaContent = dynamic(() => import("./tabs/sepa"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function ZahlungenPageInner() {
  const t = useTranslations("buchhaltung.zahlungen");
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "mahnwesen";
  const setTab = (value: string) => {
    router.replace(`/buchhaltung/zahlungen?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mahnwesen">{t("tabMahnwesen")}</TabsTrigger>
          <TabsTrigger value="sepa">{t("tabSepa")}</TabsTrigger>
        </TabsList>
        <TabsContent value="mahnwesen">
          <Suspense fallback={<LoadingSkeleton />}><MahnwesenContent /></Suspense>
        </TabsContent>
        <TabsContent value="sepa">
          <Suspense fallback={<LoadingSkeleton />}><SepaContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ZahlungenPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ZahlungenPageInner />
    </Suspense>
  );
}
