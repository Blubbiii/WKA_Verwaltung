"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Loading component for charts
function ChartSkeleton() {
  return (
    <div className="w-full h-[300px] flex items-center justify-center bg-muted/20 rounded-lg">
      <Skeleton className="w-full h-full" />
    </div>
  );
}

export const MonthlyInvoicesChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((mod) => mod.MonthlyInvoicesChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const CapitalDevelopmentChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((mod) => mod.CapitalDevelopmentChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const DocumentsByTypeChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((mod) => mod.DocumentsByTypeChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const AnalyticsCharts = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((mod) => mod.AnalyticsCharts),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
