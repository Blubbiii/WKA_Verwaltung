"use client";

/**
 * System-Health-Polling für den Header-Indicator.
 *
 * Datenquelle: public /api/health (liefert `{status: "ok"|"degraded"}`).
 * Polling alle 60 s, pausiert bei document.hidden, stoppt bei 401/403.
 *
 * Pattern angelehnt an useSidebarCounts.
 */

import { useEffect, useState } from "react";
import { HTTP_STATUS } from "@/lib/config/http-status";

export type SystemHealthStatus = "ok" | "degraded" | "down";

export interface SystemHealth {
  status: SystemHealthStatus;
  checkedAt: string | null;
}

const POLL_INTERVAL_MS = 60_000;
const EMPTY: SystemHealth = { status: "ok", checkedAt: null };

export function useSystemHealth(): SystemHealth {
  const [health, setHealth] = useState<SystemHealth>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    async function load() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.status === HTTP_STATUS.UNAUTHORIZED || res.status === HTTP_STATUS.FORBIDDEN) {
          cancelled = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          return;
        }
        // /api/health gibt 200 für "ok", 503 für "degraded". Wir lesen den Body
        // weil dort `{status}` strukturiert drinsteht (robuster als res.status).
        const body = await res.json().catch(() => ({ status: "down" }));
        const raw = String(body?.status ?? "down").toLowerCase();
        const status: SystemHealthStatus =
          raw === "ok" ? "ok" : raw === "degraded" ? "degraded" : "down";
        if (cancelled) return;
        setHealth({ status, checkedAt: new Date().toISOString() });
      } catch {
        // Netzwerk-Fehler → wir nehmen "down" an. Kein Toast (Background-Polling)
        if (!cancelled) {
          setHealth({ status: "down", checkedAt: new Date().toISOString() });
        }
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

  return health;
}
