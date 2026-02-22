"use client";

import { LucideIcon } from "lucide-react";
import {
  KPICard,
  KPICardGrid,
  KPICardGridSkeleton,
} from "@/components/dashboard/kpi-card";

export interface AnalyticsKpiDef {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  description?: string;
}

interface AnalyticsKpiRowProps {
  kpis: AnalyticsKpiDef[];
  isLoading?: boolean;
}

export function AnalyticsKpiRow({ kpis, isLoading }: AnalyticsKpiRowProps) {
  if (isLoading) {
    return <KPICardGridSkeleton count={kpis.length || 4} />;
  }

  return (
    <KPICardGrid>
      {kpis.map((kpi, i) => (
        <KPICard key={i} {...kpi} />
      ))}
    </KPICardGrid>
  );
}
