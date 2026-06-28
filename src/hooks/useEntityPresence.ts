"use client";

/**
 * Idee D — useEntityPresence-Hook.
 *
 * Heartbeat alle 30s (POST /api/presence) + Poll alle 30s (GET) für eine
 * Entity. Auf Unmount: DELETE (best-effort via keepalive).
 *
 * Stoppt bei 401/403 — kein Endlos-Loop bei abgelaufener Session.
 */

import { useEffect, useState } from "react";
import { HTTP_STATUS } from "@/lib/config/http-status";

export interface PresenceUser {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  lastSeenAt: string;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;

export function useEntityPresence(
  entityType: string,
  entityId: string,
): PresenceUser[] {
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!entityType || !entityId) return;
    let cancelled = false;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let pollTimer: NodeJS.Timeout | null = null;

    const stop = () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
    };

    const heartbeat = async () => {
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId }),
        });
        if (
          res.status === HTTP_STATUS.UNAUTHORIZED ||
          res.status === HTTP_STATUS.FORBIDDEN
        ) {
          stop();
        }
      } catch {
        // best-effort; nächster Tick versucht es erneut
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/presence?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
          { cache: "no-store" },
        );
        if (
          res.status === HTTP_STATUS.UNAUTHORIZED ||
          res.status === HTTP_STATUS.FORBIDDEN
        ) {
          stop();
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { others: PresenceUser[] };
        if (!cancelled) setOthers(json.others ?? []);
      } catch {
        // silent
      }
    };

    // initial
    heartbeat();
    poll();

    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      stop();
      // explicit-leave (fire-and-forget, keepalive für sicheren Send beim Unmount)
      try {
        fetch(
          `/api/presence?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
          { method: "DELETE", keepalive: true },
        ).catch(() => {});
      } catch {
        // ignore — Browser bricht ggf. ohnehin schon ab
      }
    };
  }, [entityType, entityId]);

  return others;
}
