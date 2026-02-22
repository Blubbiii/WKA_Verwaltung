"use client";

import { useState, useCallback, useMemo } from "react";

// =============================================================================
// Drill-Down Hook for SCADA Analytics
// Manages year > month > day > detail navigation state
// =============================================================================

export type DrillLevel = "year" | "month" | "day" | "detail";

export interface DrillDownState {
  level: DrillLevel;
  year: number;
  month?: number;
  day?: number;
  turbineId?: string;
  turbineDesignation?: string;
}

export interface BreadcrumbSegment {
  label: string;
  level: DrillLevel;
  onClick: () => void;
}

const MONTH_NAMES: Record<number, string> = {
  1: "Januar",
  2: "Februar",
  3: "Maerz",
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Dezember",
};

export interface UseDrillDownReturn {
  /** Current drill-down state */
  state: DrillDownState;
  /** Navigate deeper into the data */
  drillDown: (target: Partial<DrillDownState>) => void;
  /** Go back one level */
  drillUp: () => void;
  /** Reset to year view */
  reset: () => void;
  /** Breadcrumb segments for navigation display */
  breadcrumbs: BreadcrumbSegment[];
  /** Whether we are at the top level */
  isTopLevel: boolean;
  /** Computed date range for the current drill level */
  dateRange: { from: string; to: string };
}

export function useDrillDown(initialYear: number): UseDrillDownReturn {
  const [state, setState] = useState<DrillDownState>({
    level: "year",
    year: initialYear,
  });

  // Navigate deeper
  const drillDown = useCallback((target: Partial<DrillDownState>) => {
    setState((prev) => {
      // Determine next level based on what info is provided
      if (target.day != null) {
        return {
          ...prev,
          ...target,
          level: target.turbineId ? "detail" : "day",
        };
      }
      if (target.month != null) {
        return {
          ...prev,
          ...target,
          level: "month",
          day: undefined,
        };
      }
      if (target.turbineId != null) {
        return {
          ...prev,
          ...target,
          level: prev.level === "year" ? "month" : prev.level,
        };
      }
      return { ...prev, ...target };
    });
  }, []);

  // Go back one level
  const drillUp = useCallback(() => {
    setState((prev) => {
      switch (prev.level) {
        case "detail":
          return {
            ...prev,
            level: "day" as DrillLevel,
            turbineId: undefined,
            turbineDesignation: undefined,
          };
        case "day":
          return {
            ...prev,
            level: "month" as DrillLevel,
            day: undefined,
          };
        case "month":
          return {
            ...prev,
            level: "year" as DrillLevel,
            month: undefined,
            turbineId: undefined,
            turbineDesignation: undefined,
          };
        default:
          return prev;
      }
    });
  }, []);

  // Reset to year view
  const reset = useCallback(() => {
    setState((prev) => ({
      level: "year",
      year: prev.year,
    }));
  }, []);

  // Compute breadcrumbs
  const breadcrumbs = useMemo<BreadcrumbSegment[]>(() => {
    const segments: BreadcrumbSegment[] = [];

    // Year segment (always present)
    segments.push({
      label: String(state.year),
      level: "year",
      onClick: () => reset(),
    });

    // Month segment
    if (state.month != null && state.level !== "year") {
      const monthLabel = MONTH_NAMES[state.month] ?? `Monat ${state.month}`;
      segments.push({
        label: monthLabel,
        level: "month",
        onClick: () => {
          setState((prev) => ({
            level: "month",
            year: prev.year,
            month: prev.month,
          }));
        },
      });
    }

    // Day segment
    if (state.day != null && (state.level === "day" || state.level === "detail")) {
      const dayLabel = `${state.day}. ${MONTH_NAMES[state.month!] ?? ""}`;
      segments.push({
        label: dayLabel,
        level: "day",
        onClick: () => {
          setState((prev) => ({
            level: "day",
            year: prev.year,
            month: prev.month,
            day: prev.day,
          }));
        },
      });
    }

    // Turbine segment (detail level)
    if (state.turbineDesignation && state.level === "detail") {
      segments.push({
        label: state.turbineDesignation,
        level: "detail",
        onClick: () => {
          // Already at detail, no-op
        },
      });
    }

    return segments;
  }, [state, reset]);

  // Compute date range for API queries
  const dateRange = useMemo(() => {
    const { year, month, day } = state;

    switch (state.level) {
      case "year": {
        return {
          from: `${year}-01-01T00:00:00.000Z`,
          to: `${year + 1}-01-01T00:00:00.000Z`,
        };
      }
      case "month": {
        if (month == null) {
          return {
            from: `${year}-01-01T00:00:00.000Z`,
            to: `${year + 1}-01-01T00:00:00.000Z`,
          };
        }
        const monthStr = String(month).padStart(2, "0");
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonthStr = String(nextMonth).padStart(2, "0");
        return {
          from: `${year}-${monthStr}-01T00:00:00.000Z`,
          to: `${nextYear}-${nextMonthStr}-01T00:00:00.000Z`,
        };
      }
      case "day":
      case "detail": {
        if (month == null || day == null) {
          return {
            from: `${year}-01-01T00:00:00.000Z`,
            to: `${year + 1}-01-01T00:00:00.000Z`,
          };
        }
        const mStr = String(month).padStart(2, "0");
        const dStr = String(day).padStart(2, "0");
        const nextDay = new Date(year, month - 1, day + 1);
        const nextDStr = String(nextDay.getDate()).padStart(2, "0");
        const nextMStr = String(nextDay.getMonth() + 1).padStart(2, "0");
        const nextYStr = nextDay.getFullYear();
        return {
          from: `${year}-${mStr}-${dStr}T00:00:00.000Z`,
          to: `${nextYStr}-${nextMStr}-${nextDStr}T00:00:00.000Z`,
        };
      }
      default:
        return {
          from: `${year}-01-01T00:00:00.000Z`,
          to: `${year + 1}-01-01T00:00:00.000Z`,
        };
    }
  }, [state]);

  const isTopLevel = state.level === "year";

  return {
    state,
    drillDown,
    drillUp,
    reset,
    breadcrumbs,
    isTopLevel,
    dateRange,
  };
}
