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

export const PerformanceOverview = dynamic(
  () =>
    import("@/components/energy/analytics/performance-overview").then(
      (mod) => mod.PerformanceOverview
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const AvailabilityChart = dynamic(
  () =>
    import("@/components/energy/analytics/availability-chart").then(
      (mod) => mod.AvailabilityChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const TurbineComparison = dynamic(
  () =>
    import("@/components/energy/analytics/turbine-comparison").then(
      (mod) => mod.TurbineComparison
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const FaultAnalysis = dynamic(
  () =>
    import("@/components/energy/analytics/fault-analysis").then(
      (mod) => mod.FaultAnalysis
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const EnvironmentChart = dynamic(
  () =>
    import("@/components/energy/analytics/environment-chart").then(
      (mod) => mod.EnvironmentChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const FinancialAnalysis = dynamic(
  () =>
    import("@/components/energy/analytics/financial-analysis").then(
      (mod) => mod.FinancialAnalysis
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
