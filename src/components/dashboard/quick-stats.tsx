"use client";

import { Wind, Zap, Users, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// =============================================================================
// QUICK STATS PROPS
// =============================================================================

interface QuickStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

export interface QuickStatsProps {
  parks: number;
  turbines: number;
  shareholders: number;
  openInvoices: number;
  isLoading?: boolean;
  className?: string;
}

// =============================================================================
// QUICK STATS COMPONENT
// =============================================================================

export function QuickStats({
  parks,
  turbines,
  shareholders,
  openInvoices,
  isLoading = false,
  className,
}: QuickStatsProps) {
  const stats: QuickStat[] = [
    {
      label: "Parks",
      value: parks ?? 0,
      icon: <Wind className="h-4 w-4" />,
    },
    {
      label: "Turbinen",
      value: turbines ?? 0,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: "Gesellschafter",
      value: shareholders ?? 0,
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: "Offene Rechnungen",
      value: openInvoices ?? 0,
      icon: <FileText className="h-4 w-4" />,
    },
  ];

  if (isLoading) {
    return <QuickStatsSkeleton className={className} />;
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {stats.map((stat, index) => (
          <div key={stat.label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{stat.icon}</span>
              <span className="text-sm text-muted-foreground">{stat.label}:</span>
            </div>
            <span className="text-sm font-semibold">{stat.value}</span>
            {index < stats.length - 1 && (
              <span className="hidden md:inline text-muted-foreground/30 ml-4">|</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// =============================================================================
// QUICK STATS SKELETON
// =============================================================================

export function QuickStatsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-8" />
            {i < 3 && (
              <span className="hidden md:inline text-muted-foreground/30 ml-4">|</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// =============================================================================
// COMPACT QUICK STATS (Alternative kompaktere Darstellung)
// =============================================================================

export interface CompactQuickStatsProps {
  items: {
    label: string;
    value: string | number;
    subValue?: string;
  }[];
  isLoading?: boolean;
  className?: string;
}

export function CompactQuickStats({
  items,
  isLoading = false,
  className,
}: CompactQuickStatsProps) {
  if (isLoading) {
    return (
      <div className={cn("flex flex-wrap gap-6", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-6", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className="text-lg font-semibold">{item.value}</span>
          {item.subValue && (
            <span className="text-xs text-muted-foreground">{item.subValue}</span>
          )}
        </div>
      ))}
    </div>
  );
}
