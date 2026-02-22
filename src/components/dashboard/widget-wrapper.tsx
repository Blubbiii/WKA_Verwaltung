"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, GripVertical, AlertTriangle, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

export interface WidgetWrapperProps {
  title?: string;
  children: ReactNode;
  isEditing?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRemove?: () => void;
  onRetry?: () => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  showHeader?: boolean;
  noPadding?: boolean;
}

// =============================================================================
// WIDGET WRAPPER COMPONENT
// =============================================================================

export function WidgetWrapper({
  title,
  children,
  isEditing = false,
  isLoading = false,
  error = null,
  onRemove,
  onRetry,
  className,
  headerClassName,
  contentClassName,
  showHeader = true,
  noPadding = false,
}: WidgetWrapperProps) {
  // Loading State
  if (isLoading) {
    return (
      <Card className={cn("h-full overflow-hidden flex flex-col", className)}>
        {showHeader && title && (
          <CardHeader className={cn("p-4 pb-2", headerClassName)}>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
        )}
        <CardContent className={cn("flex-1", noPadding ? "p-0" : "p-4 pt-0", contentClassName)}>
          <div className="flex items-center justify-center h-full min-h-[80px]">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="text-xs text-muted-foreground">Laden...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error State
  if (error) {
    return (
      <Card className={cn("h-full overflow-hidden flex flex-col border-destructive/50", className)}>
        {showHeader && title && (
          <CardHeader className={cn("p-4 pb-2", headerClassName)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              {isEditing && onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onRemove}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent className={cn("flex-1", noPadding ? "p-0" : "p-4 pt-0", contentClassName)}>
          <div className="flex flex-col items-center justify-center h-full min-h-[80px] gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="text-xs text-muted-foreground text-center">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs">
                <RefreshCcw className="h-3 w-3 mr-1" />
                Erneut versuchen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Normal State
  return (
    <Card
      className={cn(
        "h-full overflow-hidden flex flex-col transition-all",
        isEditing && "ring-2 ring-primary/20 hover:ring-primary/40",
        className
      )}
    >
      {showHeader && title && (
        <CardHeader className={cn("p-4 pb-2", headerClassName)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {isEditing && (
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing" />
              )}
              <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
            </div>
            {isEditing && onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent
        className={cn(
          "flex-1 overflow-auto",
          noPadding ? "p-0" : "p-4 pt-0",
          !showHeader && "pt-4",
          contentClassName
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// WIDGET SKELETON
// =============================================================================

export function WidgetSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

// =============================================================================
// EMPTY WIDGET STATE
// =============================================================================

export function EmptyWidgetState({
  message = "Keine Daten verfuegbar",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center h-full min-h-[100px] text-muted-foreground",
        className
      )}
    >
      <p className="text-sm">{message}</p>
    </div>
  );
}
