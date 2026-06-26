"use client";

/**
 * Today's Focus Widget
 * ====================
 * Modulares Dashboard-Widget (opt-in) das die heute zu erledigenden Aktionen
 * aggregiert: Pending Approvals, überfällige Mahnungen, neue Eingangsrechnungen
 * im Inbox und Verträge die in den nächsten 7 Tagen ablaufen.
 *
 * Datenquellen:
 *  - GET /api/sidebar/counts         (alle Counts auf einen Schlag)
 *  - GET /api/approvals/pending      (Detail-Daten — nur für "kritisch <24h"-Dot)
 *
 * Fehlertoleranz:
 *  - 401 → dezenter Hinweis (User nicht berechtigt)
 *  - Sonstige Fehler → kein lautes Toast, nur Inline-Meldung
 *
 * Accessibility / UX:
 *  - reduzierte Motion respektiert (CSS-Variable / Tailwind motion-reduce)
 *  - Currency tabular (für €-Summen in der Mahnungs-Zeile)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ShieldCheck,
  AlertCircle,
  Inbox,
  FileWarning,
  CheckCircle2,
  ExternalLink,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarCounts } from "@/lib/sidebar-counts";
import { HTTP_STATUS } from "@/lib/config/http-status";

// =============================================================================
// TYPES
// =============================================================================

interface PendingApprovalDto {
  id: string;
  action: string;
  entityType: string;
  amountEur: number | null;
  expiresAt: string;
}

interface FocusItem {
  key: string;
  icon: React.ElementType;
  label: string;
  description?: string;
  href: string;
  hasCritical: boolean;
  tone: "default" | "warning" | "destructive";
}

interface TodayFocusWidgetProps {
  className?: string;
}

// 24 hours in ms — Approvals mit kürzerer Restzeit gelten als "kritisch"
const CRITICAL_HOURS_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// COMPONENT
// =============================================================================

export function TodayFocusWidget({ className }: TodayFocusWidgetProps) {
  const t = useTranslations("dashboard.widgets");

  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setUnauthorized(false);
    setLoadFailed(false);

    try {
      const [countsRes, approvalsRes] = await Promise.allSettled([
        fetch("/api/sidebar/counts", { credentials: "same-origin" }),
        fetch("/api/approvals/pending", { credentials: "same-origin" }),
      ]);

      // Counts (primär — wenn 401 → User nicht berechtigt, Widget bleibt leise)
      if (countsRes.status === "fulfilled") {
        if (countsRes.value.status === HTTP_STATUS.UNAUTHORIZED) {
          setUnauthorized(true);
        } else if (countsRes.value.ok) {
          const data = (await countsRes.value.json()) as SidebarCounts;
          setCounts(data);
        } else {
          setLoadFailed(true);
        }
      } else {
        setLoadFailed(true);
      }

      // Approvals nur fürs Critical-Flag — Fehler hier sind weich.
      if (
        approvalsRes.status === "fulfilled" &&
        approvalsRes.value.ok
      ) {
        const json = (await approvalsRes.value.json()) as {
          data?: PendingApprovalDto[];
        };
        setPendingApprovals(json.data ?? []);
      } else {
        setPendingApprovals([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh alle 2 Minuten — leise, ohne Spinner
    const interval = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Approvals < 24h gelten als kritisch (red dot)
  const criticalApprovalsCount = useMemo(() => {
    if (pendingApprovals.length === 0) return 0;
    const now = Date.now();
    return pendingApprovals.filter((a) => {
      const expiresMs = new Date(a.expiresAt).getTime();
      if (Number.isNaN(expiresMs)) return false;
      return expiresMs - now < CRITICAL_HOURS_MS;
    }).length;
  }, [pendingApprovals]);

  // Items zusammenstellen — nur Kategorien mit count > 0
  const items: FocusItem[] = useMemo(() => {
    if (!counts) return [];
    const list: FocusItem[] = [];

    if (counts.approvals > 0) {
      list.push({
        key: "approvals",
        icon: ShieldCheck,
        label: t("focus.approvalsLabel", { count: counts.approvals }),
        description: t("focus.approvalsCta"),
        href: "/approvals",
        hasCritical: criticalApprovalsCount > 0,
        tone: criticalApprovalsCount > 0 ? "destructive" : "warning",
      });
    }

    if (counts.mahnwesen > 0) {
      list.push({
        key: "mahnwesen",
        icon: AlertCircle,
        label: t("focus.dunningLabel", { count: counts.mahnwesen }),
        description: t("focus.dunningCta"),
        href: "/buchhaltung/mahnwesen",
        hasCritical: false,
        tone: "destructive",
      });
    }

    if (counts.inbox > 0) {
      list.push({
        key: "inbox",
        icon: Inbox,
        label: t("focus.inboxLabel", { count: counts.inbox }),
        description: t("focus.inboxCta"),
        href: "/buchhaltung/eingangsrechnungen",
        hasCritical: false,
        tone: "default",
      });
    }

    if (counts.expiringContracts > 0) {
      list.push({
        key: "expiringContracts",
        icon: FileWarning,
        label: t("focus.contractsLabel", { count: counts.expiringContracts }),
        description: t("focus.contractsCta"),
        href: "/contracts?status=EXPIRING",
        hasCritical: false,
        tone: "warning",
      });
    }

    return list;
  }, [counts, criticalApprovalsCount, t]);

  // -------------------------------------------------------------------------
  // RENDERING
  // -------------------------------------------------------------------------

  // 401 → leiser Hinweis (User darf das wahrscheinlich nicht sehen)
  if (unauthorized) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full text-center px-4",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          {t("focus.unauthorizedHint")}
        </p>
      </div>
    );
  }

  // Loading-Skeleton
  if (isLoading && !counts) {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse motion-reduce:animate-none">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (loadFailed && !counts) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full text-center px-4",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">{t("loadErrorDetail")}</p>
      </div>
    );
  }

  // Empty-State — alles erledigt (positive Variante)
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full",
          className,
        )}
      >
        <div className="text-center text-muted-foreground">
          <div className="h-10 w-10 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-sm font-medium">{t("focus.emptyTitle")}</p>
          <p className="text-xs mt-1">{t("focus.emptySubtitle")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {/* Header: kleines Target-Icon + Hinweistext */}
      <div className="flex items-center gap-2 px-2 pb-2 text-xs text-muted-foreground">
        <Target className="h-3.5 w-3.5" />
        <span>{t("focus.header")}</span>
      </div>

      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex items-center justify-between px-2 @md:px-3 py-2.5 @md:py-3 rounded-md transition-colors",
              "hover:bg-accent/50 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <div className="flex items-center gap-3 @md:gap-4 min-w-0 flex-1">
              <div
                className={cn(
                  "relative h-8 w-8 @md:h-9 @md:w-9 rounded-md flex items-center justify-center flex-shrink-0",
                  item.tone === "destructive"
                    ? "bg-destructive/10 text-destructive"
                    : item.tone === "warning"
                      ? "bg-yellow-500/10 text-yellow-600"
                      : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-4 w-4 @md:h-5 @md:w-5" />
                {item.hasCritical && (
                  <span
                    aria-label={t("focus.criticalDotLabel")}
                    className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm @md:text-base font-medium truncate tabular-nums">
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs @md:text-sm text-muted-foreground truncate">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            <ExternalLink
              className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}
