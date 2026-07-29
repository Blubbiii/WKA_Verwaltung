"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface Deadline {
  id: string;
  title: string;
  date: string;
  type: string;
  daysLeft: number;
}

interface DeadlinesWidgetProps {
  className?: string;
}

// =============================================================================
// DEADLINES WIDGET
// =============================================================================

export function DeadlinesWidget({ className }: DeadlinesWidgetProps) {
  const t = useTranslations("dashboard.widgets");
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/deadlines");

      if (response.ok) {
        const data = await response.json();
        setDeadlines(data);
      } else {
        // Kein Mock-Fallback: erfundene Fristen sind vom Echtbestand nicht
        // unterscheidbar und der User verpasst genau die Frist, die fehlt.
        setDeadlines([]);
        setError(t("deadlinesNotAvailable"));
      }
    } catch {
      setDeadlines([]);
      setError(t("deadlinesNotAvailable"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDeadlines();
  }, [fetchDeadlines]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (deadlines.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{t("noDeadlines")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {deadlines.map((deadline) => (
        <div
          key={deadline.id}
          className="flex items-center justify-between gap-3 border-b pb-4 last:border-0 last:pb-0"
        >
          <div className="min-w-0 flex-1">
            {/* Title is always visible; on wider containers don't truncate */}
            <p className="font-medium text-sm @md:text-base truncate @md:whitespace-normal">{deadline.title}</p>
            <p className="text-xs @md:text-sm text-muted-foreground">
              {deadline.type} am {deadline.date}
            </p>
          </div>
          <div
            className={cn(
              "text-xs @md:text-sm font-medium px-2 py-1 rounded whitespace-nowrap shrink-0",
              deadline.daysLeft <= 30
                ? "bg-destructive/10 text-destructive"
                : deadline.daysLeft <= 60
                  ? "bg-yellow-500/10 text-yellow-600"
                  : "bg-green-500/10 text-green-600"
            )}
          >
            {t("daysLeft", { count: deadline.daysLeft })}
          </div>
        </div>
      ))}
    </div>
  );
}
