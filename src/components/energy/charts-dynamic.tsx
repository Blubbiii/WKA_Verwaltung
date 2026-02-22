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

export const ProductionChart = dynamic(
  () =>
    import("@/components/energy/production-chart").then(
      (mod) => mod.ProductionChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const PowerCurveChart = dynamic(
  () =>
    import("@/components/energy/power-curve-chart").then(
      (mod) => mod.PowerCurveChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const WindRoseChart = dynamic(
  () =>
    import("@/components/energy/wind-rose-chart").then(
      (mod) => mod.WindRoseChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const DailyChart = dynamic(
  () =>
    import("@/components/energy/daily-chart").then((mod) => mod.DailyChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
