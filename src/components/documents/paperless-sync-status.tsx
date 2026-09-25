"use client";

/**
 * Tenant-wide Paperless sync overview (GET /api/integrations/paperless/sync/status):
 * how many documents are archived, waiting, failed — and how many were never
 * sent. Failed ones are the ones to look at; each document's detail page has
 * the button to send it again.
 */

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/useApiQuery";

interface SyncStatus {
  total: number;
  synced: number;
  pending: number;
  failed: number;
  skipped: number;
  notSynced: number;
}

export function PaperlessSyncStatus() {
  const t = useTranslations("documents.paperless.syncStatus");
  const { data, error } = useApiQuery<SyncStatus>("paperless-sync-status", "/api/integrations/paperless/sync/status", {
    // Pending documents turn into synced ones in the background.
    refetchInterval: (query) => ((query.state.data?.pending ?? 0) > 0 ? 10_000 : false),
  });

  // Integration off (404) or no read permission: nothing to show.
  if (error || !data) return null;

  const felder = [
    { key: "synced", wert: data.synced, klasse: "text-green-700 dark:text-green-400" },
    { key: "pending", wert: data.pending, klasse: data.pending > 0 ? "text-amber-600" : "" },
    { key: "failed", wert: data.failed, klasse: data.failed > 0 ? "text-destructive" : "" },
    { key: "notSynced", wert: data.notSynced, klasse: "" },
  ] as const;

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
        {felder.map((f) => (
          <div key={f.key}>
            <p className="text-sm text-muted-foreground">{t(f.key)}</p>
            <p className={`text-2xl font-semibold tabular-nums ${f.klasse}`}>
              {f.wert.toLocaleString("de-DE")}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
