"use client";

import { useMemo } from "react";
import {
  BarChart3,
  LayoutGrid,
  List,
  Cloud,
  Zap,
  Shield,
  Wrench,
  X,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AvailableWidget,
  type DashboardWidget,
  getCategoryLabel,
  groupWidgetsByCategory,
} from "@/hooks/useDashboardConfig";

// =============================================================================
// TYPES
// =============================================================================

interface WidgetSidebarProps {
  availableWidgets: AvailableWidget[];
  currentWidgets: DashboardWidget[];
  onAddWidget: (widget: AvailableWidget) => void;
  onClose?: () => void;
  className?: string;
}

// =============================================================================
// CATEGORY ICONS
// =============================================================================

const CATEGORY_ICONS: Record<AvailableWidget["category"], React.ReactNode> = {
  kpi: <LayoutGrid className="h-4 w-4" />,
  chart: <BarChart3 className="h-4 w-4" />,
  list: <List className="h-4 w-4" />,
  utility: <Wrench className="h-4 w-4" />,
  weather: <Cloud className="h-4 w-4" />,
  "quick-actions": <Zap className="h-4 w-4" />,
  admin: <Shield className="h-4 w-4" />,
};

// =============================================================================
// SCROLL AREA COMPONENT
// =============================================================================

function ScrollArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("overflow-auto", className)}>{children}</div>;
}

// =============================================================================
// WIDGET SIDEBAR COMPONENT
// =============================================================================

export function WidgetSidebar({
  availableWidgets,
  currentWidgets,
  onAddWidget,
  onClose,
  className,
}: WidgetSidebarProps) {
  // Get widget IDs that are already in the dashboard
  const currentWidgetIds = useMemo(
    () => new Set(currentWidgets.map((w) => w.widgetId)),
    [currentWidgets]
  );

  // Filter out widgets already in dashboard and group by category
  const availableByCategory = useMemo(() => {
    const filtered = availableWidgets.filter(
      (w) => !currentWidgetIds.has(w.id)
    );
    return groupWidgetsByCategory(filtered);
  }, [availableWidgets, currentWidgetIds]);

  // Get category order
  const categoryOrder: AvailableWidget["category"][] = [
    "kpi",
    "chart",
    "list",
    "utility",
    "weather",
    "quick-actions",
    "admin",
  ];

  const sortedCategories = categoryOrder.filter(
    (cat) => availableByCategory[cat]?.length > 0
  );

  const totalAvailable = Object.values(availableByCategory).flat().length;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-l w-80",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold">Widgets hinzufügen</h2>
          <p className="text-xs text-muted-foreground">
            {totalAvailable} Widgets verfügbar
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Widget List */}
      <ScrollArea className="flex-1 p-4">
        {totalAvailable === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <LayoutGrid className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Alle Widgets wurden hinzugefügt</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedCategories.map((category) => {
              const widgets = availableByCategory[category];
              if (!widgets || widgets.length === 0) return null;

              return (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-muted-foreground">
                      {CATEGORY_ICONS[category]}
                    </span>
                    <h3 className="text-sm font-medium">
                      {getCategoryLabel(category)}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      ({widgets.length})
                    </span>
                  </div>

                  {/* Widget List */}
                  <div className="space-y-2">
                    {widgets.map((widget) => (
                      <WidgetItem
                        key={widget.id}
                        widget={widget}
                        onAdd={() => onAddWidget(widget)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          Klicken Sie auf ein Widget um es hinzuzufuegen
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// WIDGET ITEM COMPONENT
// =============================================================================

interface WidgetItemProps {
  widget: AvailableWidget;
  onAdd: () => void;
}

function WidgetItem({ widget, onAdd }: WidgetItemProps) {
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left group"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 opacity-50 group-hover:opacity-100" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{widget.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {widget.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 bg-muted rounded">
            {widget.defaultSize.w}x{widget.defaultSize.h}
          </span>
          {widget.requiredRole && (
            <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-600 rounded">
              Admin
            </span>
          )}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded">
          +
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// WIDGET SIDEBAR SHEET (Mobile/Overlay version)
// =============================================================================

interface WidgetSidebarSheetProps extends WidgetSidebarProps {
  isOpen: boolean;
}

export function WidgetSidebarSheet({
  isOpen,
  onClose,
  ...props
}: WidgetSidebarSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full z-50 animate-in slide-in-from-right">
        <WidgetSidebar {...props} onClose={onClose} />
      </div>
    </>
  );
}
