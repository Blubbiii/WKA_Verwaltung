"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Bell, CheckCheck, Loader2, Info, Filter, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { cn } from "@/lib/utils";
import {
  TYPE_ICON,
  TYPE_COLOR,
  TYPE_LABEL,
  ALL_NOTIFICATION_TYPES,
  formatRelativeTime,
  type NotificationType,
  type NotificationItem,
} from "@/lib/notifications/notification-ui";

// Lazy-load deadline calendar to avoid loading it when not needed
const DeadlineCalendar = dynamic(
  () => import("@/components/shared/deadline-calendar").then((mod) => mod.DeadlineCalendar),
  { ssr: false }
);

interface DeadlineEvent {
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

// =============================================================================
// Notification list page — Benachrichtigungen + Fristen-Kalender
// =============================================================================

function NotificationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "notifications";

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationType | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  // Deadline state
  const [deadlines, setDeadlines] = useState<DeadlineEvent[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);

  const limit = 20;

  const setTab = (value: string) => {
    router.replace(`/notifications?tab=${value}`, { scroll: false });
  };

  // ---------------------------------------------------------------------------
  // Fetch notifications
  // ---------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // Silently ignore
    }
  }, []);

  const fetchDeadlines = useCallback(async () => {
    setDeadlinesLoading(true);
    try {
      const res = await fetch("/api/deadlines");
      if (res.ok) {
        const data = await res.json();
        setDeadlines(data.deadlines ?? []);
      }
    } catch {
      // Silently ignore
    } finally {
      setDeadlinesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  // Fetch deadlines when tab switches to fristen
  useEffect(() => {
    if (tab === "fristen" && deadlines.length === 0 && !deadlinesLoading) {
      fetchDeadlines();
    }
  }, [tab, deadlines.length, deadlinesLoading, fetchDeadlines]);

  // ---------------------------------------------------------------------------
  // Mark as read
  // ---------------------------------------------------------------------------

  const markAsRead = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" });
      } catch {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: false } : n))
        );
        setUnreadCount((prev) => prev + 1);
      }
    }

    if (notification.link) {
      router.push(notification.link);
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    const prev = [...notifications];
    const prevCount = unreadCount;
    setNotifications((n) => n.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setNotifications(prev);
      setUnreadCount(prevCount);
    } finally {
      setMarkingAll(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered =
    activeFilter === "ALL"
      ? notifications
      : notifications.filter((n) => n.type === activeFilter);

  // Deadline stats
  const overdueCount = deadlines.filter((d) => d.urgency === "overdue").length;
  const urgentCount = deadlines.filter((d) => d.urgency === "urgent").length;
  const soonCount = deadlines.filter((d) => d.urgency === "soon").length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benachrichtigungen & Fristen"
        description="Alle Benachrichtigungen und anstehende Vertragsfristen"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Benachrichtigungen
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="fristen" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Fristen
              {(overdueCount + urgentCount) > 0 && (
                <Badge variant="outline" className="ml-1 h-5 min-w-5 px-1.5 text-[10px] text-orange-500 border-orange-300">
                  {overdueCount + urgentCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {tab === "notifications" && unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Alle als gelesen markieren
            </Button>
          )}
        </div>

        {/* ---- Notifications Tab ---- */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Button
              variant={activeFilter === "ALL" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setActiveFilter("ALL")}
            >
              Alle
            </Button>
            {ALL_NOTIFICATION_TYPES.map((type) => {
              const Icon = TYPE_ICON[type];
              return (
                <Button
                  key={type}
                  variant={activeFilter === type ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setActiveFilter(type)}
                >
                  <Icon className="mr-1 h-3 w-3" />
                  {TYPE_LABEL[type]}
                </Button>
              );
            })}
          </div>

          {/* Notification list */}
          <div className="rounded-lg border bg-card">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Bell className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm font-medium">Keine Benachrichtigungen</p>
                <p className="text-xs mt-1">
                  {activeFilter !== "ALL"
                    ? "Keine Benachrichtigungen in dieser Kategorie"
                    : "Sie haben noch keine Benachrichtigungen erhalten"}
                </p>
              </div>
            ) : (
              <ul className="divide-y" role="list">
                {filtered.map((notification) => {
                  const Icon = TYPE_ICON[notification.type] ?? Info;
                  const iconColor = TYPE_COLOR[notification.type] ?? "text-muted-foreground";

                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/50",
                          !notification.isRead && "bg-primary/5"
                        )}
                        onClick={() => markAsRead(notification)}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted",
                            iconColor
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <p
                                className={cn(
                                  "text-sm leading-tight",
                                  !notification.isRead
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground/80"
                                )}
                              >
                                {notification.title}
                              </p>
                              {!notification.isRead && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {TYPE_LABEL[notification.type]}
                            </Badge>
                          </div>
                          {notification.message && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="mt-1.5 text-xs text-muted-foreground/70">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Zurück
              </Button>
              <span className="text-sm text-muted-foreground">
                Seite {page} von {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Weiter
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ---- Fristen Tab ---- */}
        <TabsContent value="fristen" className="space-y-4">
          {deadlinesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {deadlines.length > 0 && (
                <StatsCards
                  stats={[
                    {
                      label: "Gesamt",
                      value: deadlines.length,
                      icon: CalendarClock,
                    },
                    {
                      label: "Überfällig",
                      value: overdueCount,
                      icon: CalendarClock,
                      subtitle: overdueCount > 0 ? "Sofort handeln" : undefined,
                    },
                    {
                      label: "Dringend (< 30 Tage)",
                      value: urgentCount,
                      icon: CalendarClock,
                      subtitle: urgentCount > 0 ? "Bald fällig" : undefined,
                    },
                    {
                      label: "Bald (30–90 Tage)",
                      value: soonCount,
                      icon: CalendarClock,
                    },
                  ]}
                />
              )}

              <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <DeadlineCalendar events={deadlines} />
              </Suspense>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <NotificationsPageInner />
    </Suspense>
  );
}
