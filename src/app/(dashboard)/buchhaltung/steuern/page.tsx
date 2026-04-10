"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const UstvaContent = dynamic(() => import("./tabs/ustva"), { ssr: false });
const ZmContent = dynamic(() => import("./tabs/zm"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function SteuernPageInner() {
  const t = useTranslations("buchhaltung.steuern");
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "ustva";
  const setTab = (value: string) => {
    router.replace(`/buchhaltung/steuern?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ustva">{t("tabUstva")}</TabsTrigger>
          <TabsTrigger value="zm">{t("tabZm")}</TabsTrigger>
        </TabsList>
        <TabsContent value="ustva">
          <Suspense fallback={<LoadingSkeleton />}><UstvaContent /></Suspense>
        </TabsContent>
        <TabsContent value="zm">
          <Suspense fallback={<LoadingSkeleton />}><ZmContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SteuernPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <SteuernPageInner />
    </Suspense>
  );
}
