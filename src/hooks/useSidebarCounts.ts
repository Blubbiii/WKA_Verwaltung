"use client";

/**
 * Sidebar-Badge-Counts.
 *
 * Pollt /api/sidebar/counts alle 60 s und liefert die aktuellen Counts.
 * Pausiert wenn der Browser-Tab nicht sichtbar ist (visibility-API), um
 * unnötige DB-Last zu vermeiden. Bei 401/403 stoppt das Polling komplett
 * (kein Endlos-Loop bei abgelaufener Session).
 *
 * Pattern bewusst angelehnt an usePendingApprovalsCount, aber für N
 * Counts auf einmal — ein Endpoint statt N.
 */

import { useEffect, useState } from "react";
import {
  EMPTY_SIDEBAR_COUNTS,
  type SidebarCounts,
} from "@/lib/sidebar-counts";

const POLL_INTERVAL_MS = 60_000;

export function useSidebarCounts(): SidebarCounts {
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY_SIDEBAR_COUNTS);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    async function load() {
      try {
        const res = await fetch("/api/sidebar/counts", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          // Session weg oder fehlende Permission auf den Endpoint — stop polling.
          cancelled = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as Partial<SidebarCounts>;
        if (cancelled) return;
        setCounts({ ...EMPTY_SIDEBAR_COUNTS, ...json });
      } catch {
        // Silent — Badge-Counts dürfen nie eine sichtbare Fehlermeldung erzeugen.
      }
    }

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (typeof document === "undefined" || !document.hidden) {
          await load();
        }
        schedule();
      }, POLL_INTERVAL_MS);
    }

    load();
    schedule();

    function handleVisibility() {
      if (typeof document !== "undefined" && !document.hidden) {
        load();
      }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, []);

  return counts;
}
