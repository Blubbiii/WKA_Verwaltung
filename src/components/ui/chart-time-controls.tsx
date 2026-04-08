"use client";

import { useState } from "react";
import { Calendar, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

type Period = "day" | "week" | "month" | "year";
type CompareOption = "previousPeriod" | "previousYear" | "none";

interface ChartTimeControlsProps {
  chartId: string;
  periods?: Period[];
  defaultPeriod?: Period;
  onPeriodChange?: (period: Period) => void;
  comparison?: {
    enabled: boolean;
    options?: CompareOption[];
    defaultCompare?: CompareOption;
    onCompare?: (compareType: CompareOption) => void;
  };
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_PREFIX = "wpm:chart-period:";
const COMPARE_PREFIX = "wpm:chart-compare:";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  year: "Jahr",
};

const COMPARE_LABELS: Record<CompareOption, string> = {
  previousPeriod: "vs. Vorperiode",
  previousYear: "vs. Vorjahr",
  none: "Kein Vergleich",
};

// =============================================================================
// Helpers
// =============================================================================

function getStoredPeriod(chartId: string, defaultPeriod: Period): Period {
  if (typeof window === "undefined") return defaultPeriod;
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${chartId}`);
  if (stored === "day" || stored === "week" || stored === "month" || stored === "year") return stored;
  return defaultPeriod;
}

function getStoredCompare(chartId: string, defaultCompare: CompareOption): CompareOption {
  if (typeof window === "undefined") return defaultCompare;
  const stored = localStorage.getItem(`${COMPARE_PREFIX}${chartId}`);
  if (stored === "previousPeriod" || stored === "previousYear" || stored === "none") return stored;
  return defaultCompare;
}

// =============================================================================
// Component
// =============================================================================

export function ChartTimeControls({
  chartId,
  periods = ["month", "year"],
  defaultPeriod = "month",
  onPeriodChange,
  comparison,
  className,
}: ChartTimeControlsProps) {
  const [period, setPeriod] = useState<Period>(() => getStoredPeriod(chartId, defaultPeriod));
  const [compareType, setCompareType] = useState<CompareOption>(() =>
    getStoredCompare(chartId, comparison?.defaultCompare ?? "none")
  );

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    localStorage.setItem(`${STORAGE_PREFIX}${chartId}`, p);
    onPeriodChange?.(p);
  };

  const handleCompareChange = (c: CompareOption) => {
    setCompareType(c);
    localStorage.setItem(`${COMPARE_PREFIX}${chartId}`, c);
    comparison?.onCompare?.(c);
  };

  const compareOptions = comparison?.options ?? ["previousPeriod", "previousYear"];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Period selector — segmented control */}
      <div className="flex items-center gap-0.5 rounded-lg border bg-background/80 backdrop-blur-sm p-0.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5" />
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Comparison toggle */}
      {comparison?.enabled && (
        <div className="flex items-center gap-0.5 rounded-lg border bg-background/80 backdrop-blur-sm p-0.5">
          <GitCompare className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5" />
          <button
            onClick={() => handleCompareChange(compareType === "none" ? compareOptions[0] : "none")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              compareType !== "none"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {compareType !== "none" ? COMPARE_LABELS[compareType] : "Vergleich"}
          </button>
          {compareType !== "none" && compareOptions.length > 1 && (
            <select
              value={compareType}
              onChange={(e) => handleCompareChange(e.target.value as CompareOption)}
              className="rounded-md bg-transparent px-1 py-1 text-xs font-medium text-muted-foreground border-0 outline-none cursor-pointer"
            >
              {compareOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {COMPARE_LABELS[opt]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export type { Period, CompareOption, ChartTimeControlsProps };
