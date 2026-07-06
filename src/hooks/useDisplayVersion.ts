"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * User-facing app version.
 *
 * Source of truth is the SystemConfig row `app.displayVersion` maintained
 * via /admin/version. Falls back to package.json version returned by
 * /api/version when no override is set. Env-var NEXT_PUBLIC_APP_VERSION
 * is the last-ditch fallback for the moment before the fetch resolves.
 *
 * Cached for 5 minutes via react-query — server-side Cache-Control is 60s
 * so admin edits propagate within a minute.
 */
export function useDisplayVersion(): string {
  const buildFallback = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

  const { data } = useQuery({
    queryKey: ["/api/version"],
    queryFn: async () => {
      const res = await fetch("/api/version");
      if (!res.ok) return { displayVersion: buildFallback };
      return (await res.json()) as { displayVersion: string; version: string };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: { displayVersion: buildFallback, version: buildFallback },
  });

  return data?.displayVersion || buildFallback;
}
