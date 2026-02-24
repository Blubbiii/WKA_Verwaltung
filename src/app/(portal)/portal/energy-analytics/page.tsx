"use client";

import { PortalEnergyAnalytics } from "@/components/portal/portal-energy-analytics";

export default function PortalEnergyAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Anlagen-Performance
        </h1>
        <p className="text-muted-foreground">
          Übersicht über die Leistung Ihrer Windenergieanlagen
        </p>
      </div>
      <PortalEnergyAnalytics />
    </div>
  );
}
