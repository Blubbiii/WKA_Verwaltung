"use client";

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface DashboardWidget {
  id: string;
  widgetId: string;
  position: WidgetPosition;
}

export interface DashboardConfig {
  id: string;
  userId: string;
  widgets: DashboardWidget[];
  createdAt: string;
  updatedAt: string;
}

export interface AvailableWidget {
  id: string;
  name: string;
  description: string;
  category: "kpi" | "chart" | "list" | "admin" | "utility" | "weather" | "quick-actions";
  defaultSize: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  };
  requiredRole?: string[];
}

export interface UseDashboardConfigResult {
  config: DashboardConfig | null;
  availableWidgets: AvailableWidget[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updateConfig: (widgets: DashboardWidget[]) => Promise<void>;
  resetConfig: () => Promise<void>;
  refetch: () => Promise<void>;
}

// =============================================================================
// DEFAULT WIDGETS (fallback wenn API nicht erreichbar)
// =============================================================================

// =============================================================================
// Standard sizes: small=3x2, medium=4x3, large=6x4
// =============================================================================
const DEFAULT_AVAILABLE_WIDGETS: AvailableWidget[] = [
  // KPI Widgets (small: 3x2)
  { id: "kpi-parks",          name: "Windparks",          description: "Zeigt Anzahl aktiver Windparks",         category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-turbines",       name: "Turbinen",           description: "Zeigt Anzahl der Turbinen",              category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-shareholders",   name: "Gesellschafter",     description: "Zeigt Anzahl der Gesellschafter",        category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-fund-capital",   name: "Gesellschaftskapital",       description: "Zeigt das gesamte Gesellschaftskapital",         category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-open-invoices",  name: "Offene Rechnungen",  description: "Zeigt offene Rechnungen und Betrag",     category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-contracts",      name: "Verträge",          description: "Zeigt Verträge und auslaufende",        category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-documents",      name: "Dokumente",          description: "Zeigt Dokument-Statistiken",             category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },
  { id: "kpi-votes",          name: "Abstimmungen",       description: "Zeigt aktive Abstimmungen",              category: "kpi", defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 2 } },

  // Chart Widgets (large: 6x4 / medium: 4x3)
  { id: "chart-monthly-invoices",    name: "Rechnungen pro Monat",  description: "Balkendiagramm der monatlichen Rechnungen",  category: "chart", defaultSize: { w: 6, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 6 } },
  { id: "chart-capital-development", name: "Kapitalentwicklung",    description: "Liniendiagramm der Kapitalentwicklung",      category: "chart", defaultSize: { w: 6, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 6 } },
  { id: "chart-documents-by-type",   name: "Dokumente nach Typ",    description: "Kreisdiagramm der Dokumenttypen",            category: "chart", defaultSize: { w: 4, h: 3, minW: 4, minH: 3, maxW: 8,  maxH: 4 } },

  // List Widgets (medium: 4x3)
  { id: "list-deadlines",          name: "Anstehende Fristen",     description: "Liste der anstehenden Fristen",            category: "list", defaultSize: { w: 4, h: 3, minW: 4, minH: 3, maxW: 8, maxH: 6 } },
  { id: "list-activities",         name: "Letzte Aktivitäten",    description: "Liste der letzten Aktivitäten im System", category: "list", defaultSize: { w: 4, h: 3, minW: 4, minH: 3, maxW: 8, maxH: 6 } },
  { id: "list-expiring-contracts", name: "Auslaufende Verträge",  description: "Liste der bald auslaufenden Verträge",   category: "list", defaultSize: { w: 4, h: 3, minW: 4, minH: 3, maxW: 8, maxH: 6 } },

  // Utility Widgets (small: 3x2)
  { id: "weather-widget", name: "Wetter",        description: "Wetterdaten für Windparks",               category: "weather",       defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 4 } },
  { id: "quick-actions",  name: "Schnellzugriff", description: "Schnellzugriff auf haeufige Aktionen",     category: "quick-actions",  defaultSize: { w: 3, h: 2, minW: 3, minH: 2, maxW: 6, maxH: 4 } },

  // Admin Widgets (medium: 4x3 / large: 6x4)
  { id: "admin-system-status", name: "System-Status",         description: "Zeigt den aktuellen System-Status",   category: "admin", defaultSize: { w: 4, h: 3, minW: 4, minH: 3, maxW: 8,  maxH: 4 }, requiredRole: ["ADMIN"] },
  { id: "admin-audit-log",     name: "Audit-Log",             description: "Letzte Audit-Log Einträge",          category: "admin", defaultSize: { w: 6, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 6 }, requiredRole: ["ADMIN"] },
  { id: "admin-billing-jobs",  name: "Billing-Jobs",          description: "Status der Abrechnungs-Jobs",         category: "admin", defaultSize: { w: 6, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 6 }, requiredRole: ["SUPERADMIN"] },
];

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

// Standard sizes: small=3x2, medium=4x3, large=6x4
const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  // Row 0-1: 4 KPIs (3x2 each = 12 cols)
  { id: "1", widgetId: "kpi-parks",        position: { x: 0, y: 0, w: 3, h: 2 } },
  { id: "2", widgetId: "kpi-turbines",     position: { x: 3, y: 0, w: 3, h: 2 } },
  { id: "3", widgetId: "kpi-shareholders", position: { x: 6, y: 0, w: 3, h: 2 } },
  { id: "4", widgetId: "kpi-fund-capital", position: { x: 9, y: 0, w: 3, h: 2 } },
  // Row 2-3: 4 more KPIs (3x2 each = 12 cols)
  { id: "5", widgetId: "kpi-open-invoices", position: { x: 0, y: 2, w: 3, h: 2 } },
  { id: "6", widgetId: "kpi-contracts",     position: { x: 3, y: 2, w: 3, h: 2 } },
  { id: "7", widgetId: "kpi-documents",     position: { x: 6, y: 2, w: 3, h: 2 } },
  { id: "8", widgetId: "kpi-votes",         position: { x: 9, y: 2, w: 3, h: 2 } },
  // Row 4-7: 2 large charts (6x4 each = 12 cols)
  { id: "9",  widgetId: "chart-monthly-invoices",    position: { x: 0, y: 4, w: 6, h: 4 } },
  { id: "10", widgetId: "chart-capital-development", position: { x: 6, y: 4, w: 6, h: 4 } },
  // Row 8-10: 3 medium lists (4x3 each = 12 cols)
  { id: "11", widgetId: "list-deadlines",          position: { x: 0, y: 8, w: 4, h: 3 } },
  { id: "12", widgetId: "list-activities",         position: { x: 4, y: 8, w: 4, h: 3 } },
  { id: "13", widgetId: "chart-documents-by-type", position: { x: 8, y: 8, w: 4, h: 3 } },
  // Row 11-12: utility (3x2)
  { id: "14", widgetId: "quick-actions", position: { x: 0, y: 11, w: 3, h: 2 } },
];

// =============================================================================
// GRID PLACEMENT HELPERS
// =============================================================================

const GRID_COLS = 12;

/**
 * Ensures a numeric value is a valid finite number, falling back to a default.
 * Handles null, undefined, NaN, and Infinity.
 */
function safeNum(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

/**
 * Finds the next free grid position for a widget of given width x height.
 *
 * Scans left-to-right, top-to-bottom through the grid to find the first
 * position where the widget fits without overlapping any existing widget.
 *
 * @param existingWidgets - Currently placed widgets with valid positions
 * @param newWidth - Width of the new widget in grid columns
 * @param newHeight - Height of the new widget in grid rows
 * @param gridCols - Total number of grid columns (default 12)
 * @returns The {x, y} position where the widget can be placed
 */
export function findNextFreePosition(
  existingWidgets: DashboardWidget[],
  newWidth: number,
  newHeight: number,
  gridCols: number = GRID_COLS
): { x: number; y: number } {
  if (existingWidgets.length === 0) {
    return { x: 0, y: 0 };
  }

  // Determine the maximum row we need to scan.
  // The worst case is all widgets stacked vertically, plus room for the new one.
  const maxY = existingWidgets.reduce((max, w) => {
    const bottom = safeNum(w.position?.y, 0) + safeNum(w.position?.h, 2);
    return bottom > max ? bottom : max;
  }, 0);

  // Build a set-based occupancy map for fast lookups.
  // Key format: "x,y" for each occupied cell.
  const occupied = new Set<string>();
  for (const w of existingWidgets) {
    const wx = safeNum(w.position?.x, 0);
    const wy = safeNum(w.position?.y, 0);
    const ww = safeNum(w.position?.w, 3);
    const wh = safeNum(w.position?.h, 2);
    for (let row = wy; row < wy + wh; row++) {
      for (let col = wx; col < wx + ww; col++) {
        occupied.add(`${col},${row}`);
      }
    }
  }

  // Scan row by row, column by column
  // We scan up to maxY + newHeight to guarantee we find a free row below all widgets
  for (let y = 0; y <= maxY + newHeight; y++) {
    for (let x = 0; x <= gridCols - newWidth; x++) {
      // Check if the rectangle (x, y, newWidth, newHeight) is entirely free
      let fits = true;
      for (let row = y; row < y + newHeight && fits; row++) {
        for (let col = x; col < x + newWidth && fits; col++) {
          if (occupied.has(`${col},${row}`)) {
            fits = false;
          }
        }
      }
      if (fits) {
        return { x, y };
      }
    }
  }

  // Fallback: place below everything (should never reach here due to scan range)
  return { x: 0, y: maxY };
}

// =============================================================================
// FORMAT CONVERSION: API ↔ Frontend
// API format:      { id: "kpi-parks", x: 0, y: 0, w: 3, h: 2 }
// Frontend format: { id: "1", widgetId: "kpi-parks", position: { x: 0, y: 0, w: 3, h: 2 } }
// =============================================================================

function apiWidgetsToFrontend(apiWidgets: Record<string, unknown>[]): DashboardWidget[] {
  return apiWidgets.map((w, idx: number) => {
    // Extract position from either nested position object or flat fields
    const pos = w.position as Record<string, unknown> | undefined;
    const rawX = pos?.x ?? w.x;
    const rawY = pos?.y ?? w.y;
    const rawW = pos?.w ?? w.w;
    const rawH = pos?.h ?? w.h;

    return {
      id: (w.id as string)?.toString() || String(idx + 1),
      widgetId: (w.id || w.widgetId) as string,
      position: {
        x: safeNum(rawX, 0),
        y: safeNum(rawY, 0),
        w: Math.max(1, safeNum(rawW, 3)),
        h: Math.max(1, safeNum(rawH, 2)),
        minW: pos?.minW as number | undefined,
        minH: pos?.minH as number | undefined,
        maxW: pos?.maxW as number | undefined,
        maxH: pos?.maxH as number | undefined,
      },
    };
  });
}

function frontendWidgetsToApi(widgets: DashboardWidget[]): { id: string; x: number; y: number; w: number; h: number }[] {
  return widgets.map((w) => ({
    id: w.widgetId,
    // Ensure valid integer values (handle null/undefined/NaN/Infinity/float)
    x: Math.round(safeNum(w.position?.x, 0)),
    y: Math.round(safeNum(w.position?.y, 0)),
    w: Math.max(1, Math.round(safeNum(w.position?.w, 3))),
    h: Math.max(1, Math.round(safeNum(w.position?.h, 2))),
  }));
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useDashboardConfig(): UseDashboardConfigResult {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [availableWidgets, setAvailableWidgets] = useState<AvailableWidget[]>(
    DEFAULT_AVAILABLE_WIDGETS
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard config
  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/user/dashboard-config");

      if (response.ok) {
        const data = await response.json();
        // API returns { config: { widgets: [...] }, isDefault }
        const apiConfig = data.config || data;
        const apiWidgets = apiConfig.widgets || [];
        setConfig({
          id: apiConfig.id || "saved",
          userId: apiConfig.userId || "current",
          widgets: apiWidgetsToFrontend(apiWidgets),
          createdAt: apiConfig.createdAt || new Date().toISOString(),
          updatedAt: apiConfig.updatedAt || new Date().toISOString(),
        });
      } else if (response.status === 404) {
        // No config exists yet, use default
        setConfig({
          id: "default",
          userId: "current",
          widgets: DEFAULT_DASHBOARD_WIDGETS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Fehler beim Laden der Dashboard-Konfiguration"
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);

      // Use default config on error
      setConfig({
        id: "default",
        userId: "current",
        widgets: DEFAULT_DASHBOARD_WIDGETS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch available widgets
  const fetchAvailableWidgets = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/widgets");

      if (response.ok) {
        const data = await response.json();
        const rawWidgets: unknown[] = Array.isArray(data) ? data : data.widgets ?? [];
        // API returns WidgetDefinition format (defaultWidth/defaultHeight),
        // transform to AvailableWidget format (defaultSize: { w, h })
        const mapped: AvailableWidget[] = rawWidgets.map((raw) => {
          const w = raw as Record<string, unknown>;
          return {
            id: w.id as string,
            name: w.name as string,
            description: w.description as string,
            category: w.category as AvailableWidget["category"],
            requiredRole: (w.requiredRole ?? (w.minRole ? [w.minRole] : undefined)) as string[] | undefined,
            defaultSize: (w.defaultSize as AvailableWidget["defaultSize"]) ?? {
              w: (w.defaultWidth as number) ?? 3,
              h: (w.defaultHeight as number) ?? 2,
              minW: w.minWidth as number | undefined,
              minH: w.minHeight as number | undefined,
              maxW: w.maxWidth as number | undefined,
              maxH: w.maxHeight as number | undefined,
            },
          };
        });
        setAvailableWidgets(mapped);
      } else {
        // Use default widgets on error
        setAvailableWidgets(DEFAULT_AVAILABLE_WIDGETS);
      }
    } catch {
      setAvailableWidgets(DEFAULT_AVAILABLE_WIDGETS);
    }
  }, []);

  // Update config
  const updateConfig = useCallback(async (widgets: DashboardWidget[]) => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch("/api/user/dashboard-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: frontendWidgetsToApi(widgets) }),
      });

      if (response.ok) {
        const data = await response.json();
        // API returns { config: { widgets: [...] }, isDefault, message }
        const apiConfig = data.config || data;
        const apiWidgets = apiConfig.widgets || [];
        setConfig({
          id: apiConfig.id || "saved",
          userId: apiConfig.userId || "current",
          widgets: apiWidgetsToFrontend(apiWidgets),
          createdAt: apiConfig.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Fehler beim Speichern der Dashboard-Konfiguration"
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Reset config to default
  const resetConfig = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch("/api/user/dashboard-config/reset", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      } else {
        // If reset fails, just set to default locally
        setConfig({
          id: "default",
          userId: "current",
          widgets: DEFAULT_DASHBOARD_WIDGETS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Use default on error
      setConfig({
        id: "default",
        userId: "current",
        widgets: DEFAULT_DASHBOARD_WIDGETS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchConfig();
    fetchAvailableWidgets();
  }, [fetchConfig, fetchAvailableWidgets]);

  return {
    config,
    availableWidgets,
    isLoading,
    isSaving,
    error,
    updateConfig,
    resetConfig,
    refetch: fetchConfig,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getWidgetById(
  widgets: AvailableWidget[],
  widgetId: string
): AvailableWidget | undefined {
  return widgets.find((w) => w.id === widgetId);
}

export function getCategoryLabel(category: AvailableWidget["category"]): string {
  const labels: Record<AvailableWidget["category"], string> = {
    kpi: "KPI Karten",
    chart: "Diagramme",
    list: "Listen",
    admin: "Administration",
    utility: "Werkzeuge",
    weather: "Wetter",
    "quick-actions": "Schnellzugriff",
  };
  return labels[category];
}

export function groupWidgetsByCategory(
  widgets: AvailableWidget[]
): Record<AvailableWidget["category"], AvailableWidget[]> {
  return widgets.reduce(
    (acc, widget) => {
      if (!acc[widget.category]) {
        acc[widget.category] = [];
      }
      acc[widget.category].push(widget);
      return acc;
    },
    {} as Record<AvailableWidget["category"], AvailableWidget[]>
  );
}

export { DEFAULT_DASHBOARD_WIDGETS, DEFAULT_AVAILABLE_WIDGETS };
