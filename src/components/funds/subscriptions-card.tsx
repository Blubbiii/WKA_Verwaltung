"use client";

/**
 * Zeichnungen einer Gesellschaft mit Frist-, Zahlungs- und GwG-Stand.
 *
 * B6 (Audit 2026-07).
 *
 * ## Warum der Annehmen-Knopf gesperrt ist statt zu warnen
 *
 * Ohne abgeschlossene Legitimation darf nicht angenommen werden (§ 10 Abs. 1
 * Nr. 1, § 11 Abs. 1 GwG). Ein Knopf, der geht und danach einen Fehler zeigt,
 * lädt zum Wiederholen ein; ein gesperrter Knopf mit dem Grund im Titel sagt,
 * was zu tun ist. Der Server weist es zusätzlich ab — die Sperre hier ist die
 * Bequemlichkeit, nicht die Sicherung.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, FileSignature, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
import { formatCurrency } from "@/lib/format";

interface Subscription {
  id: string;
  subscriptionNumber: string;
  status: string;
  amountEur: string;
  agioPercent: string;
  signedAt: string | null;
  paidEur: string;
  paymentDueDate: string | null;
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
  withdrawal: {
    deadline: string | null;
    isRunning: boolean | null;
    daysLeft: number | null;
    statement: string;
  };
  payment: {
    dueEur: number;
    paidEur: number;
    openEur: number;
    isSettled: boolean;
    daysOverdue: number | null;
    statement: string;
    warnings: string[];
  };
  aml: {
    isValid: boolean;
    reviewDue: boolean;
    reviewInDays: number | null;
    problems: string[];
    warnings: string[];
    statement: string;
  };
  acceptance: { canAccept: boolean; blockers: string[]; warnings: string[] };
}

function personName(person: Subscription["person"]): string {
  return (
    person.companyName || [person.firstName, person.lastName].filter(Boolean).join(" ") || "–"
  );
}

export function SubscriptionsCard({ fundId }: { fundId: string }) {
  const t = useTranslations("subscriptions");
  const invalidate = useInvalidateQuery();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery<{ data: Subscription[] }>(
    ["subscriptions", fundId],
    `/api/subscriptions?fundId=${fundId}`,
  );
  const subscriptions = data?.data ?? [];

  async function accept(subscription: Subscription) {
    setBusy(subscription.id);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("acceptError"));

      invalidate(["subscriptions", fundId]);

      if (result.warnings?.length > 0) {
        // Vor allem der Hinweis zur laufenden Widerrufsfrist — das Geld darf
        // bis dahin nicht verplant werden.
        toast.warning(t("accepted", { number: subscription.subscriptionNumber }), {
          description: result.warnings.slice(0, 2).join(" · "),
          duration: 15_000,
        });
      } else {
        toast.success(t("accepted", { number: subscription.subscriptionNumber }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("acceptError"), { duration: 15_000 });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const missingAml = subscriptions.filter(
    (entry) => !entry.aml.isValid && entry.status !== "WITHDRAWN" && entry.status !== "REJECTED",
  ).length;
  const openPayments = subscriptions.filter(
    (entry) => !entry.payment.isSettled && entry.status === "ACCEPTED",
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <FileSignature className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
          {missingAml > 0 && (
            <Badge variant="destructive">{t("missingAml", { count: missingAml })}</Badge>
          )}
          {openPayments > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("openPayments", { count: openPayments })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {subscriptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.subscription")}</TableHead>
                  <TableHead className="text-right">{t("table.amount")}</TableHead>
                  <TableHead>{t("table.withdrawal")}</TableHead>
                  <TableHead>{t("table.aml")}</TableHead>
                  <TableHead>{t("table.payment")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="text-xs">
                      <span className="font-mono">{subscription.subscriptionNumber}</span>
                      <br />
                      {personName(subscription.person)}
                      <br />
                      <Badge variant="outline" className="mt-1 text-xs">
                        {t(`statuses.${subscription.status}`)}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(Number(subscription.amountEur))}
                      {Number(subscription.agioPercent) > 0 && (
                        <>
                          <br />
                          <span className="text-muted-foreground">
                            {t("plusAgio", {
                              percent: Number(subscription.agioPercent)
                                .toFixed(2)
                                .replace(".", ","),
                            })}
                          </span>
                        </>
                      )}
                    </TableCell>

                    <TableCell className="max-w-48 text-xs">
                      {subscription.withdrawal.deadline === null &&
                      subscription.withdrawal.isRunning ? (
                        // Ohne Belehrung laeuft die Frist nicht an — das ist
                        // der gefaehrlichere Zustand, nicht der harmlosere.
                        <span className="text-destructive">{t("noInstruction")}</span>
                      ) : subscription.withdrawal.isRunning ? (
                        <span className="text-amber-600">
                          {t("daysLeft", { days: subscription.withdrawal.daysLeft ?? 0 })}
                        </span>
                      ) : subscription.withdrawal.isRunning === false ? (
                        <span className="text-muted-foreground">{t("withdrawalExpired")}</span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>

                    <TableCell className="max-w-56 text-xs">
                      {subscription.aml.isValid ? (
                        <span className="flex items-center gap-1">
                          <BadgeCheck className="h-3 w-3" aria-hidden />
                          {subscription.aml.reviewDue ? (
                            <span className="text-amber-600">
                              {t("reviewDue", { days: subscription.aml.reviewInDays ?? 0 })}
                            </span>
                          ) : (
                            t("amlValid")
                          )}
                        </span>
                      ) : (
                        <span className="flex items-start gap-1 text-destructive">
                          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {subscription.aml.problems[0] ?? t("amlMissing")}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="max-w-48 text-xs">
                      {subscription.payment.isSettled ? (
                        <span className="text-muted-foreground">{t("paid")}</span>
                      ) : (
                        <span
                          className={
                            subscription.payment.daysOverdue &&
                            subscription.payment.daysOverdue > 0
                              ? "text-destructive"
                              : ""
                          }
                        >
                          {t("openOf", {
                            open: formatCurrency(subscription.payment.openEur),
                            due: formatCurrency(subscription.payment.dueEur),
                          })}
                          {subscription.payment.daysOverdue !== null &&
                            subscription.payment.daysOverdue > 0 && (
                              <>
                                <br />
                                {t("overdue", { days: subscription.payment.daysOverdue })}
                              </>
                            )}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {subscription.status === "SIGNED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === subscription.id || !subscription.acceptance.canAccept}
                          // Der Grund steht am Knopf. Ein Knopf, der geht und
                          // danach einen Fehler zeigt, laedt zum Wiederholen ein.
                          title={
                            subscription.acceptance.canAccept
                              ? undefined
                              : subscription.acceptance.blockers.join(" · ")
                          }
                          onClick={() => void accept(subscription)}
                        >
                          {busy === subscription.id ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : null}
                          {t("accept")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {t("amlHint")}
        </p>
      </CardContent>
    </Card>
  );
}
