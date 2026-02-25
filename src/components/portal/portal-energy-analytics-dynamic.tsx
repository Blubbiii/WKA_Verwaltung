"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton() {
  return (
    <div className="w-full h-[400px] flex items-center justify-center bg-muted/20 rounded-lg">
      <Skeleton className="w-full h-full" />
    </div>
  );
}

export const PortalEnergyAnalytics = dynamic(
  () =>
    import("@/components/portal/portal-energy-analytics").then(
      (mod) => mod.PortalEnergyAnalytics
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
