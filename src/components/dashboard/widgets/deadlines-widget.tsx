"use client";

import { useState, useEffect, useCallback } from "react";
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
        // Use mock data if API is not available
        setDeadlines([
          {
            id: "1",
            title: "Pachtvertrag Flurstueck 12/3",
            date: "24.02.2026",
            type: "Kuendigung",
            daysLeft: 30,
          },
          {
            id: "2",
            title: "Wartungsvertrag Vestas",
            date: "15.03.2026",
            type: "Verlaengerung",
            daysLeft: 49,
          },
          {
            id: "3",
            title: "Versicherung Windpark Nord",
            date: "01.04.2026",
            type: "Erneuerung",
            daysLeft: 66,
          },
        ]);
      }
    } catch {
      // Use mock data on error
      setDeadlines([
        {
          id: "1",
          title: "Pachtvertrag Flurstueck 12/3",
          date: "24.02.2026",
          type: "Kuendigung",
          daysLeft: 30,
        },
        {
          id: "2",
          title: "Wartungsvertrag Vestas",
          date: "15.03.2026",
          type: "Verlaengerung",
          daysLeft: 49,
        },
        {
          id: "3",
          title: "Versicherung Windpark Nord",
          date: "01.04.2026",
          type: "Erneuerung",
          daysLeft: 66,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
          <p className="text-sm">Keine anstehenden Fristen</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {deadlines.map((deadline) => (
        <div
          key={deadline.id}
          className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
        >
          <div>
            <p className="font-medium text-sm">{deadline.title}</p>
            <p className="text-xs text-muted-foreground">
              {deadline.type} am {deadline.date}
            </p>
          </div>
          <div
            className={cn(
              "text-xs font-medium px-2 py-1 rounded whitespace-nowrap",
              deadline.daysLeft <= 30
                ? "bg-destructive/10 text-destructive"
                : deadline.daysLeft <= 60
                  ? "bg-yellow-500/10 text-yellow-600"
                  : "bg-green-500/10 text-green-600"
            )}
          >
            {deadline.daysLeft} Tage
          </div>
        </div>
      ))}
    </div>
  );
}
