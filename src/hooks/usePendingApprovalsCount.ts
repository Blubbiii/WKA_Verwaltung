"use client";

/**
 * Sprint 3 Permissions v2: Hook für die Anzahl offener Approvals.
 *
 * Pollt alle 60 Sekunden — leichtgewichtig, da der Endpoint nur
 * count + Liste returnt. Bei längerer Inaktivität (Browser-Tab nicht
 * sichtbar) wird Polling pausiert.
 */

import { useEffect, useState } from "react";
import { HTTP_STATUS } from "@/lib/config/http-status";

const POLL_INTERVAL_MS = 60_000;

export function usePendingApprovalsCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    async function load() {
      try {
        const res = await fetch("/api/approvals/pending", { cache: "no-store" });
        // M-1 Fix: Bei 401 (nicht eingeloggt) oder 403 (keine Berechtigung) → Polling stoppen,
        // sonst Endlos-Request-Loop in der Browser-Konsole.
        if (res.status === HTTP_STATUS.UNAUTHORIZED || res.status === HTTP_STATUS.FORBIDDEN) {
          cancelled = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          // Optional: window.location.assign("/login") — bewusst auskommentiert (zu invasiv).
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setCount(json.total ?? 0);
      } catch {
        // Silent — keine UI-Fehler für Badge
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

    // Initial-Load + Polling
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

  return count;
}
