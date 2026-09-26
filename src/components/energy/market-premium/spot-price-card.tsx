"use client";

/**
 * Hourly spot prices of one month: how complete the series is, how many
 * hours were negative — and the SMARD import. Completeness comes first,
 * because a series with gaps looks like a basis but may hide a negative
 * period (see GET /api/energy/spot-prices).
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { leseSmardCsv } from "@/lib/market-premium/smard-csv";

interface SpotResponse {
  completeness: { present: number; expected: number };
  negativeCount: number;
  warnings: string[];
}

export function SpotPriceCard({ year, month }: { year: number; month: number }) {
  const t = useTranslations("marketPremium.spot");
  const queryClient = useQueryClient();
  const dateiFeld = useRef<HTMLInputElement>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery<SpotResponse>(
    ["spot-prices", String(year), String(month)],
    `/api/energy/spot-prices?year=${year}&month=${month}`,
  );

  const importieren = useMutation({
    mutationFn: async (datei: File) => {
      const gelesen = leseSmardCsv(await datei.text());
      if (gelesen.preise.length === 0) throw new Error(t("emptyFile"));
      const res = await fetch("/api/energy/spot-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "SMARD", biddingZone: "DE-LU", prices: gelesen.preise }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("importError"));
      return { ...json, viertelstunden: gelesen.viertelstunden, luecken: gelesen.luecken } as {
        imported: number;
        submitted: number;
        warnings: string[];
        viertelstunden: boolean;
        luecken: number;
      };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["spot-prices"] });
      toast.success(t("imported", { imported: r.imported, submitted: r.submitted }), {
        description: r.warnings.join(" · ") || undefined,
        duration: r.warnings.length ? 12_000 : 4_000,
      });
      // Averaging quarter-hours is a real choice about the data — shown, not silent.
      setHinweis(
        [r.viertelstunden ? t("quarterHours") : null, r.luecken > 0 ? t("gaps", { count: r.luecken }) : null]
          .filter(Boolean)
          .join(" ") || null,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const vollstaendig = data && data.completeness.present >= data.completeness.expected;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <input
          ref={dateiFeld}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const datei = e.target.files?.[0];
            if (datei) importieren.mutate(datei);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => dateiFeld.current?.click()} disabled={importieren.isPending}>
          {importieren.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {t("import")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading || !data ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("hours")}</dt>
                <dd className={`text-lg font-semibold tabular-nums ${vollstaendig ? "" : "text-amber-600"}`}>
                  {data.completeness.present} / {data.completeness.expected}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("negativeHours")}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {data.completeness.present > 0 ? data.negativeCount : "–"}
                </dd>
              </div>
            </dl>
            {data.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-amber-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {w}
              </p>
            ))}
          </>
        )}
        {hinweis && <p className="text-xs text-muted-foreground">{hinweis}</p>}
        <p className="text-xs text-muted-foreground">{t("sourceHint")}</p>
      </CardContent>
    </Card>
  );
}
