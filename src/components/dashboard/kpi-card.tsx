"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// =============================================================================
// KPI ACCENT COLORS - unique color per widget for visual distinction
// =============================================================================

export const KPI_ACCENT_COLORS: Record<string, string> = {
  "kpi-parks": "text-cyan-600 dark:text-cyan-400",
  "kpi-turbines": "text-blue-600 dark:text-blue-400",
  "kpi-shareholders": "text-violet-600 dark:text-violet-400",
  "kpi-fund-capital": "text-emerald-600 dark:text-emerald-400",
  "kpi-open-invoices": "text-amber-600 dark:text-amber-400",
  "kpi-contracts": "text-orange-600 dark:text-orange-400",
  "kpi-documents": "text-pink-600 dark:text-pink-400",
  "kpi-votes": "text-indigo-600 dark:text-indigo-400",
  // Energy widgets (planned)
  "kpi-energy-yield": "text-lime-600 dark:text-lime-400",
  "kpi-availability": "text-teal-600 dark:text-teal-400",
  "kpi-wind-speed": "text-sky-600 dark:text-sky-400",
  "kpi-lease-revenue": "text-rose-600 dark:text-rose-400",
};

export const KPI_ICON_COLORS: Record<string, string> = {
  "kpi-parks": "text-cyan-500/40 dark:text-cyan-400/30",
  "kpi-turbines": "text-blue-500/40 dark:text-blue-400/30",
  "kpi-shareholders": "text-violet-500/40 dark:text-violet-400/30",
  "kpi-fund-capital": "text-emerald-500/40 dark:text-emerald-400/30",
  "kpi-open-invoices": "text-amber-500/40 dark:text-amber-400/30",
  "kpi-contracts": "text-orange-500/40 dark:text-orange-400/30",
  "kpi-documents": "text-pink-500/40 dark:text-pink-400/30",
  "kpi-votes": "text-indigo-500/40 dark:text-indigo-400/30",
  // Energy widgets (planned)
  "kpi-energy-yield": "text-lime-500/40 dark:text-lime-400/30",
  "kpi-availability": "text-teal-500/40 dark:text-teal-400/30",
  "kpi-wind-speed": "text-sky-500/40 dark:text-sky-400/30",
  "kpi-lease-revenue": "text-rose-500/40 dark:text-rose-400/30",
};

// =============================================================================
// KPI CARD PROPS
// =============================================================================

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number; // Prozent
  trendLabel?: string;
  description?: string;
  isLoading?: boolean;
  isAlert?: boolean;
  accentColor?: string; // Tailwind color class for the value
  iconColor?: string; // Tailwind color class for the icon
  className?: string;
}

// =============================================================================
// KPI CARD COMPONENT
// =============================================================================

export function KPICard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  description,
  isLoading = false,
  isAlert = false,
  accentColor,
  iconColor,
  className,
}: KPICardProps) {
  // Trend formatting
  const getTrendColor = () => {
    if (isAlert) return "text-destructive";
    if (trend === undefined || trend === 0) return "text-muted-foreground";
    return trend > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  };

  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return TrendingUp;
    if (trend < 0) return TrendingDown;
    return Minus;
  };

  const formatTrend = (value: number): string => {
    const sign = value > 0 ? "+" : "";
    return `~ ${sign}${value.toFixed(1)} %`;
  };

  const TrendIcon = getTrendIcon();

  if (isLoading) {
    return (
      <Card className={cn("h-full overflow-hidden", className)}>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-5 rounded" />
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-3 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "h-full overflow-hidden transition-all hover:shadow-md",
      "border border-border/60 dark:border-border/40",
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-1">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn(
          "h-5 w-5 shrink-0",
          isAlert
            ? "text-destructive/60"
            : iconColor || "text-muted-foreground/30"
        )} />
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className={cn(
          "text-2xl font-bold truncate leading-tight",
          isAlert ? "text-destructive" : accentColor || "text-foreground"
        )}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 truncate">{description}</p>
        )}
        {(trend !== undefined || trendLabel) && (
          <div className={cn("mt-1.5 flex items-center text-xs", getTrendColor())}>
            {TrendIcon && <TrendIcon className="mr-1 h-3 w-3 shrink-0" />}
            <span className="truncate">
              {trend !== undefined ? formatTrend(trend) : trendLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// KPI CARD GRID (Container für mehrere KPI Cards)
// =============================================================================

interface KPICardGridProps {
  children: React.ReactNode;
  className?: string;
}

export function KPICardGrid({ children, className }: KPICardGridProps) {
  return (
    <div className={cn(
      "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      className
    )}>
      {children}
    </div>
  );
}

// =============================================================================
// KPI CARD SKELETON (für Loading States)
// =============================================================================

export function KPICardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <Skeleton className="h-8 w-28 mb-2" />
        <Skeleton className="h-3 w-32 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

export function KPICardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <KPICardSkeleton key={i} />
      ))}
    </div>
  );
}
