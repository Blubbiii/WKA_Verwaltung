"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, Info, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
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

// =============================================================================
// Notification list page — full view with filters and pagination
// =============================================================================

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationType | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  const limit = 20;

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

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Benachrichtigungen"
          description={
            unreadCount > 0
              ? `${unreadCount} ungelesene Benachrichtigung${unreadCount !== 1 ? "en" : ""}`
              : "Alle Benachrichtigungen gelesen"
          }
        />
        {unreadCount > 0 && (
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
                    {/* Icon */}
                    <div
                      className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted",
                        iconColor
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Content */}
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
    </div>
  );
}
