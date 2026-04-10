"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const KostenstellenContent = dynamic(() => import("./tabs/kostenstellen"), { ssr: false });
const BudgetContent = dynamic(() => import("./tabs/budget"), { ssr: false });
const LiquiditaetContent = dynamic(() => import("./tabs/liquiditaet"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function PlanungPageInner() {
  const t = useTranslations("buchhaltung.planung");
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "kostenstellen";
  const setTab = (value: string) => {
    router.replace(`/buchhaltung/planung?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="kostenstellen">{t("tabKostenstellen")}</TabsTrigger>
          <TabsTrigger value="budget">{t("tabBudget")}</TabsTrigger>
          <TabsTrigger value="liquiditaet">{t("tabLiquiditaet")}</TabsTrigger>
        </TabsList>
        <TabsContent value="kostenstellen">
          <Suspense fallback={<LoadingSkeleton />}><KostenstellenContent /></Suspense>
        </TabsContent>
        <TabsContent value="budget">
          <Suspense fallback={<LoadingSkeleton />}><BudgetContent /></Suspense>
        </TabsContent>
        <TabsContent value="liquiditaet">
          <Suspense fallback={<LoadingSkeleton />}><LiquiditaetContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PlanungPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PlanungPageInner />
    </Suspense>
  );
}
