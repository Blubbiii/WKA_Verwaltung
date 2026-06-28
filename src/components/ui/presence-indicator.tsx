"use client";

/**
 * Idee D — PresenceIndicator.
 *
 * Kleiner Banner oben in Detail-Pages der zeigt wenn andere User die selbe
 * Entity gerade ansehen ("Lisa M. sieht sich das gerade auch an").
 *
 * Rendert NICHTS wenn keine anderen User aktiv sind — kein leerer Slot.
 */

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import type { PresenceUser } from "@/hooks/useEntityPresence";
import { cn } from "@/lib/utils";

interface PresenceIndicatorProps {
  others: PresenceUser[];
  className?: string;
}

function displayName(u: PresenceUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

export function PresenceIndicator({ others, className }: PresenceIndicatorProps) {
  const t = useTranslations("presence");
  if (others.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning",
        className,
      )}
    >
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {others.length === 1
          ? t("oneOther", { name: displayName(others[0]) })
          : t("multipleOthers", { count: others.length })}
      </span>
    </div>
  );
}
