"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarClock, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import {
  DeadlineCalendar,
  type DeadlineEvent,
} from "@/components/shared/deadline-calendar";

export default function FristenPage() {
  const [events, setEvents] = useState<DeadlineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeadlines() {
      try {
        const res = await fetch("/api/deadlines");
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data: DeadlineEvent[] = await res.json();
        setEvents(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unbekannter Fehler"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchDeadlines();
  }, []);

  const overdueCount = events.filter((e) => e.urgency === "overdue").length;
  const urgentCount = events.filter((e) => e.urgency === "urgent").length;
  const soonCount = events.filter((e) => e.urgency === "soon").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vertragsfristen"
        description="Übersicht aller anstehenden Vertrags- und Pachtfristen"
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-destructive">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <StatsCards
            columns={4}
            stats={[
              {
                label: "Gesamt",
                value: events.length,
                icon: CalendarClock,
                subtitle: "Fristen im Zeitraum",
              },
              {
                label: "Überfällig",
                value: overdueCount,
                icon: AlertTriangle,
                iconClassName: "text-red-500",
                valueClassName: overdueCount > 0 ? "text-red-600" : undefined,
                subtitle: "Sofort handeln",
                cardClassName:
                  overdueCount > 0
                    ? "border-l-red-500"
                    : undefined,
              },
              {
                label: "Dringend",
                value: urgentCount,
                icon: Clock,
                iconClassName: "text-orange-500",
                valueClassName:
                  urgentCount > 0 ? "text-orange-600" : undefined,
                subtitle: "Innerhalb 30 Tage",
                cardClassName:
                  urgentCount > 0
                    ? "border-l-orange-500"
                    : undefined,
              },
              {
                label: "Bald fällig",
                value: soonCount,
                icon: CheckCircle2,
                iconClassName: "text-yellow-500",
                subtitle: "Innerhalb 90 Tage",
              },
            ]}
          />

          <DeadlineCalendar events={events} />
        </>
      )}
    </div>
  );
}
