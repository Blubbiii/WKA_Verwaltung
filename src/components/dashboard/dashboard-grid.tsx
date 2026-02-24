"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "react-grid-layout/css/styles.css";
import { WidgetRenderer } from "./widget-renderer";
import type { DashboardWidget, AvailableWidget } from "@/hooks/useDashboardConfig";

// Import styles
import "./grid-styles.css";

// =============================================================================
// TYPES
// =============================================================================

interface Layout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  isDraggable?: boolean;
  isResizable?: boolean;
}

type Layouts = { [breakpoint: string]: Layout[] };

interface DashboardGridProps {
  widgets: DashboardWidget[];
  availableWidgets: AvailableWidget[];
  isEditing?: boolean;
  onLayoutChange?: (widgets: DashboardWidget[]) => void;
  onRemoveWidget?: (widgetId: string) => void;
  className?: string;
}

// =============================================================================
// GRID CONFIGURATION
// =============================================================================

const GRID_CONFIG = {
  breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 },
  cols: { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 },
  rowHeight: 60,
  margin: [16, 16] as [number, number],
  containerPadding: [0, 0] as [number, number],
};

// =============================================================================
// RESPONSIVE GRID LAYOUT (dynamically imported)
// =============================================================================

// Dynamic import for react-grid-layout
const ResponsiveGridLayout = dynamic<any>(
  () =>
    import("react-grid-layout").then((mod) => mod.ResponsiveGridLayout),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[200px] bg-muted/50 rounded-lg animate-pulse"
          />
        ))}
      </div>
    ),
  }
);

// =============================================================================
// DASHBOARD GRID COMPONENT
// =============================================================================

export function DashboardGrid({
  widgets,
  availableWidgets,
  isEditing = false,
  onLayoutChange,
  onRemoveWidget,
  className,
}: DashboardGridProps) {
  // Track mounted state to avoid SSR issues
  const [isMounted, setIsMounted] = useState(false);
  // Measure container width for ResponsiveGridLayout
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Observe container width changes with debouncing
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Set initial width
    setContainerWidth(node.offsetWidth);

    // Debounce using requestAnimationFrame to prevent excessive re-renders
    let rafId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Schedule update for next animation frame
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width > 0) {
            setContainerWidth(width);
          }
        }
        rafId = null;
      });
    });

    observer.observe(node);

    return () => {
      // Clean up: cancel pending animation frame and disconnect observer
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [isMounted]);

  // Convert widgets to react-grid-layout format.
  // Sanitize all position values to ensure react-grid-layout never receives
  // null/undefined/NaN for x, y, w, or h.
  const layouts = useMemo((): Layouts => {
    const lgLayout: Layout[] = widgets.map((widget) => {
      const pos = widget.position;
      return {
        i: widget.id,
        x: typeof pos?.x === "number" && Number.isFinite(pos.x) ? pos.x : 0,
        y: typeof pos?.y === "number" && Number.isFinite(pos.y) ? pos.y : 0,
        w: typeof pos?.w === "number" && Number.isFinite(pos.w) ? Math.max(1, pos.w) : 3,
        h: typeof pos?.h === "number" && Number.isFinite(pos.h) ? Math.max(1, pos.h) : 2,
        minW: pos?.minW ?? 3,
        minH: pos?.minH ?? 2,
        maxW: pos?.maxW ?? 12,
        maxH: pos?.maxH ?? 6,
        isDraggable: isEditing,
        isResizable: isEditing,
      };
    });

    return {
      lg: lgLayout,
      md: lgLayout,
      sm: lgLayout,
      xs: lgLayout,
      xxs: lgLayout,
    };
  }, [widgets, isEditing]);

  // Handle layout changes
  const handleLayoutChange = useCallback(
    (currentLayout: Layout[], _allLayouts: Layouts) => {
      if (!onLayoutChange || !isEditing) return;

      // Convert layout back to DashboardWidget format.
      // Only include widgets that exist in our widgets array (react-grid-layout
      // may report stale items during transitions). Sanitize all position values
      // to guarantee they are valid finite numbers -- never null or undefined.
      const widgetMap = new Map(widgets.map((w) => [w.id, w]));

      const updatedWidgets: DashboardWidget[] = currentLayout
        .filter((layoutItem) => widgetMap.has(layoutItem.i))
        .map((layoutItem) => {
          const originalWidget = widgetMap.get(layoutItem.i)!;
          return {
            id: layoutItem.i,
            widgetId: originalWidget.widgetId,
            position: {
              x: typeof layoutItem.x === "number" && Number.isFinite(layoutItem.x) ? layoutItem.x : 0,
              y: typeof layoutItem.y === "number" && Number.isFinite(layoutItem.y) ? layoutItem.y : 0,
              w: typeof layoutItem.w === "number" && Number.isFinite(layoutItem.w) ? Math.max(1, layoutItem.w) : (originalWidget.position?.w ?? 3),
              h: typeof layoutItem.h === "number" && Number.isFinite(layoutItem.h) ? Math.max(1, layoutItem.h) : (originalWidget.position?.h ?? 2),
              minW: originalWidget.position?.minW,
              minH: originalWidget.position?.minH,
              maxW: originalWidget.position?.maxW,
              maxH: originalWidget.position?.maxH,
            },
          };
        });

      onLayoutChange(updatedWidgets);
    },
    [onLayoutChange, isEditing, widgets]
  );

  // Handle widget removal
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (onRemoveWidget) {
        onRemoveWidget(widgetId);
      }
    },
    [onRemoveWidget]
  );

  // Don't render on server
  if (!isMounted) {
    return (
      <div ref={containerRef} className={className}>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {widgets.slice(0, 4).map((widget) => (
            <div
              key={widget.id}
              className="h-[200px] bg-muted/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // Wait for container width measurement before rendering grid
  if (containerWidth === 0) {
    return (
      <div ref={containerRef} className={className}>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {widgets.slice(0, 4).map((widget) => (
            <div
              key={widget.id}
              className="h-[200px] bg-muted/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={GRID_CONFIG.breakpoints}
        cols={GRID_CONFIG.cols}
        rowHeight={GRID_CONFIG.rowHeight}
        margin={GRID_CONFIG.margin}
        containerPadding={GRID_CONFIG.containerPadding}
        width={containerWidth}
        isDraggable={isEditing}
        isResizable={isEditing}
        onLayoutChange={handleLayoutChange}
        draggableHandle={isEditing ? undefined : ".no-drag"}
        useCSSTransforms={true}
        compactType="vertical"
        preventCollision={false}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`h-full overflow-hidden rounded-lg hover:shadow-md transition-shadow duration-200 ${isEditing ? "cursor-grab active:cursor-grabbing ring-1 ring-primary/10" : ""}`}
          >
            <WidgetRenderer
              widgetId={widget.widgetId}
              isEditing={isEditing}
              onRemove={isEditing ? () => handleRemoveWidget(widget.id) : undefined}
              availableWidgets={availableWidgets}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}

// =============================================================================
// DASHBOARD GRID SKELETON
// =============================================================================

export function DashboardGridSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in-0 duration-300">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-[200px] bg-muted/50 rounded-lg animate-pulse border border-border/30"
          style={{ animationDelay: `${i * 75}ms` }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// EMPTY DASHBOARD STATE
// =============================================================================

interface EmptyDashboardProps {
  onAddWidget?: () => void;
}

export function EmptyDashboard({ onAddWidget }: EmptyDashboardProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-border/60 rounded-xl p-8 bg-gradient-to-br from-muted/30 via-transparent to-transparent animate-in fade-in-0 duration-500">
      <div className="text-center">
        <h3 className="text-lg font-semibold tracking-tight mb-2">Dashboard ist leer</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Fuegen Sie Widgets hinzu, um Ihr Dashboard zu gestalten.
        </p>
        {onAddWidget && (
          <button
            onClick={onAddWidget}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Widget hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}
