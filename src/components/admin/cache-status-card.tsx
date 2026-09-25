"use client";

/**
 * Cache state for superadmins (GET/DELETE /api/admin/cache): Redis or the
 * in-memory fallback, hit rate, key count — and a way to clear the dashboard
 * caches when figures look stale. Hidden for everyone else (the route
 * answers 403).
 */

import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { useApiQuery } from "@/hooks/useApiQuery";

interface CacheStatus {
  status: "healthy" | "degraded";
  backend: "redis" | "memory";
  usingMemoryFallback: boolean;
  memoryCacheSize: number;
  performance: { hits: number; misses: number; hitRate: string; invalidations: number };
  redis: { keyCount: number | null; memoryUsage: string | null } | null;
}

export function CacheStatusCard() {
  const t = useTranslations("admin.cacheStatus");
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const { data, error } = useApiQuery<CacheStatus>("admin-cache", "/api/admin/cache", {
    refetchInterval: 30_000,
  });

  const leeren = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/cache", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("clearError"));
      return json as { message: string };
    },
    onSuccess: (json) => {
      toast.success(json.message);
      queryClient.invalidateQueries({ queryKey: ["admin-cache"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (error || !data) return null;

  const kennzahlen = [
    { label: t("hitRate"), wert: `${data.performance.hitRate} %` },
    { label: t("hits"), wert: data.performance.hits.toLocaleString("de-DE") },
    { label: t("misses"), wert: data.performance.misses.toLocaleString("de-DE") },
    {
      label: t("keys"),
      wert: (data.redis?.keyCount ?? data.memoryCacheSize).toLocaleString("de-DE"),
    },
    ...(data.redis?.memoryUsage ? [{ label: t("memory"), wert: data.redis.memoryUsage }] : []),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" aria-hidden />
            {t("title")}
            <Badge variant={data.status === "healthy" ? "secondary" : "destructive"}>
              {data.backend === "redis" ? "Redis" : t("memoryFallback")}
            </Badge>
          </CardTitle>
          <CardDescription>
            {data.usingMemoryFallback ? t("fallbackHint") : t("description")}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={leeren.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: t("clearTitle"),
              description: t("clearText"),
              confirmLabel: t("clear"),
            });
            if (ok) leeren.mutate();
          }}
        >
          {leeren.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          {t("clear")}
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          {kennzahlen.map((k) => (
            <div key={k.label}>
              <dt className="text-muted-foreground">{k.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{k.wert}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
