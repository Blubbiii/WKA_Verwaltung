"use client";

/**
 * LastEditStrip — kompakter Footer-Strip mit dem letzten AuditLog-Eintrag.
 *
 * Pattern aus PRODUCT.md ("Vertraue dem Profi" + Transparenz):
 *   "Zuletzt geändert vor 12 min · Lisa M. · Status auf BEZAHLT gesetzt"
 *
 * Klick auf "Verlauf" öffnet ein Popover mit den 10 letzten Einträgen.
 * Renderiert NICHTS wenn keine Einträge da sind (return null) oder die
 * Audit-Permission fehlt (401/403 → silent fail).
 *
 * Datenquelle: /api/audit/by-entity (Feature A4).
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { History, User as UserIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { HTTP_STATUS } from "@/lib/config/http-status";

interface AuditEntry {
  id: string;
  action: string;
  actionLabel: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
  diff?: string;
  createdAt: string;
}

interface LastEditStripProps {
  entityType: string;
  entityId: string;
  className?: string;
}

function getInitials(
  user: AuditEntry["user"] | null,
): string {
  if (!user) return "?";
  const f = user.firstName?.[0] ?? "";
  const l = user.lastName?.[0] ?? "";
  if (f || l) return `${f}${l}`.toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}

function userName(user: AuditEntry["user"] | null): string {
  if (!user) return "System";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

export function LastEditStrip({
  entityType,
  entityId,
  className,
}: LastEditStripProps) {
  const t = useTranslations("common.lastEdit");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/audit/by-entity?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=10`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === HTTP_STATUS.UNAUTHORIZED || res.status === HTTP_STATUS.FORBIDDEN) {
          if (!cancelled) setUnauthorized(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { entries: AuditEntry[] };
        if (cancelled) return;
        setEntries(json.entries ?? []);
      } catch {
        // silent fail — Strip soll nie sichtbar einen Fehler werfen
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  // Wenn keine Permission, keine Einträge oder noch lädt mit 0 Einträgen → nicht rendern
  if (unauthorized) return null;
  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-2", className)}>
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-64" />
      </div>
    );
  }
  if (entries.length === 0) return null;

  const latest = entries[0];

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2 px-3 rounded-md border border-border/50 bg-muted/30 text-xs text-muted-foreground",
        className,
      )}
    >
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarFallback className="text-[9px] font-medium">
          {getInitials(latest.user)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 truncate">
        <span className="font-medium text-foreground/80">{userName(latest.user)}</span>
        <span className="mx-1.5" aria-hidden>·</span>
        <span>
          {formatDistanceToNow(new Date(latest.createdAt), {
            addSuffix: true,
            locale: dateLocale,
          })}
        </span>
        <span className="mx-1.5" aria-hidden>·</span>
        <span>{latest.actionLabel}</span>
        {latest.diff && (
          <>
            <span className="mx-1.5" aria-hidden>·</span>
            <span className="text-muted-foreground/70 truncate">{latest.diff}</span>
          </>
        )}
      </div>

      {entries.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/60"
            >
              <History className="h-3 w-3" aria-hidden />
              {t("history")}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[360px] p-0"
            aria-label={t("viewHistory")}
          >
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("viewHistory")}
              </p>
            </div>
            <ul className="max-h-[320px] overflow-y-auto divide-y divide-border/40">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                    <AvatarFallback className="text-[10px] font-medium">
                      {getInitials(entry.user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug">
                      <span className="font-medium">{userName(entry.user)}</span>
                      <span className="text-muted-foreground"> {entry.actionLabel.toLowerCase()}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(entry.createdAt), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </p>
                    {entry.diff && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        {entry.diff}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

LastEditStrip.displayName = "LastEditStrip";

// Re-export für leichteren Import
export { UserIcon as LastEditStripUserIcon };
