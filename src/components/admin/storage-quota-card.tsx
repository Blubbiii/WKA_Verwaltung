"use client";

/**
 * Storage quota of the tenant (GET/POST /api/admin/storage): used against
 * the limit, split by document category, and a recalculation. The counter
 * rises on upload but nothing lowers it on delete — the recalculation
 * rebuilds it from the documents still stored.
 */

import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Database, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";

interface StorageInfo {
  usedFormatted: string;
  limitFormatted: string;
  percentUsed: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  breakdown: { category: string; label: string; count: number; totalFormatted: string }[];
}

export function StorageQuotaCard() {
  const t = useTranslations("admin.storageQuota");
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApiQuery<StorageInfo>("admin-storage", "/api/admin/storage");

  const neuBerechnen = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/storage", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("recalcError"));
      return json as { usedFormatted: string };
    },
    onSuccess: (r) => {
      toast.success(t("recalculated", { used: r.usedFormatted }));
      queryClient.invalidateQueries({ queryKey: ["admin-storage"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Without settings:read the card has nothing to show.
  if (error) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button variant="outline" onClick={() => neuBerechnen.mutate()} disabled={neuBerechnen.isPending}>
          {neuBerechnen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t("recalc")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-lg font-semibold">
                  {t("usedOf", { used: data.usedFormatted, limit: data.limitFormatted })}
                </span>
                <span className="tabular-nums text-muted-foreground">{data.percentUsed.toFixed(1).replace(".", ",")} %</span>
              </div>
              <Progress value={Math.min(100, data.percentUsed)} className="h-2" />
            </div>
            {(data.isOverLimit || data.isNearLimit) && (
              <p className={`flex items-center gap-2 text-sm ${data.isOverLimit ? "text-destructive" : "text-amber-600"}`}>
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {data.isOverLimit ? t("overLimit") : t("nearLimit")}
              </p>
            )}
            {data.breakdown.length > 0 && (
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {data.breakdown.map((b) => (
                  <div key={b.category} className="flex justify-between gap-2 border-b py-1">
                    <dt>{b.label}</dt>
                    <dd className="tabular-nums text-muted-foreground">
                      {t("files", { count: b.count })} · {b.totalFormatted}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
