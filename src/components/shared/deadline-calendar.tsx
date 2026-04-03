"use client";

import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { de } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface DeadlineEvent {
  id: string;
  entityType: "contract" | "lease";
  entityId: string;
  title: string;
  eventType: "end" | "notice" | "renewal";
  date: string;
  daysRemaining: number;
  urgency: "overdue" | "urgent" | "soon" | "ok";
  href: string;
}

const urgencyColors: Record<DeadlineEvent["urgency"], string> = {
  overdue: "bg-red-500",
  urgent: "bg-orange-500",
  soon: "bg-yellow-500",
  ok: "bg-green-500",
};

const urgencyBadgeVariants: Record<DeadlineEvent["urgency"], string> = {
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  urgent:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  soon: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const urgencyLabels: Record<DeadlineEvent["urgency"], string> = {
  overdue: "Überfällig",
  urgent: "Dringend",
  soon: "Bald",
  ok: "OK",
};

const eventTypeLabels: Record<DeadlineEvent["eventType"], string> = {
  end: "Vertragsende",
  notice: "Kündigungsfrist",
  renewal: "Verlängerung",
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface DeadlineCalendarProps {
  events: DeadlineEvent[];
}

export function DeadlineCalendar({ events }: DeadlineCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DeadlineEvent[]>();
    for (const event of events) {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-lg">
            {format(currentMonth, "MMMM yyyy", { locale: de })}
          </CardTitle>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Weekday header */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(dateKey) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <DayCell
                key={dateKey}
                day={day}
                events={dayEvents}
                inMonth={inMonth}
                today={today}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
          {(
            ["overdue", "urgent", "soon", "ok"] as DeadlineEvent["urgency"][]
          ).map((urgency) => (
            <div key={urgency} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${urgencyColors[urgency]}`}
              />
              {urgencyLabels[urgency]}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DayCell({
  day,
  events,
  inMonth,
  today,
}: {
  day: Date;
  events: DeadlineEvent[];
  inMonth: boolean;
  today: boolean;
}) {
  if (events.length === 0) {
    return (
      <div
        className={`min-h-[4rem] border border-border/40 p-1 ${
          !inMonth ? "bg-muted/30" : ""
        }`}
      >
        <span
          className={`text-xs ${
            today
              ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center font-bold"
              : !inMonth
                ? "text-muted-foreground/50"
                : "text-foreground"
          }`}
        >
          {format(day, "d")}
        </span>
      </div>
    );
  }

  // Determine the highest urgency for the dot color
  const maxUrgency = events.reduce<DeadlineEvent["urgency"]>((acc, e) => {
    const order: DeadlineEvent["urgency"][] = [
      "overdue",
      "urgent",
      "soon",
      "ok",
    ];
    return order.indexOf(e.urgency) < order.indexOf(acc) ? e.urgency : acc;
  }, "ok");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`min-h-[4rem] border border-border/40 p-1 text-left w-full hover:bg-accent/50 transition-colors cursor-pointer ${
            !inMonth ? "bg-muted/30" : ""
          }`}
        >
          <div className="flex items-start justify-between">
            <span
              className={`text-xs ${
                today
                  ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center font-bold"
                  : !inMonth
                    ? "text-muted-foreground/50"
                    : "text-foreground"
              }`}
            >
              {format(day, "d")}
            </span>
            <div className="flex gap-0.5 mt-0.5">
              {events.length <= 3 ? (
                events.map((e) => (
                  <span
                    key={e.id}
                    className={`inline-block h-2 w-2 rounded-full ${urgencyColors[e.urgency]}`}
                  />
                ))
              ) : (
                <>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${urgencyColors[maxUrgency]}`}
                  />
                  <span className="text-[10px] leading-none text-muted-foreground">
                    +{events.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-1 mb-2">
          <p className="font-semibold text-sm">
            {format(day, "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
          <p className="text-xs text-muted-foreground">
            {events.length} {events.length === 1 ? "Frist" : "Fristen"}
          </p>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 rounded-md border p-2 text-sm"
            >
              <span
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${urgencyColors[event.urgency]}`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{event.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${urgencyBadgeVariants[event.urgency]}`}
                  >
                    {urgencyLabels[event.urgency]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {eventTypeLabels[event.eventType]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {event.daysRemaining < 0
                    ? `${Math.abs(event.daysRemaining)} Tage überfällig`
                    : event.daysRemaining === 0
                      ? "Heute"
                      : `Noch ${event.daysRemaining} Tage`}
                </p>
              </div>
              <Link href={event.href}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
