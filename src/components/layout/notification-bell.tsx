"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  TYPE_ICON,
  TYPE_COLOR,
  formatRelativeTime,
  type NotificationItem,
} from "@/lib/notifications/notification-ui";

// ---------------------------------------------------------------------------
// Polling interval (ms)
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Fetch unread count (lightweight, for badge)
  // -----------------------------------------------------------------------
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // Silently ignore - badge is not critical
    }
  }, []);

  // -----------------------------------------------------------------------
  // Fetch notifications list (when popover opens)
  // -----------------------------------------------------------------------
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        // Also update unread count from the full list
        const unread = (data.notifications ?? []).filter(
          (n: NotificationItem) => !n.isRead
        ).length;
        // Use the server count if available, else count from list
        fetchUnreadCount();
        // But for immediate feedback, set from list
        if (unread !== undefined) {
          setUnreadCount((prev) => (prev === 0 ? unread : prev));
        }
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, [fetchUnreadCount]);

  // -----------------------------------------------------------------------
  // Mark single notification as read
  // -----------------------------------------------------------------------
  const markAsRead = useCallback(
    async (notification: NotificationItem) => {
      if (!notification.isRead) {
        // Optimistic update
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        try {
          await fetch(`/api/notifications/${notification.id}`, {
            method: "PATCH",
          });
        } catch {
          // Revert optimistic update on error
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notification.id ? { ...n, isRead: false } : n
            )
          );
          setUnreadCount((prev) => prev + 1);
        }
      }

      // Navigate if link is present
      if (notification.link) {
        setOpen(false);
        router.push(notification.link);
      }
    },
    [router]
  );

  // -----------------------------------------------------------------------
  // Mark all as read
  // -----------------------------------------------------------------------
  const markAllAsRead = useCallback(async () => {
    setMarkingAll(true);
    // Optimistic update
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on error
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
    } finally {
      setMarkingAll(false);
    }
  }, [notifications, unreadCount]);

  // -----------------------------------------------------------------------
  // Poll for unread count
  // -----------------------------------------------------------------------
  useEffect(() => {
    // Initial fetch
    fetchUnreadCount();

    intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUnreadCount]);

  // -----------------------------------------------------------------------
  // Fetch full list when popover opens
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const hasUnread = unreadCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Benachrichtigungen${hasUnread ? ` (${unreadCount} ungelesen)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96 p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Benachrichtigungen</h3>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 h-3 w-3" />
              )}
              Alle als gelesen markieren
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">Keine Benachrichtigungen</p>
            </div>
          ) : (
            <ul className="divide-y" role="list">
              {notifications.map((notification) => {
                const Icon = TYPE_ICON[notification.type] ?? Info;
                const iconColor = TYPE_COLOR[notification.type] ?? "text-muted-foreground";

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        !notification.isRead && "bg-primary/5"
                      )}
                      onClick={() => markAsRead(notification)}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
                          iconColor
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
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
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
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

        {/* Footer - only show if there are notifications */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary hover:text-primary"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
            >
              Alle Benachrichtigungen anzeigen
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
