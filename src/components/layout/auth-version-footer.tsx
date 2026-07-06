"use client";

import { useDisplayVersion } from "@/hooks/useDisplayVersion";

/**
 * Small version footer used on the unauthenticated auth pages
 * (login, reset-password, forgot-password). Reads displayVersion via the
 * public /api/version endpoint so admin overrides propagate everywhere.
 */
export function AuthVersionFooter() {
  const v = useDisplayVersion();
  return (
    <div className="fixed bottom-4 text-center text-sm text-muted-foreground">
      WindparkManager v{v}
    </div>
  );
}
