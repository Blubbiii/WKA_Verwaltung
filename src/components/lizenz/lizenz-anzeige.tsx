"use client";

/**
 * The customer's view of their licence (2026-09): the "Lizenz & Verbrauch"
 * card in the settings and a banner while a limit is exceeded. Both read
 * GET /api/lizenz (settings:read) — users without that right see neither.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import type { Zaehler } from "@/lib/lizenz/lizenz";

interface LizenzAntwort {
  tarif: { name: string } | null;
  zeilen: { zaehler: Zaehler; verbrauch: number; grenze: number | null; ueber: boolean }[];
  ueberschritten: Zaehler[];
  karenzBis: string | null;
  gesperrt: boolean;
}

function useLizenz() {
  return useQuery({
    queryKey: ["lizenz"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<LizenzAntwort> => {
      const res = await fetch("/api/lizenz");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
}

export function LizenzKarte() {
  const t = useTranslations("lizenz");
  const { data, isLoading, error } = useLizenz();
  if (error) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {data?.tarif ? t("booked", { tarif: data.tarif.name }) : t("noTariff")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {data.zeilen.map((z) => {
              const prozent = z.grenze ? Math.min(100, (z.verbrauch / z.grenze) * 100) : 0;
              return (
                <div key={z.zaehler} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{t(`counters.${z.zaehler}`)}</span>
                    <span className={`tabular-nums ${z.ueber ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {z.grenze === null
                        ? t("usedUnlimited", { used: z.verbrauch })
                        : t("usedOf", { used: z.verbrauch, limit: z.grenze })}
                    </span>
                  </div>
                  {z.grenze !== null && <Progress value={prozent} className="h-2" />}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">{t("notCounted")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Banner while the licence is exceeded — grace period or lock. */
export function LizenzHinweis() {
  const t = useTranslations("lizenz");
  const { data } = useLizenz();
  if (!data || data.ueberschritten.length === 0) return null;

  const was = data.ueberschritten.map((z) => t(`counters.${z}`)).join(", ");
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 px-4 py-2 text-sm ${
        data.gesperrt ? "bg-destructive text-destructive-foreground" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      }`}
    >
      {data.gesperrt ? <Lock className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span className="flex-1">
        {data.gesperrt
          ? t("bannerLocked", { was })
          : t("bannerGrace", { was, datum: formatDate(new Date(data.karenzBis!)) })}
      </span>
      <Link href="/settings?tab=lizenz" className="shrink-0 underline">
        {t("details")}
      </Link>
    </div>
  );
}

export { BadgeCheck as LizenzIcon };
