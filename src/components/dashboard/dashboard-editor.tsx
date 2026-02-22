"use client";

import { useState, useCallback, useEffect } from "react";
import { Save, X, RotateCcw, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardGrid } from "./dashboard-grid";
import { WidgetSidebarSheet } from "./widget-sidebar";
import {
  useDashboardConfig,
  findNextFreePosition,
  type DashboardWidget,
  type AvailableWidget,
} from "@/hooks/useDashboardConfig";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

interface DashboardEditorProps {
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}

// =============================================================================
// DASHBOARD EDITOR COMPONENT
// =============================================================================

export function DashboardEditor({
  onSave,
  onCancel,
  className,
}: DashboardEditorProps) {
  const {
    config,
    availableWidgets,
    isLoading,
    isSaving,
    error,
    updateConfig,
    resetConfig,
  } = useDashboardConfig();

  // Local state for editing
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Initialize local widgets from config
  useEffect(() => {
    if (config?.widgets) {
      setLocalWidgets(config.widgets);
      setHasChanges(false);
    }
  }, [config]);

  // Handle layout changes from grid
  const handleLayoutChange = useCallback((widgets: DashboardWidget[]) => {
    setLocalWidgets(widgets);
    setHasChanges(true);
  }, []);

  // Handle widget removal
  const handleRemoveWidget = useCallback((widgetId: string) => {
    setLocalWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    setHasChanges(true);
  }, []);

  // Handle adding a widget
  const handleAddWidget = useCallback((widget: AvailableWidget) => {
    const newW = widget.defaultSize.w;
    const newH = widget.defaultSize.h;

    // Find the first free grid position that fits this widget
    const { x, y } = findNextFreePosition(localWidgets, newW, newH);

    const newWidget: DashboardWidget = {
      id: uuidv4(),
      widgetId: widget.id,
      position: {
        x,
        y,
        w: newW,
        h: newH,
        minW: widget.defaultSize.minW,
        minH: widget.defaultSize.minH,
        maxW: widget.defaultSize.maxW,
        maxH: widget.defaultSize.maxH,
      },
    };

    setLocalWidgets((prev) => [...prev, newWidget]);
    setHasChanges(true);
    setShowSidebar(false);
  }, [localWidgets]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      setSaveError(null);
      await updateConfig(localWidgets);
      setHasChanges(false);
      onSave?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fehler beim Speichern";
      setSaveError(message);
    }
  }, [localWidgets, updateConfig, onSave]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (config?.widgets) {
      setLocalWidgets(config.widgets);
      setHasChanges(false);
    }
    onCancel?.();
  }, [config, onCancel]);

  // Handle reset
  const handleReset = useCallback(() => {
    setResetDialogOpen(true);
  }, []);

  const handleConfirmReset = useCallback(async () => {
    try {
      setSaveError(null);
      await resetConfig();
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fehler beim Zuruecksetzen";
      setSaveError(message);
    } finally {
      setResetDialogOpen(false);
    }
  }, [resetConfig]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Dashboard wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Editor Toolbar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b mb-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Dashboard bearbeiten</h2>
            {hasChanges && (
              <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded">
                Ungespeicherte Aenderungen
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSidebar(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Widget hinzufuegen
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Zuruecksetzen
            </Button>

            <div className="w-px h-6 bg-border mx-2" />

            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-2" />
              Abbrechen
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Speichern
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {(error || saveError) && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || saveError}</AlertDescription>
        </Alert>
      )}

      {/* Edit Mode Hint */}
      <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <p>
          <strong>Tipp:</strong> Ziehen Sie Widgets um sie neu anzuordnen. Aendern Sie
          die Groesse durch Ziehen an den Ecken. Klicken Sie auf das X um Widgets zu
          entfernen.
        </p>
      </div>

      {/* Dashboard Grid */}
      <DashboardGrid
        widgets={localWidgets}
        availableWidgets={availableWidgets}
        isEditing={true}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemoveWidget}
      />

      {/* Widget Sidebar */}
      <WidgetSidebarSheet
        isOpen={showSidebar}
        availableWidgets={availableWidgets}
        currentWidgets={localWidgets}
        onAddWidget={handleAddWidget}
        onClose={() => setShowSidebar(false)}
      />

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dashboard zuruecksetzen</AlertDialogTitle>
            <AlertDialogDescription>
              Moechten Sie das Dashboard wirklich auf die Standardeinstellungen zuruecksetzen? Alle individuellen Anpassungen gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmReset();
              }}
            >
              Zuruecksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// DASHBOARD VIEW COMPONENT (Read-only mode)
// =============================================================================

interface DashboardViewProps {
  onEdit?: () => void;
  className?: string;
}

export function DashboardView({ onEdit, className }: DashboardViewProps) {
  const { config, availableWidgets, isLoading, error, refetch } = useDashboardConfig();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Dashboard wird geladen...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>
          {error}
          <Button
            variant="link"
            size="sm"
            onClick={() => refetch()}
            className="ml-2 p-0 h-auto"
          >
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!config?.widgets || config.widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed rounded-lg p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Dashboard ist leer</h3>
          <p className="text-muted-foreground mb-4">
            Fuegen Sie Widgets hinzu, um Ihr Dashboard zu gestalten.
          </p>
          {onEdit && (
            <Button onClick={onEdit}>
              <Plus className="h-4 w-4 mr-2" />
              Dashboard anpassen
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <DashboardGrid
        widgets={config.widgets}
        availableWidgets={availableWidgets}
        isEditing={false}
      />
    </div>
  );
}
