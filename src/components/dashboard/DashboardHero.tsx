"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Wind,
  FileText,
  ShieldCheck,
  Calendar,
  ArrowUpRight,
  ArrowRight,
  Clock,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Redesign 2026-06 R-6: DashboardHero — Story-Block über dem Widget-Grid.
 *
 * Vorher: das Dashboard startete direkt mit dem react-grid-layout aus N
 * gleichberechtigten KPI-Karten. Bei 8-12 Karten gleicher Größe konnte das
 * Auge keine Hierarchie aufbauen ("Hero-Metric-Template" — impeccable Anti-
 * Pattern).
 *
 * Jetzt: ein bewusst hierarchisches Hero-Layout ÜBER dem Widget-Grid.
 *  - Linke 2/3: Eine dominante KPI (aktive Parks) + 3 sekundäre Zahlen
 *  - Rechte 1/3: Live-Activity-Feed mit den letzten 5 Vorgängen
 *
 * Das Widget-Grid (DashboardView) bleibt unverändert als anpassbarer Bereich
 * darunter — der User behält die volle Customization-Story.
 */

interface DashboardStats {
  parks: number;
  funds: number;
  contracts: number;
  activeContracts: number;
  expiringContracts: number;
  invoices: number;
  shareholders: number;
}

interface ActivityItem {
  id: string;
  action: string;
  detail: string;
  time: string;
  href: string | null;
  entityType: string;
}

export function DashboardHero() {
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, activitiesRes] = await Promise.all([
          fetch("/api/dashboard/stats").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/dashboard/activities").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        if (statsRes) {
          setStats({
            parks: statsRes.parks ?? 0,
            funds: statsRes.funds ?? 0,
            contracts: statsRes.contracts ?? 0,
            activeContracts: statsRes.activeContracts ?? 0,
            expiringContracts: statsRes.expiringContracts ?? 0,
            invoices: statsRes.invoices ?? 0,
            shareholders: statsRes.shareholders ?? 0,
          });
        }
        if (Array.isArray(activitiesRes)) {
          setActivities(activitiesRes.slice(0, 6));
        }
      } catch {
        // graceful degrade — Hero rendert leer
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* LINKES PANE — Hero-KPIs (2/3 Breite auf lg+) */}
      <div className="lg:col-span-2 space-y-3">
        {/* Dominante KPI: Aktive Windparks */}
        <HeroPrimaryKpi
          loading={loading}
          value={stats?.parks ?? 0}
          activeLabel={t("hero.activeParks") || "Aktive Windparks"}
          subline={
            stats
              ? `${stats.shareholders} ${t("hero.shareholdersSuffix") || "Gesellschafter"} · ${stats.funds} ${t("hero.fundsSuffix") || "Beteiligungen"}`
              : ""
          }
          href="/parks"
        />

        {/* 3 sekundäre KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SecondaryKpi
            loading={loading}
            icon={FileText}
            label={t("hero.openInvoices") || "Rechnungen"}
            value={stats?.invoices ?? 0}
            href="/invoices"
          />
          <SecondaryKpi
            loading={loading}
            icon={ShieldCheck}
            label={t("hero.activeContracts") || "Aktive Verträge"}
            value={stats?.activeContracts ?? 0}
            href="/contracts"
          />
          <SecondaryKpi
            loading={loading}
            icon={Calendar}
            label={t("hero.expiringSoon") || "Fristen 90 Tage"}
            value={stats?.expiringContracts ?? 0}
            href="/contracts/calendar"
            highlight={(stats?.expiringContracts ?? 0) > 0}
          />
        </div>
      </div>

      {/* RECHTES PANE — Activity-Feed (1/3 Breite auf lg+) */}
      <ActivityFeedCard loading={loading} activities={activities} t={t} />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function HeroPrimaryKpi({
  loading,
  value,
  activeLabel,
  subline,
  href,
}: {
  loading: boolean;
  value: number;
  activeLabel: string;
  subline: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group block relative overflow-hidden rounded-xl border border-border bg-card p-5",
        "transition-colors duration-150 hover:border-primary/40",
      )}
    >
      {/* Subtle Brand-Tint im Hintergrund — kein voller Drench */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary))_0%,transparent_55%)]"
      />
      <div className="relative flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 ring-1 ring-primary/20 p-2.5">
          <Wind className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {activeLabel}
          </p>
          {loading ? (
            <Skeleton className="h-12 w-28 mt-1.5" />
          ) : (
            <p className="tabular-currency text-5xl font-semibold tracking-[-0.03em] mt-0.5 leading-none">
              {value}
            </p>
          )}
          {loading ? (
            <Skeleton className="h-4 w-48 mt-3" />
          ) : (
            <p className="text-sm text-muted-foreground mt-3">{subline}</p>
          )}
        </div>
        <ArrowUpRight
          className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function SecondaryKpi({
  loading,
  icon: Icon,
  label,
  value,
  href,
  highlight = false,
}: {
  loading: boolean;
  icon: typeof FileText;
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg border bg-card p-3.5 transition-colors duration-150",
        highlight ? "border-warning/40 hover:border-warning/70" : "border-border hover:border-border/60",
      )}
    >
      <div
        className={cn(
          "rounded-md p-2 shrink-0",
          highlight ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-6 w-12 mt-0.5" />
        ) : (
          <p
            className={cn(
              "tabular-currency text-xl font-semibold tracking-[-0.01em] leading-tight",
              highlight && "text-warning-foreground",
            )}
          >
            {value}
          </p>
        )}
      </div>
      <ArrowRight
        className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/60 transition-colors shrink-0"
        aria-hidden
      />
    </Link>
  );
}

function ActivityFeedCard({
  loading,
  activities,
  t,
}: {
  loading: boolean;
  activities: ActivityItem[];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section
      aria-label={t("hero.activityHeader") || "Letzte Aktivitäten"}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <header className="border-b border-border/70 px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {t("hero.activityHeader") || "Letzte Aktivitäten"}
        </h2>
        <Clock className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
      </header>
      <div className="max-h-[280px] overflow-y-auto">
        {loading ? (
          <ul className="p-2 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-12 w-full" />
              </li>
            ))}
          </ul>
        ) : activities.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("hero.noActivities") || "Noch keine Aktivitäten heute."}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border/40">
            {activities.map((a) => (
              <li key={a.id}>
                <ActivityRow item={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const content = (
    <div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <CircleDot
        className="h-3 w-3 mt-1 shrink-0 text-primary/70"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug text-foreground truncate">
          {item.action}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{item.time}</p>
      </div>
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
