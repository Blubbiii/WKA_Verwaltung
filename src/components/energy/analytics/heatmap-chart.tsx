"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeatmapData } from "@/types/analytics";
import { MONTH_LABELS } from "@/types/analytics";

type ColorScale = "green" | "blue" | "red";

interface HeatmapChartProps {
  data: HeatmapData[];
  title?: string;
  colorScale?: ColorScale;
  valueFormatter?: (value: number) => string;
  isLoading?: boolean;
  /** Callback when a heatmap cell is clicked */
  onCellClick?: (turbineId: string, turbineDesignation: string, month: number) => void;
}

const COLOR_SCALES: Record<
  ColorScale,
  { h: number; s: number; lMin: number; lMax: number }
> = {
  green: { h: 142, s: 71, lMin: 35, lMax: 92 }, // dark green -> light green
  blue: { h: 217, s: 91, lMin: 35, lMax: 92 },
  red: { h: 0, s: 84, lMin: 35, lMax: 92 },
};

function getCellColor(normalized: number, scale: ColorScale): string {
  if (normalized <= 0) return "hsl(var(--muted))";
  const { h, s, lMin, lMax } = COLOR_SCALES[scale];
  // Higher value = darker color (lower lightness)
  const l = lMax - normalized * (lMax - lMin);
  return `hsl(${h}, ${s}%, ${Math.round(l)}%)`;
}

function defaultFormatter(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function HeatmapChart({
  data,
  title,
  colorScale = "green",
  valueFormatter = defaultFormatter,
  isLoading = false,
  onCellClick,
}: HeatmapChartProps) {
  // Determine which months have data
  const months = useMemo(() => {
    const monthSet = new Set<number>();
    for (const row of data) {
      for (const cell of row.months) {
        monthSet.add(cell.month);
      }
    }
    const sorted = Array.from(monthSet).sort((a, b) => a - b);
    return sorted.length > 0
      ? sorted
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Keine Daten verfügbar
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="overflow-x-auto">
        <TooltipProvider delayDuration={100}>
          <div className="min-w-[600px]">
            {/* Header row: month labels */}
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `140px repeat(${months.length}, 1fr)`,
              }}
            >
              <div className="text-xs text-muted-foreground font-medium py-1">
                Anlage
              </div>
              {months.map((m) => (
                <div
                  key={m}
                  className="text-xs text-muted-foreground font-medium text-center py-1"
                >
                  {MONTH_LABELS[m - 1]}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {data.map((row) => {
              const cellMap = new Map(
                row.months.map((c) => [c.month, c])
              );
              return (
                <div
                  key={row.turbineId}
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `140px repeat(${months.length}, 1fr)`,
                  }}
                >
                  <div className="text-xs font-medium truncate py-1 flex items-center">
                    {row.designation}
                  </div>
                  {months.map((m) => {
                    const cell = cellMap.get(m);
                    const hasData = cell != null && cell.value > 0;
                    return (
                      <Tooltip key={m}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-8 rounded-sm transition-opacity hover:opacity-80 ${
                              onCellClick && hasData
                                ? "cursor-pointer ring-offset-background hover:ring-2 hover:ring-ring hover:ring-offset-1"
                                : "cursor-default"
                            }`}
                            style={{
                              backgroundColor: hasData
                                ? getCellColor(cell!.normalized, colorScale)
                                : "hsl(var(--muted) / 0.3)",
                            }}
                            onClick={() => {
                              if (onCellClick && hasData) {
                                onCellClick(row.turbineId, row.designation, m);
                              }
                            }}
                            role={onCellClick && hasData ? "button" : undefined}
                            tabIndex={onCellClick && hasData ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (onCellClick && hasData && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                onCellClick(row.turbineId, row.designation, m);
                              }
                            }}
                            aria-label={
                              onCellClick && hasData
                                ? `${row.designation} - ${MONTH_LABELS[m - 1]}: ${valueFormatter(cell!.value)}. Klicken für Details.`
                                : undefined
                            }
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">
                            {row.designation} - {MONTH_LABELS[m - 1]}
                          </p>
                          <p className="text-sm">
                            {hasData
                              ? valueFormatter(cell!.value)
                              : "Keine Daten"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Color legend */}
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-xs text-muted-foreground">Niedrig</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((n) => (
              <div
                key={n}
                className="w-6 h-3 rounded-sm"
                style={{ backgroundColor: getCellColor(n, colorScale) }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Hoch</span>
        </div>
      </CardContent>
    </Card>
  );
}
