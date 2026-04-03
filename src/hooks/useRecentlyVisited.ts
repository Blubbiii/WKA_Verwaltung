"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "wpm:recent-visits";
const MAX_ITEMS = 10;

export interface RecentVisit {
  type: "park" | "fund" | "invoice" | "lease" | "contract";
  id: string;
  name: string;
  href: string;
  visitedAt: string;
}

/**
 * Track and retrieve recently visited entities via localStorage.
 *
 * Usage:
 * ```tsx
 * const { visits, trackVisit } = useRecentlyVisited();
 *
 * // In detail page useEffect:
 * trackVisit({ type: "park", id: park.id, name: park.name, href: `/parks/${park.id}` });
 * ```
 */
export function useRecentlyVisited() {
  const [visits, setVisits] = useState<RecentVisit[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const trackVisit = useCallback(
    (visit: Omit<RecentVisit, "visitedAt">) => {
      setVisits((prev) => {
        // Remove duplicate (same type+id)
        const filtered = prev.filter(
          (v) => !(v.type === visit.type && v.id === visit.id)
        );
        const updated = [
          { ...visit, visitedAt: new Date().toISOString() },
          ...filtered,
        ].slice(0, MAX_ITEMS);

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // localStorage full — ignore
        }
        return updated;
      });
    },
    []
  );

  return { visits, trackVisit };
}
