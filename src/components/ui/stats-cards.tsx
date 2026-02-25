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
}

interface StatsCardsProps {
  stats: StatCard[];
  columns?: 2 | 3 | 4;
}

export function StatsCards({ stats, columns = 4 }: StatsCardsProps) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns])}>
      {stats.map((stat, index) => (
        <Card
          key={index}
          className={cn(
            "border-l-4 border-l-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent hover:shadow-md transition-shadow duration-200",
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
            <div className={cn("text-2xl font-bold tracking-tight font-mono", stat.valueClassName)}>
              {stat.value}
            </div>
            {stat.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
