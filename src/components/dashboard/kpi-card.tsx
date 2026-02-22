"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  className,
}: KPICardProps) {
  // Trend-Formatierung
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
    return `${sign}${value.toFixed(1)}%`;
  };

  const TrendIcon = getTrendIcon();

  if (isLoading) {
    return (
      <Card className={cn("h-full overflow-hidden", className)}>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Skeleton className="h-7 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full overflow-hidden transition-all hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate">
          {title}
        </CardTitle>
        <Icon className={cn(
          "h-4 w-4 shrink-0",
          isAlert ? "text-destructive" : "text-muted-foreground"
        )} />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={cn(
          "text-xl font-bold truncate",
          isAlert && "text-destructive"
        )}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{description}</p>
        )}
        {(trend !== undefined || trendLabel) && (
          <div className={cn("mt-1 flex items-center text-xs", getTrendColor())}>
            {TrendIcon && <TrendIcon className="mr-1 h-3 w-3 shrink-0" />}
            <span className="truncate">{trend !== undefined ? formatTrend(trend) : trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// KPI CARD GRID (Container fuer mehrere KPI Cards)
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
// KPI CARD SKELETON (fuer Loading States)
// =============================================================================

export function KPICardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-32 mb-2" />
        <Skeleton className="h-3 w-16" />
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
