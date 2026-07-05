"use client";

import { useAppVersion } from "@/hooks/useAppVersion";

/**
 * Client-only wrapper that runs the version-check hook.
 *
 * Mounted once at the top of the dashboard layout so a single poller
 * is active for every authenticated route. Renders nothing.
 */
export function AppVersionMonitor(): null {
  useAppVersion();
  return null;
}
