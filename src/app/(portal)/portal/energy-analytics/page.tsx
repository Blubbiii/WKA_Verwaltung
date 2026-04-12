"use client";

import { useTranslations } from "next-intl";
import { PortalEnergyAnalytics } from "@/components/portal/portal-energy-analytics-dynamic";

export default function PortalEnergyAnalyticsPage() {
  const t = useTranslations("portal.energyAnalytics");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <PortalEnergyAnalytics />
    </div>
  );
}
