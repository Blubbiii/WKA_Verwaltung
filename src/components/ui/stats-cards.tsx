import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconClassName?: string;
  subtitle?: string;
  cardClassName?: string;
  valueClassName?: string;
  /**
   * Ziel beim Klick auf die Karte.
   *
   * Bedienaufwand #4 (Audit 2026-07): Die Karten sahen durch Hover-Schatten
   * klickbar aus, hatten aber weder href noch onClick — in 15 Listenseiten.
   * Nach "3 Verträge laufen aus" musste man das Status-Dropdown selbst
   * setzen. Der Filter steckt in der Regel schon in der URL, es fehlte nur
   * der Link.
   *
   * Beides optional und rückwärtskompatibel: Karten ohne href/onClick bleiben
   * wie bisher nicht interaktiv — sonst würden 15 Seiten auf einmal eine
   * Klickfläche ohne Ziel bekommen.
   */
  href?: string;
  /** Alternative zu href, wenn der Klick lokalen State setzt statt zu navigieren. */
  onClick?: () => void;
  /** Barrierefreier Name, falls das Label allein nicht aussagekräftig ist. */
  ariaLabel?: string;
}

interface StatsCardsProps {
  stats: StatCard[];
  columns?: 2 | 3 | 4;
}

export function StatsCards({ stats, columns = 4 }: StatsCardsProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns])}>
      {stats.map((stat) => {
        const interactive = !!(stat.href || stat.onClick);

        const card = (
          <Card
            className={cn(
              "border-l-4 border-l-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent hover:shadow-md transition-shadow duration-200",
              // Der Cursor darf nur dort auf Klickbarkeit hindeuten, wo es
              // auch ein Ziel gibt — der Hover-Schatten allein hat genau
              // diesen falschen Eindruck erzeugt.
              interactive && "cursor-pointer h-full focus-visible:outline-none",
              stat.cardClassName
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              {stat.icon && (
                <div className="rounded-md bg-gradient-to-br from-primary/15 to-primary/5 p-2">
                  <stat.icon
                    className={cn(
                      "h-5 w-5 text-primary",
                      stat.iconClassName
                    )}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold tracking-tight tabular-nums", stat.valueClassName)}>
                {stat.value}
              </div>
              {stat.subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{stat.subtitle}</p>
              )}
            </CardContent>
          </Card>
        );

        // Fokusring am Wrapper, nicht an der Card — sonst liegt er innerhalb
        // des farbigen Rands und ist kaum sichtbar.
        const focusRing =
          "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

        if (stat.href) {
          return (
            <Link
              key={stat.label}
              href={stat.href}
              aria-label={stat.ariaLabel}
              className={cn("block", focusRing)}
            >
              {card}
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
              className={cn("block w-full text-left", focusRing)}
            >
              {card}
            </button>
          );
        }

        return <div key={stat.label}>{card}</div>;
      })}
    </div>
  );
}
