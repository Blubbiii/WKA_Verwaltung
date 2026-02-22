"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface ActivityItem {
  id: string;
  action: string;
  detail: string;
  time: string;
}

interface ActivitiesWidgetProps {
  className?: string;
}

// =============================================================================
// ACTIVITIES WIDGET
// =============================================================================

export function ActivitiesWidget({ className }: ActivitiesWidgetProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/activities");

      if (response.ok) {
        const data = await response.json();
        setActivities(data);
      } else {
        // Use mock data if API is not available
        setActivities([
          {
            id: "1",
            action: "Neue Abstimmung erstellt",
            detail: "Jahresabschluss 2025 - Gesellschaft Alpha",
            time: "vor 2 Stunden",
          },
          {
            id: "2",
            action: "Dokument hochgeladen",
            detail: "Monatsbericht Januar 2026",
            time: "vor 5 Stunden",
          },
          {
            id: "3",
            action: "Gutschrift erstellt",
            detail: "Ausschuettung Q4/2025 - 15 Gesellschafter",
            time: "gestern",
          },
          {
            id: "4",
            action: "Vertrag aktualisiert",
            detail: "Wartungsvertrag Enercon - Verlaengert bis 2028",
            time: "vor 2 Tagen",
          },
        ]);
      }
    } catch {
      // Use mock data on error
      setActivities([
        {
          id: "1",
          action: "Neue Abstimmung erstellt",
          detail: "Jahresabschluss 2025 - Gesellschaft Alpha",
          time: "vor 2 Stunden",
        },
        {
          id: "2",
          action: "Dokument hochgeladen",
          detail: "Monatsbericht Januar 2026",
          time: "vor 5 Stunden",
        },
        {
          id: "3",
          action: "Gutschrift erstellt",
          detail: "Ausschuettung Q4/2025 - 15 Gesellschafter",
          time: "gestern",
        },
        {
          id: "4",
          action: "Vertrag aktualisiert",
          detail: "Wartungsvertrag Enercon - Verlaengert bis 2028",
          time: "vor 2 Tagen",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse flex items-start gap-3">
            <div className="h-2 w-2 mt-2 rounded-full bg-muted" />
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-1/2 mb-1" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
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

  if (activities.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Keine Aktivitaeten</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-3 border-b pb-4 last:border-0 last:pb-0"
        >
          <div className="h-2 w-2 mt-2 rounded-full bg-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{activity.action}</p>
            <p className="text-xs text-muted-foreground truncate">
              {activity.detail}
            </p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {activity.time}
          </span>
        </div>
      ))}
    </div>
  );
}
