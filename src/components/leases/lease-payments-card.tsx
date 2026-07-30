"use client";

/**
 * Zahlungen eines Pachtvertrags auf dessen Detailseite.
 *
 * Bedienaufwand #13 (Audit 2026-07): Die Detailseite hatte Karten für
 * Flurstücke, Verpächter, Laufzeit, Konditionen, Notizen, Aktivitäten und
 * Upload — nichts zu Zahlungen. Wer wissen wollte, ob die Pacht überwiesen ist,
 * musste nach `/leases/payments` wechseln, dort den Park erraten und die
 * Gesamtliste durchscrollen. Laut Audit die häufigste Rückfrage von
 * Grundstückseigentümern.
 *
 * Die Zahlungen sind KEINE eigene Tabelle: `/api/leases/payments` leitet sie
 * aus Pachtzins, Zahlungsrhythmus und den zugeordneten Rechnungen ab. Deshalb
 * fragt diese Karte dieselbe Route mit `leaseId` ab, statt eine zweite
 * Herleitung zu bauen — zwei Herleitungen desselben Sachverhalts driften
 * auseinander.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatCurrency } from "@/lib/format";

interface Payment {
  id: string;
  leaseId: string;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  invoiceId: string | null;
  invoiceNumber: string | null;
}

interface Summary {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
}

interface PaymentsResponse {
  data: Payment[];
  summary: Summary;
}

const STATUS_STYLE: Record<Payment["status"], { icon: React.ElementType; className: string }> = {
  paid: { icon: CheckCircle2, className: "border-green-300 text-green-700 dark:text-green-400" },
  pending: { icon: Clock, className: "border-yellow-300 text-yellow-700 dark:text-yellow-400" },
  overdue: { icon: AlertTriangle, className: "border-red-300 text-red-700 dark:text-red-400" },
};

/** Wie viele Fälligkeiten in der Karte stehen, bevor auf die Liste verwiesen wird. */
const VISIBLE_ROWS = 6;

export function LeasePaymentsCard({ leaseId }: { leaseId: string }) {
  const t = useTranslations("leases.detail.payments");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;

  const [year, setYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, error } = useQuery<PaymentsResponse>({
    queryKey: ["/api/leases/payments", leaseId, year],
    queryFn: async () => {
      const res = await fetch(`/api/leases/payments?leaseId=${leaseId}&year=${year}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });

  // Die Route liefert alle Verträge des Mandanten, wenn leaseId nicht greift.
  // Hier zur Sicherheit nachfiltern — sonst zeigte die Karte fremde Zahlungen.
  const payments = (data?.data ?? []).filter((p) => p.leaseId === leaseId);
  const visible = payments.slice(0, VISIBLE_ROWS);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-5 w-5" />
          {t("title")}
          <InfoTooltip text={t("tooltip")} />
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((y) => y - 1)}
            aria-label={t("previousYear")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-14 text-center text-sm font-medium tabular-nums">{year}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((y) => y + 1)}
            aria-label={t("nextYear")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{t("loadError")}</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyYear", { year })}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label={t("summaryTotal")} value={formatCurrency(data?.summary.total ?? 0)} />
              <Figure label={t("summaryPaid")} value={formatCurrency(data?.summary.paid ?? 0)} />
              <Figure label={t("summaryPending")} value={formatCurrency(data?.summary.pending ?? 0)} />
              <Figure
                label={t("summaryOverdue")}
                value={formatCurrency(data?.summary.overdue ?? 0)}
                highlight={(data?.summary.overdue ?? 0) > 0}
              />
            </div>

            <div className="divide-y rounded-md border">
              {visible.map((payment) => {
                const style = STATUS_STYLE[payment.status];
                const StatusIcon = style.icon;
                return (
                  <div key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="text-sm tabular-nums">
                        {format(new Date(payment.dueDate), "dd.MM.yyyy", { locale: dateLocale })}
                      </span>
                      {payment.invoiceId && (
                        <Link
                          href={`/invoices/${payment.invoiceId}`}
                          className="truncate text-xs text-primary hover:underline"
                        >
                          {payment.invoiceNumber ?? t("openInvoice")}
                        </Link>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(payment.amount)}
                      </span>
                      <Badge variant="outline" className={style.className}>
                        <StatusIcon className="mr-1 h-3 w-3" aria-hidden />
                        {t(`status.${payment.status}`)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              {payments.length > VISIBLE_ROWS ? (
                <span className="text-xs text-muted-foreground">
                  {t("moreRows", { count: payments.length - VISIBLE_ROWS })}
                </span>
              ) : (
                <span />
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/leases/payments?leaseId=${leaseId}`}>
                  {t("openAll")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium tabular-nums ${highlight ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}
