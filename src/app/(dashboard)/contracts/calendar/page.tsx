"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertTriangle,
  Clock,
  Download,
  FileText,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ContractEvent {
  id: string;
  title: string;
  contractType: string;
  eventType: "end" | "notice";
  date: string;
  daysRemaining: number;
}

const typeConfig: Record<string, { label: string; color: string }> = {
  LEASE: { label: "Pacht", color: "bg-blue-500" },
  SERVICE: { label: "Service", color: "bg-purple-500" },
  INSURANCE: { label: "Versicherung", color: "bg-green-500" },
  GRID_CONNECTION: { label: "Netzanschluss", color: "bg-orange-500" },
  MARKETING: { label: "Vermarktung", color: "bg-pink-500" },
  OTHER: { label: "Sonstiges", color: "bg-gray-500" },
};

export default function ContractsCalendarPage() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    try {
      setLoading(true);
      // Fetch contracts expiring within the next 365 days
      const response = await fetch("/api/contracts?limit=200");
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      const contractEvents: ContractEvent[] = [];
      const now = new Date();

      data.data.forEach((contract: any) => {
        // Add end date events
        if (contract.endDate && contract.status !== "TERMINATED") {
          const endDate = new Date(contract.endDate);
          const daysRemaining = Math.ceil(
            (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysRemaining > -30 && daysRemaining <= 365) {
            contractEvents.push({
              id: contract.id,
              title: contract.title,
              contractType: contract.contractType,
              eventType: "end",
              date: contract.endDate,
              daysRemaining,
            });
          }
        }

        // Add notice deadline events
        if (contract.noticeDeadline && contract.status !== "TERMINATED") {
          const noticeDate = new Date(contract.noticeDeadline);
          const daysRemaining = Math.ceil(
            (noticeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysRemaining > -30 && daysRemaining <= 365) {
            contractEvents.push({
              id: contract.id,
              title: contract.title,
              contractType: contract.contractType,
              eventType: "notice",
              date: contract.noticeDeadline,
              daysRemaining,
            });
          }
        }
      });

      setEvents(contractEvents);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getEventsForDay(date: Date): ContractEvent[] {
    return events.filter((event) => isSameDay(new Date(event.date), date));
  }

  function getUpcomingEvents(): ContractEvent[] {
    return events
      .filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= 90)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const upcomingEvents = getUpcomingEvents();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/contracts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vertragskalender</h1>
            <p className="text-muted-foreground">
              Übersicht aller Vertragsfristen und Termine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/api/export/calendar?type=contracts";
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Kalender exportieren
          </Button>
          <Button variant="outline" asChild>
            <Link href="/contracts">
              <List className="mr-2 h-4 w-4" />
              Listenansicht
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>
              {format(currentMonth, "MMMM yyyy", { locale: de })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date())}
              >
                Heute
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-96" />
            ) : (
              <>
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
                    <div
                      key={day}
                      className="text-center text-sm font-medium text-muted-foreground py-2"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day) => {
                    const dayEvents = getEventsForDay(day);
                    const hasEndEvent = dayEvents.some((e) => e.eventType === "end");
                    const hasNoticeEvent = dayEvents.some(
                      (e) => e.eventType === "notice"
                    );
                    const isSelected =
                      selectedDate && isSameDay(day, selectedDate);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "relative h-20 p-1 text-left text-sm rounded-md border transition-colors",
                          !isSameMonth(day, currentMonth) &&
                            "text-muted-foreground bg-muted/30",
                          isSameMonth(day, currentMonth) && "bg-card hover:bg-muted",
                          isToday(day) && "border-primary",
                          isSelected && "ring-2 ring-primary",
                          dayEvents.length > 0 && "cursor-pointer"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full",
                            isToday(day) && "bg-primary text-primary-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {dayEvents.length > 0 && (
                          <div className="absolute bottom-1 left-1 right-1 flex gap-1">
                            {hasNoticeEvent && (
                              <div className="h-1.5 flex-1 rounded bg-orange-500" />
                            )}
                            {hasEndEvent && (
                              <div className="h-1.5 flex-1 rounded bg-red-500" />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-6 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded bg-orange-500" />
                    <span>Kündigungsfrist</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded bg-red-500" />
                    <span>Vertragsende</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Selected Day Events */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {format(selectedDate, "dd. MMMM yyyy", { locale: de })}
                </CardTitle>
                <CardDescription>
                  {selectedDayEvents.length === 0
                    ? "Keine Termine"
                    : `${selectedDayEvents.length} Termin(e)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDayEvents.map((event) => {
                  const typeConf = typeConfig[event.contractType];
                  return (
                    <div
                      key={`${event.id}-${event.eventType}`}
                      className="p-3 border rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => router.push(`/contracts/${event.id}`)}
                    >
                      <div className="flex items-start gap-2">
                        {event.eventType === "notice" ? (
                          <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                        ) : (
                          <Clock className="h-4 w-4 text-red-500 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{event.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {event.eventType === "notice"
                              ? "Kündigungsfrist"
                              : "Vertragsende"}
                          </p>
                          <Badge
                            variant="secondary"
                            className={cn("mt-1", typeConf?.color, "text-white")}
                          >
                            {typeConf?.label || event.contractType}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Anstehende Fristen
              </CardTitle>
              <CardDescription>Nächste 90 Tage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <>
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </>
              ) : upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine anstehenden Fristen
                </p>
              ) : (
                upcomingEvents.slice(0, 10).map((event) => {
                  const typeConf = typeConfig[event.contractType];
                  return (
                    <div
                      key={`${event.id}-${event.eventType}`}
                      className={cn(
                        "p-3 border rounded-lg hover:bg-muted cursor-pointer",
                        event.daysRemaining <= 7 && "border-red-500 bg-red-50",
                        event.daysRemaining > 7 &&
                          event.daysRemaining <= 30 &&
                          "border-orange-500 bg-orange-50"
                      )}
                      onClick={() => router.push(`/contracts/${event.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate text-sm">
                            {event.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.eventType === "notice"
                              ? "Kündigungsfrist"
                              : "Vertragsende"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              event.daysRemaining <= 7 && "text-red-600",
                              event.daysRemaining > 7 &&
                                event.daysRemaining <= 30 &&
                                "text-orange-600"
                            )}
                          >
                            {event.daysRemaining === 0
                              ? "Heute"
                              : event.daysRemaining === 1
                              ? "Morgen"
                              : `${event.daysRemaining} Tage`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(event.date), "dd.MM.", { locale: de })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {upcomingEvents.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  + {upcomingEvents.length - 10} weitere
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
