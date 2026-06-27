"use client";

/**
 * HealthIndicator — kleiner Dot im Header, der den System-Status anzeigt.
 *
 * Idee B aus docs/audit-2026-06-26-full.md.
 *
 * Datenquelle: useSystemHealth → /api/health (public).
 * - grün  = ok       (alle Systeme normal)
 * - gelb  = degraded (Redis weg, Cache läuft auf In-Memory-Fallback)
 * - rot   = down     (DB hängt oder Netzwerk weg)
 *
 * Klick navigiert zu /admin/system/status (Admin-Permission nötig — sonst
 * Tooltip-Hinweis). Reduced-Motion-Respekt für den Pulse-Effect.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useSystemHealth, type SystemHealthStatus } from "@/hooks/useSystemHealth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DOT_COLORS: Record<SystemHealthStatus, string> = {
  ok: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

export function HealthIndicator() {
  const router = useRouter();
  const t = useTranslations("layout.healthIndicator");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const { status, checkedAt } = useSystemHealth();

  const statusLabel =
    status === "ok" ? t("ok") : status === "degraded" ? t("degraded") : t("down");

  const lastCheckedLabel = checkedAt
    ? t("lastChecked", {
        time: formatDistanceToNow(new Date(checkedAt), {
          addSuffix: true,
          locale: dateLocale,
        }),
      })
    : "";

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => router.push("/admin/system-admin")}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={statusLabel}
          >
            <span className="relative flex h-2.5 w-2.5">
              {status === "down" && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
                    DOT_COLORS[status],
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative inline-flex h-2.5 w-2.5 rounded-full",
                  DOT_COLORS[status],
                )}
              />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="font-medium">{statusLabel}</div>
          {checkedAt && (
            <div className="text-muted-foreground mt-0.5">{lastCheckedLabel}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
