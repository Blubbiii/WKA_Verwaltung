"use client";

/**
 * F-2 Sprint 4: CPI/Wertsicherungs-Reminder-Widget.
 *
 * Zeigt überfällige + demnächst fällige Pacht-Indexierungen (§9 PrKG).
 * Standalone-Komponente — kann in Dashboard, Leases-Page oder
 * Buchhaltungs-Übersicht eingebunden werden.
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
import { AlertTriangle, Calendar, FileText } from "lucide-react";

interface CpiDueRow {
  leaseId: string;
  lessorName: string;
  startDate: string;
  cpiAdjustmentMonths: number;
  cpiLastAdjustedAt: string | null;
  nextDueDate: string;
  daysOverdue: number;
}

interface CpiDueResponse {
  data: CpiDueRow[];
  total: number;
  overdueCount: number;
}

export function CpiReminderWidget({ horizonDays = 90 }: { horizonDays?: number }) {
  const t = useTranslations("cpi");
  const [data, setData] = useState<CpiDueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leases/cpi-due?horizonDays=${horizonDays}`)
      .then((r) => {
        if (!r.ok) throw new Error(t("loadError"));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : t("unknownError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizonDays, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          {t("title")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("subtitle", { days: horizonDays })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !data || data.total === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            {t("noneDue")}
          </div>
        ) : (
          <div className="space-y-3">
            {data.overdueCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("overdueAlert", { count: data.overdueCount })}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              {data.data.slice(0, 8).map((row) => {
                const overdue = row.daysOverdue > 0;
                return (
                  <Link
                    key={row.leaseId}
                    href={`/leases/${row.leaseId}`}
                    className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{row.lessorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("intervalMonths", { months: row.cpiAdjustmentMonths })} ·{" "}
                        {row.cpiLastAdjustedAt
                          ? t("lastAdjusted", {
                              date: new Date(row.cpiLastAdjustedAt).toLocaleDateString("de-DE"),
                            })
                          : t("neverAdjusted")}
                      </div>
                    </div>
                    <Badge variant={overdue ? "destructive" : "default"}>
                      {overdue
                        ? t("overdueBadge", { days: row.daysOverdue })
                        : new Date(row.nextDueDate).toLocaleDateString("de-DE")}
                    </Badge>
                  </Link>
                );
              })}
            </div>
            {data.total > 8 && (
              <Link
                href="/leases?cpiDue=1"
                className="flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                {t("viewAll", { count: data.total })}
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
