"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { MarketingSettings } from "@/components/admin/marketing-settings";
import { AlertTriangle } from "lucide-react";

export default function AdminMarketingPage() {
  const t = useTranslations("admin.marketing");
  const { data: session } = useSession();

  if ((session?.user?.roleHierarchy ?? 0) < 100) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <MarketingSettings />
    </div>
  );
}
