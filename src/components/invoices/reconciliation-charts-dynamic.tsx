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

export const MonthlyComparisonChart = dynamic(
  () =>
    import("@/components/invoices/reconciliation-charts").then(
      (mod) => mod.MonthlyComparisonChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const InvoiceStatusChart = dynamic(
  () =>
    import("@/components/invoices/reconciliation-charts").then(
      (mod) => mod.InvoiceStatusChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
