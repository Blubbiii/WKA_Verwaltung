"use client";

import Link from "next/link";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// =============================================================================
// KPI ACCENT COLORS - unique color per widget for visual distinction
// =============================================================================

export const KPI_ACCENT_COLORS: Record<string, string> = {
  "kpi-parks": "text-cyan-600 dark:text-cyan-400",
  "kpi-turbines": "text-slate-600 dark:text-slate-400",
  "kpi-shareholders": "text-violet-600 dark:text-violet-400",
  "kpi-fund-capital": "text-emerald-600 dark:text-emerald-400",
  "kpi-open-invoices": "text-amber-600 dark:text-amber-400",
  "kpi-contracts": "text-orange-600 dark:text-orange-400",
  "kpi-documents": "text-pink-600 dark:text-pink-400",
  "kpi-votes": "text-indigo-600 dark:text-indigo-400",
  // Energy widgets (planned)
  "kpi-energy-yield": "text-lime-600 dark:text-lime-400",
  "kpi-availability": "text-green-600 dark:text-green-400",
  "kpi-wind-speed": "text-sky-600 dark:text-sky-400",
  "kpi-lease-revenue": "text-rose-600 dark:text-rose-400",
};

const KPI_ACCENT_HEX: Record<string, string> = {
  "kpi-parks": "#0891b2",
  "kpi-turbines": "#475569",
  "kpi-shareholders": "#7c3aed",
  "kpi-fund-capital": "#059669",
  "kpi-open-invoices": "#d97706",
  "kpi-contracts": "#ea580c",
  "kpi-documents": "#db2777",
  "kpi-votes": "#4f46e5",
  "kpi-energy-yield": "#65a30d",
  "kpi-availability": "#16a34a",
  "kpi-wind-speed": "#0284c7",
  "kpi-lease-revenue": "#e11d48",
};

export const KPI_ICON_COLORS: Record<string, string> = {
  "kpi-parks": "text-cyan-500/40 dark:text-cyan-400/30",
  "kpi-turbines": "text-slate-500/40 dark:text-slate-400/30",
  "kpi-shareholders": "text-violet-500/40 dark:text-violet-400/30",
  "kpi-fund-capital": "text-emerald-500/40 dark:text-emerald-400/30",
  "kpi-open-invoices": "text-amber-500/40 dark:text-amber-400/30",
  "kpi-contracts": "text-orange-500/40 dark:text-orange-400/30",
  "kpi-documents": "text-pink-500/40 dark:text-pink-400/30",
  "kpi-votes": "text-indigo-500/40 dark:text-indigo-400/30",
  // Energy widgets (planned)
  "kpi-energy-yield": "text-lime-500/40 dark:text-lime-400/30",
  "kpi-availability": "text-green-500/40 dark:text-green-400/30",
  "kpi-wind-speed": "text-sky-500/40 dark:text-sky-400/30",
  "kpi-lease-revenue": "text-rose-500/40 dark:text-rose-400/30",
};

// =============================================================================
// KPI CARD PROPS
// =============================================================================

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number; // Prozent
  trendLabel?: string;
  description?: string;
  isLoading?: boolean;
  isAlert?: boolean;
  accentColor?: string; // Tailwind color class for the value
  iconColor?: string; // Tailwind color class for the icon
  href?: string; // Link target — makes the card clickable
  className?: string;
  widgetId?: string; // Used for L-accent border color lookup
}

// =============================================================================
// KPI TREND ICON (extracted to avoid "component created during render" warning)
// =============================================================================

function KPITrendIcon({
  trend,
  className,
}: {
  trend: number | undefined;
  className?: string;
}) {
  if (trend === undefined) return null;
  if (trend > 0) return <TrendingUp className={className} />;
  if (trend < 0) return <TrendingDown className={className} />;
  return <Minus className={className} />;
}

// =============================================================================
// KPI CARD COMPONENT
// =============================================================================

export function KPICard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  description,
  isLoading = false,
  isAlert = false,
  accentColor,
  iconColor,
  href,
  className,
  widgetId,
}: KPICardProps) {
  // Trend formatting
  const getTrendColor = () => {
    if (isAlert) return "text-destructive";
    if (trend === undefined || trend === 0) return "text-muted-foreground";
    return trend > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  };

  const formatTrend = (value: number): string => {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)} %`;
  };

  if (isLoading) {
    return (
      <Card className={cn("h-full overflow-hidden", className)}>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-5 rounded" />
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-3 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  const accentHex = isAlert
    ? "#dc2626"
    : (widgetId ? KPI_ACCENT_HEX[widgetId] ?? "#335E99" : "#335E99");

  const card = (
    // @container enables child elements to respond to this card's own width
    <Card
      className={cn(
        "@container h-full overflow-hidden transition-all hover:shadow-md",
        "border border-border/60 dark:border-border/40",
        href && "cursor-pointer hover:border-primary/30",
        className
      )}
      style={{
        borderTop: `4px solid ${accentHex}`,
        borderLeft: `2px solid ${accentHex}`,
      }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-2">
        {/*
          Die Beschriftung darf umbrechen. Vorher stand sie einzeilig und
          verdraengte damit die Breite, die der Wert gebraucht haette —
          "GESAMTPRODUKTION (TURBINEN)" ist nun einmal lang.
        */}
        <CardTitle className="uppercase tracking-wider text-xs font-semibold leading-snug text-muted-foreground">
          {title}
        </CardTitle>
        {/* Icon scales up on wider widgets (@md = container ≥ 28rem / ~448px) */}
        <Icon className={cn(
          "h-5 w-5 @md:h-7 @md:w-7 shrink-0",
          isAlert
            ? "text-destructive/60"
            : iconColor || "text-muted-foreground/30"
        )} />
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {/* Value text scales up on wider widgets */}
        {/*
          EINE ZAHL WIRD NIE GEKAPPT.
          
          Hier stand `truncate`. Auf der Energie-Uebersicht wurde daraus
          "107,59 …" und "03.08.2…" — eine Kennzahl, die ihre eigene Zahl
          abschneidet, ist nicht bloss unschoen: sie ist falsch. 107,59 ist
          eine andere Zahl als 107.590, und niemand sieht der Karte an,
          welche gemeint war.
          
          Passt der Wert nicht, wird er KLEINER, nicht kuerzer: die
          Container-Abfragen stufen die Schrift von @xs bis @md. Reicht auch
          das nicht, darf er umbrechen — zwei Zeilen sind besser als eine
          halbe Zahl. `title` haelt den vollen Wert fuer den Mauszeiger
          bereit.
        */}
        <div
          title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
          className={cn(
            "text-xl @xs:text-2xl @md:text-3xl font-bold tabular-nums leading-tight",
            "break-words hyphens-auto",
            isAlert ? "text-destructive" : accentColor || "text-foreground"
          )}
        >
          {value}
        </div>
        {/*
          Zwei Zeilen statt einer halben. "Produktionsdaten 2…" sagt nichts;
          "Produktionsdaten 2026, alle Anlagen" sagt alles.
        */}
        {description && (
          <p className="text-xs @md:text-sm text-muted-foreground mt-1.5 line-clamp-2">
            {description}
          </p>
        )}
        {(trend !== undefined || trendLabel) && (
          <div className={cn("mt-1.5 flex items-center text-xs @md:text-sm", getTrendColor())}>
            <KPITrendIcon trend={trend} className="mr-1 h-3 w-3 @md:h-4 @md:w-4 shrink-0" />
            <span className="truncate">
              {trend !== undefined ? formatTrend(trend) : trendLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full no-underline">
        {card}
      </Link>
    );
  }

  return card;
}

// =============================================================================
// KPI CARD GRID (Container für mehrere KPI Cards)
// =============================================================================

interface KPICardGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Raster für Kennzahlkarten.
 *
 * ## Die Karten bestimmen die Spaltenzahl, nicht umgekehrt
 *
 * Vorher stand hier eine feste Zahl (`lg:grid-cols-4`), die jede Seite
 * überschreiben durfte. Die Energie-Übersicht setzte `xl:grid-cols-6` — auf
 * 1400 Pixel blieben je Karte rund 200 Pixel, und die Werte wurden
 * abgeschnitten: aus 107.590 wurde „107,59 …".
 *
 * Jetzt entscheidet die Mindestbreite. `auto-fit` legt so viele Spalten an,
 * wie bei 240 Pixel je Karte hineinpassen — auf einem breiten Bildschirm
 * fünf, auf einem Laptop vier, auf dem Telefon eine. Niemand muss mehr
 * Haltepunkte raten, und **eine zu schmale Karte kann gar nicht mehr
 * entstehen**.
 *
 * Das ist der Unterschied zwischen „wir kürzen den Text, wenn es eng wird"
 * und „es wird nicht eng". Nur das zweite hält.
 *
 * `className` bleibt möglich — wer wirklich eine feste Spaltenzahl braucht,
 * bekommt sie. Aber der Normalfall ist jetzt richtig, nicht die Ausnahme.
 */
export function KPICardGrid({ children, className }: KPICardGridProps) {
  return (
    <div
      className={cn("grid gap-4", className)}
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
      }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// KPI CARD SKELETON (für Loading States)
// =============================================================================

export function KPICardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <Skeleton className="h-8 w-28 mb-2" />
        <Skeleton className="h-3 w-32 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

export function KPICardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <KPICardSkeleton key={i} />
      ))}
    </div>
  );
}
