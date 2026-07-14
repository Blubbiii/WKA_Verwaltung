"use client";

import { useState, useCallback } from "react";
import { z } from "zod";

const STORAGE_KEY = "wpm:recent-visits";
const MAX_ITEMS = 10;

const RecentVisitSchema = z.object({
  type: z.enum(["park", "fund", "invoice", "lease", "contract"]),
  id: z.string(),
  name: z.string(),
  href: z.string(),
  visitedAt: z.string(),
});

const RecentVisitListSchema = z.array(RecentVisitSchema);

export type RecentVisit = z.infer<typeof RecentVisitSchema>;

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
      if (!stored) return [];
      // Alte Payloads (z.B. neue `type`-Werte nach einem App-Update) sollen
      // still verschwinden statt Runtime-Errors zu werfen.
      const parsed = RecentVisitListSchema.safeParse(JSON.parse(stored));
      return parsed.success ? parsed.data : [];
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
