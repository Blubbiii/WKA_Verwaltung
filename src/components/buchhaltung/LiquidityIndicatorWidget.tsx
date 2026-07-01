"use client";

/**
 * FS-5: Liquiditäts-Ampel-Widget.
 *
 * Lädt die 12-Monats-Liquiditätsprognose und zeigt eine Ampel (grün/gelb/rot)
 * je nach Engpass-Horizont:
 *  - Grün: alle Monate positiv
 *  - Gelb: Engpass in 4-12 Monaten
 *  - Rot:  Engpass in <3 Monaten
 *
 * Standalone-Komponente — kann in Dashboard, Buchhaltungs-Übersicht oder als
 * Card auf der Planungs-Seite eingebunden werden.
 * Stil analog CpiReminderWidget.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  TrendingDown,
} from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

interface LiquidityPeriod {
  label: string;
  periodStart: string;
  periodEnd: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  cumulativeBalance: number;
}

interface LiquidityForecastResult {
  periods: LiquidityPeriod[];
  startingBalance: number;
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
}

type LightStatus = "green" | "yellow" | "red";

interface LightResult {
  status: LightStatus;
  firstShortfall: LiquidityPeriod | null;
  monthsUntilShortfall: number | null;
}

function evaluateLight(forecast: LiquidityForecastResult): LightResult {
  const firstShortfallIdx = forecast.periods.findIndex(
    (p) => p.cumulativeBalance < 0,
  );
  if (firstShortfallIdx === -1) {
    return { status: "green", firstShortfall: null, monthsUntilShortfall: null };
  }
  const firstShortfall = forecast.periods[firstShortfallIdx];
  const months = firstShortfallIdx + 1;
  if (months < 3) {
    return { status: "red", firstShortfall, monthsUntilShortfall: months };
  }
  return { status: "yellow", firstShortfall, monthsUntilShortfall: months };
}

const STATUS_META: Record<
  LightStatus,
  {
    labelKey: "statusGreen" | "statusYellow" | "statusRed";
    badgeVariant: "default" | "destructive" | "outline" | "secondary";
    Icon: typeof CheckCircle2;
    iconClass: string;
    dotClass: string;
  }
> = {
  green: {
    labelKey: "statusGreen",
    badgeVariant: "default",
    Icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  yellow: {
    labelKey: "statusYellow",
    badgeVariant: "secondary",
    Icon: TrendingDown,
    iconClass: "text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
  red: {
    labelKey: "statusRed",
    badgeVariant: "destructive",
    Icon: AlertTriangle,
    iconClass: "text-red-600 dark:text-red-300",
    dotClass: "bg-red-500",
  },
};

function fmtEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface Props {
  months?: number;
  startingBalance?: number;
}

export function LiquidityIndicatorWidget({
  months = 12,
  startingBalance = 0,
}: Props) {
  const t = useTranslations("liquidity");
  const [data, setData] = useState<LiquidityForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      months: String(months),
      granularity: "monthly",
      startingBalance: String(startingBalance),
    });

    fetch(`/api/buchhaltung/liquiditaet?${params.toString()}`, {
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(t("loadError"));
        return r.json();
      })
      .then((json: { data: LiquidityForecastResult }) => {
        setData(json.data);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : t("unknownError"));
      })
      .finally(() => {
        setLoading(false);
      });

    return () => ac.abort();
  }, [months, startingBalance, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Droplets className="h-4 w-4" />
          {t("title")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("subtitle", { months })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !data || data.periods.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            {t("noData")}
          </div>
        ) : (
          (() => {
            const result = evaluateLight(data);
            const meta = STATUS_META[result.status];
            const Icon = meta.Icon;
            return (
              <div className="space-y-4">
                {/* Ampel-Anzeige */}
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                  <div className="relative">
                    <div
                      className={`h-12 w-12 rounded-full ${meta.dotClass} shadow-md`}
                      aria-hidden
                    />
                    <Icon
                      className={`absolute inset-0 m-auto h-6 w-6 text-white`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={meta.badgeVariant}>{t(meta.labelKey)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("endingBalance", { months: data.periods.length })}{" "}
                      <span className="font-mono">
                        {fmtEur(data.endingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detail: Engpass / Stabilität */}
                {result.firstShortfall ? (
                  <Alert
                    variant={result.status === "red" ? "destructive" : "default"}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium">
                        {t("firstShortfall", { label: result.firstShortfall.label })}
                      </div>
                      <div className="text-xs mt-1">
                        {t("cumulativeBalance")}{" "}
                        <span className="font-mono">
                          {fmtEur(result.firstShortfall.cumulativeBalance)}
                        </span>{" "}
                        · {t("inMonths", { n: result.monthsUntilShortfall ?? 0 })}
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t("allPositive", { months: data.periods.length })}
                  </div>
                )}

                {/* Mini-Summary */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">{t("totalInflows")}</div>
                    <div className="font-mono font-medium text-emerald-700 dark:text-emerald-300">
                      {fmtEur(data.totalInflows)}
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-muted-foreground">{t("totalOutflows")}</div>
                    <div className="font-mono font-medium text-red-700 dark:text-red-300">
                      {fmtEur(data.totalOutflows)}
                    </div>
                  </div>
                </div>

                <Link
                  href="/buchhaltung/planung?tab=liquiditaet"
                  className="block text-xs text-primary hover:underline"
                >
                  {t("detailLink")}
                </Link>
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
