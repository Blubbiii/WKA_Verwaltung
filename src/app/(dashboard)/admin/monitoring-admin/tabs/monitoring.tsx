"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts (~500KB gzipped) is heavy — load only when the monitoring tab is opened.
const MonitoringDashboard = dynamic(
  () =>
    import("@/components/admin/monitoring-dashboard").then(
      (mod) => mod.MonitoringDashboard
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    ),
  }
);

export default function MonitoringTab() {
  return <MonitoringDashboard />;
}
