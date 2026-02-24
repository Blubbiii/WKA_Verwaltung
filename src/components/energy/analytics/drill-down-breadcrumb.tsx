"use client";

import { ChevronRight, ChevronLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BreadcrumbSegment } from "@/hooks/useDrillDown";

// =============================================================================
// Drill-Down Breadcrumb Navigation
// Shows path: 2025 > Januar > 15. Januar > WEA 01
// =============================================================================

interface DrillDownBreadcrumbProps {
  breadcrumbs: BreadcrumbSegment[];
  onBack: () => void;
  onReset: () => void;
  isTopLevel: boolean;
  className?: string;
}

export function DrillDownBreadcrumb({
  breadcrumbs,
  onBack,
  onReset,
  isTopLevel,
  className,
}: DrillDownBreadcrumbProps) {
  if (isTopLevel) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2",
        className,
      )}
    >
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
        aria-label="Zurück zur vorherigen Ebene"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Zurück</span>
      </Button>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Breadcrumb segments */}
      <nav
        aria-label="Drill-Down Navigation"
        className="flex items-center gap-1 overflow-x-auto"
      >
        {breadcrumbs.map((segment, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <div key={`${segment.level}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
              {isLast ? (
                <span className="whitespace-nowrap text-sm font-medium text-foreground">
                  {segment.label}
                </span>
              ) : (
                <button
                  onClick={segment.onClick}
                  className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                >
                  {segment.label}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reset button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
        aria-label="Zurück zur Jahresübersicht"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Jahresübersicht</span>
      </Button>
    </div>
  );
}
