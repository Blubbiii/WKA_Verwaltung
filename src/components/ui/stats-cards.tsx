import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconClassName?: string;
  subtitle?: string;
  /** Kept for compatibility; the strip has no per-card frame any more. */
  cardClassName?: string;
  valueClassName?: string;
  /**
   * Ziel beim Klick auf die Kennzahl.
   *
   * Bedienaufwand #4 (Audit 2026-07): Die Karten sahen durch Hover-Schatten
   * klickbar aus, hatten aber weder href noch onClick — in 15 Listenseiten.
   * Nach "3 Verträge laufen aus" musste man das Status-Dropdown selbst
   * setzen. Der Filter steckt in der Regel schon in der URL, es fehlte nur
   * der Link.
   *
   * Beides optional: Kennzahlen ohne href/onClick bleiben nicht interaktiv.
   */
  href?: string;
  /** Alternative zu href, wenn der Klick lokalen State setzt statt zu navigieren. */
  onClick?: () => void;
  /** Barrierefreier Name, falls das Label allein nicht aussagekräftig ist. */
  ariaLabel?: string;
}

interface StatsCardsProps {
  stats: StatCard[];
  /** Kept for compatibility; the strip wraps on its own. */
  columns?: 2 | 3 | 4;
}

/**
 * Key figures above a list, as one slim strip.
 *
 * UX-Durchsicht 2026-09, Punkt 12: four framed cards took ~180 px before
 * every list and often showed zeros or the same number twice. Now one line;
 * figures with a target (a filter or a page) are links/buttons, the others
 * are plain text.
 */
export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2 rounded-lg border bg-card px-2 py-2">
      {stats.map((stat) => {
        const interactive = !!(stat.href || stat.onClick);

        const inhalt = (
          <span
            className={cn(
              "flex items-baseline gap-2 rounded-md px-3 py-1.5",
              interactive && "cursor-pointer hover:bg-muted",
            )}
          >
            {stat.icon && (
              <stat.icon className={cn("h-4 w-4 self-center text-muted-foreground", stat.iconClassName)} aria-hidden="true" />
            )}
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                interactive && "text-primary underline-offset-4 group-hover:underline",
                stat.valueClassName,
              )}
            >
              {stat.value}
            </span>
            {stat.subtitle && <span className="text-xs text-muted-foreground">{stat.subtitle}</span>}
          </span>
        );

        const focusRing =
          "group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

        if (stat.href) {
          return (
            <Link key={stat.label} href={stat.href} aria-label={stat.ariaLabel} className={focusRing}>
              {inhalt}
            </Link>
          );
        }

        if (stat.onClick) {
          return (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onClick}
              aria-label={stat.ariaLabel}
              className={cn("text-left", focusRing)}
            >
              {inhalt}
            </button>
          );
        }

        return <div key={stat.label}>{inhalt}</div>;
      })}
    </div>
  );
}
