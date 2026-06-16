"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Clock,
  FileText,
  Inbox,
  CheckSquare,
  ScrollText,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface TopActivity {
  action: string;
  time: string;
  href: string | null;
}

interface SinceLastVisitResponse {
  sinceTime: string;
  newInvoices: number;
  newIncomingInvoices: number;
  newApprovals: number;
  newAuditEntries: number;
  topActivities: TopActivity[];
}

interface SinceLastVisitWidgetProps {
  className?: string;
}

const STORAGE_KEY = "wpm-last-visit-timestamp";

/**
 * SSR-safety: localStorage darf nur im Browser angefasst werden. Wir lesen den
 * Wert daher ausschließlich in useEffect (nach dem ersten Client-Render) und
 * setzen ihn am Ende des fetchData() — direkt nach Erhalt der API-Antwort —
 * auf "jetzt", sodass der nächste Reload den frischen Delta-Zeitraum nutzt.
 * Beim allerersten Aufruf (Key fehlt) fragen wir ohne `since`, was die Route
 * auf 24h-Lookback abbildet.
 */

function relativeTimeGerman(date: Date): string {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? "n" : ""}`;
  if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? "n" : ""}`;
  if (diffDays === 1) return "gestern";
  return `vor ${diffDays} Tagen`;
}

interface MiniKpiProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}

function MiniKpi({ label, value, icon: Icon }: MiniKpiProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
        <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// SINCE LAST VISIT WIDGET
// =============================================================================

export function SinceLastVisitWidget({ className }: SinceLastVisitWidgetProps) {
  const [data, setData] = useState<SinceLastVisitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Falls dieselbe Widget-Instanz mehrfach gemountet würde (StrictMode, Edit-
  // Modus, …) sorgen wir dafür, dass localStorage NUR im ersten Mount-Zyklus
  // weiterverwendet wird, danach jeweils "jetzt" als Vergleichsbasis dient.
  const initialSinceRef = useRef<string | null>(null);

  const fetchData = useCallback(async (sinceOverride?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Beim ersten Aufruf den localStorage-Wert lesen, danach steht ein
      // overrideSince bereit (Reset-Button).
      let since = sinceOverride ?? null;
      if (!since && initialSinceRef.current === null && typeof window !== "undefined") {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) since = stored;
        initialSinceRef.current = stored ?? "";
      } else if (!since) {
        since = initialSinceRef.current || null;
      }

      const url = since
        ? `/api/dashboard/since-last-visit?since=${encodeURIComponent(since)}`
        : "/api/dashboard/since-last-visit";

      const response = await fetch(url);
      if (!response.ok) {
        setError("Daten konnten nicht geladen werden");
        return;
      }
      const json: SinceLastVisitResponse = await response.json();
      setData(json);

      // localStorage NACH dem erfolgreichen Render auf jetzt setzen, damit
      // der nächste Reload den frischen Delta-Zeitraum sieht.
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      }
    } catch {
      setError("Daten konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReset = useCallback(() => {
    if (typeof window !== "undefined") {
      const now = new Date().toISOString();
      window.localStorage.setItem(STORAGE_KEY, now);
      initialSinceRef.current = now;
      void fetchData(now);
    }
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sinceDate = new Date(data.sinceTime);
  const totalChanges =
    data.newInvoices + data.newIncomingInvoices + data.newApprovals + data.newAuditEntries;

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-xs text-muted-foreground">
            Seit deinem letzten Besuch ({relativeTimeGerman(sinceDate)})
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Zähler zurücksetzen"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden @sm:inline">Verstanden – zurücksetzen</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        <MiniKpi label="Rechnungen" value={data.newInvoices} icon={FileText} />
        <MiniKpi label="Eingang" value={data.newIncomingInvoices} icon={Inbox} />
        <MiniKpi label="Freigaben" value={data.newApprovals} icon={CheckSquare} />
        <MiniKpi label="Audit" value={data.newAuditEntries} icon={ScrollText} />
      </div>

      <div className="flex-1 overflow-auto">
        {totalChanges === 0 && data.topActivities.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Nichts Neues seit dem letzten Besuch.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Wichtigste Vorgänge
            </p>
            <ul className="space-y-2">
              {data.topActivities.map((activity, idx) => {
                const row = (
                  <div className="flex items-start justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
                    <p className="min-w-0 flex-1 text-sm leading-snug">{activity.action}</p>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {activity.time}
                    </span>
                  </div>
                );
                if (activity.href) {
                  return (
                    <li key={idx}>
                      <Link
                        href={activity.href}
                        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                      >
                        {row}
                      </Link>
                    </li>
                  );
                }
                return <li key={idx}>{row}</li>;
              })}
              {data.topActivities.length === 0 && totalChanges > 0 && (
                <li className="text-xs text-muted-foreground">
                  {totalChanges} neue Vorgänge — keine Audit-Details verfügbar.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
