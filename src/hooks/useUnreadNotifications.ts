"use client";

import { useQuery } from "@tanstack/react-query";

interface UnreadResult {
  count: number;
}

/**
 * Polls for unread notification count every 60 seconds.
 * Used by the header bell icon to show a badge.
 */
export function useUnreadNotifications() {
  const { data, isLoading } = useQuery<UnreadResult>({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds — more aggressive than default for real-time feel
    refetchInterval: 60 * 1000, // Poll every 60 seconds
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  return {
    unreadCount: data?.count ?? 0,
    isLoading,
  };
}
