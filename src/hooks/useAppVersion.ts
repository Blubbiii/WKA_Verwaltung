"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/**
 * Client-Side Version Check
 *
 * Polls /api/version every 5 minutes to detect when a new server build
 * has been deployed. The very first response captures the current "boot"
 * version in a ref (no re-render). Any later response with a different
 * commit/buildTime triggers a one-time persistent toast prompting the
 * user to reload.
 *
 * - Polling pauses while the tab is hidden (visibilitychange listener).
 * - Fetch errors are swallowed silently — a container restart is exactly
 *   the situation this hook is designed to survive.
 * - The toast fires at most once per session (hasNotified ref guard).
 */

interface VersionInfo {
  commit: string;
  buildTime: string;
  version: string;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function sameVersion(a: VersionInfo, b: VersionInfo): boolean {
  return (
    a.commit === b.commit &&
    a.buildTime === b.buildTime &&
    a.version === b.version
  );
}

async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const res = await fetch("/api/version", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VersionInfo;
    return data;
  } catch {
    return null;
  }
}

export function useAppVersion(): void {
  const bootVersion = useRef<VersionInfo | null>(null);
  const hasNotified = useRef(false);
  const t = useTranslations("versionCheck");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (cancelled || hasNotified.current) return;
      if (typeof document !== "undefined" && document.hidden) return;

      const current = await fetchVersion();
      if (!current || cancelled) return;

      if (!bootVersion.current) {
        // First response: remember what we booted against.
        bootVersion.current = current;
        return;
      }

      if (!sameVersion(bootVersion.current, current)) {
        hasNotified.current = true;
        toast.info(t("newVersionTitle"), {
          description: t("newVersionDescription"),
          duration: Infinity,
          action: {
            label: t("reload"),
            onClick: () => window.location.reload(),
          },
        });
      }
    }

    // Kick off immediately so bootVersion is captured on mount.
    void check();

    const interval = window.setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [t]);
}
