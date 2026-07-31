"use client";

/**
 * Gesellschafterversammlungen einer Gesellschaft.
 *
 * B4 (Audit 2026-07): „rechtlich heikel wenn schlecht dokumentiert."
 *
 * ## Was diese Karte zeigt, das sonst niemand sieht
 *
 * Die **Ladungsfrist** und die **Beschlussfähigkeit** — die beiden Punkte, an
 * denen eine Versammlung kippt. Ein Beschluss aus einer zu kurz geladenen
 * Versammlung ist anfechtbar, und das fällt sonst erst auf, wenn ihn jemand
 * angreift. Deshalb stehen beide als Satz da und nicht als Häkchen: der Satz
 * lässt sich ins Protokoll übernehmen.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  Send,
  Users,
} from "lucide-react";
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

interface AgendaItem {
  id: string;
  position: number;
  title: string;
  requiresResolution: boolean;
  requiredMajorityPercent: string;
  majorityBase: "VOTES_CAST" | "CAPITAL_PRESENT" | "CAPITAL_TOTAL";
  outcome: "ADOPTED" | "REJECTED" | "DEFERRED" | "NO_RESOLUTION" | null;
  achievedPercent: string | null;
  resultStatement: string | null;
}

interface Meeting {
  id: string;
  meetingNumber: string;
  type: string;
  status: string;
  scheduledAt: string;
  location: string | null;
  isVirtual: boolean;
  invitationSentAt: string | null;
  noticePeriodDays: number;
  noticeWaivedByAll: boolean;
  quorumPercent: string | null;
  chairperson: string | null;
  agendaItems: AgendaItem[];
  attendance: { id: string; presence: string; sharePercent: string }[];
  attendanceSummary: {
    representedPercent: number;
    presentPercent: number;
    proxyPercent: number;
    headsPresent: number;
    headsRepresented: number;
    headsTotal: number;
    warnings: string[];
  };
  quorum: { isQuorate: boolean; statement: string; warnings: string[] };
  notice: { compliant: boolean; statement: string; warnings: string[] };
}

export function MeetingsCard({ fundId }: { fundId: string }) {
  const t = useTranslations("meetings");
  const invalidate = useInvalidateQuery();
  const [sending, setSending] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery<{ data: Meeting[] }>(
    ["meetings", fundId],
    `/api/meetings?fundId=${fundId}`,
  );
  const meetings = data?.data ?? [];

  async function markInvited(meeting: Meeting) {
    setSending(meeting.id);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationSentAt: new Date().toISOString().slice(0, 10) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("updateError"));
      invalidate(["meetings", fundId]);

      // Der Fristenhinweis geht sofort raus, nicht erst beim Protokollieren —
      // dann liesse sich nichts mehr daran ändern.
      if (!result.notice?.compliant) {
        toast.warning(t("noticeShort"), {
          description: result.notice?.statement,
          duration: 15_000,
        });
      } else {
        toast.success(t("invitationRecorded"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("updateError"));
    } finally {
      setSending(null);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {meetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          meetings.map((meeting) => (
            <div key={meeting.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{meeting.meetingNumber}</span>
                <span className="text-sm font-medium">
                  {new Date(meeting.scheduledAt).toLocaleDateString("de-DE")}
                </span>
                <Badge variant="outline" className="text-xs">
                  {t(`types.${meeting.type}`)}
                </Badge>
                <Badge
                  variant={meeting.status === "MINUTED" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {t(`statuses.${meeting.status}`)}
                </Badge>
                {meeting.isVirtual && (
                  <Badge variant="outline" className="text-xs">
                    {t("virtual")}
                  </Badge>
                )}
                {meeting.status === "DRAFT" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={sending === meeting.id}
                    onClick={() => void markInvited(meeting)}
                  >
                    {sending === meeting.id ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-3 w-3" />
                    )}
                    {t("markInvited")}
                  </Button>
                )}
              </div>

              {/* Die beiden Saetze, an denen die Versammlung haengt. Sie stehen
                  als Text da, damit sie sich ins Protokoll uebernehmen lassen. */}
              <div className="mt-3 space-y-2">
                <Statement ok={meeting.notice.compliant} text={meeting.notice.statement} />
                <Statement ok={meeting.quorum.isQuorate} text={meeting.quorum.statement} />
                {[...meeting.notice.warnings, ...meeting.quorum.warnings].map((warning) => (
                  <p key={warning} className="flex items-start gap-1 text-xs text-amber-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {warning}
                  </p>
                ))}
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <Figure
                  label={t("present")}
                  value={`${fmt(meeting.attendanceSummary.presentPercent)} % · ${meeting.attendanceSummary.headsPresent}`}
                />
                <Figure
                  label={t("represented")}
                  value={`${fmt(meeting.attendanceSummary.proxyPercent)} % · ${meeting.attendanceSummary.headsRepresented}`}
                />
                <Figure
                  label={t("totalRepresented")}
                  value={`${fmt(meeting.attendanceSummary.representedPercent)} % von ${meeting.attendanceSummary.headsTotal}`}
                />
              </div>

              {meeting.agendaItems.length > 0 && (
                <div className="mt-3 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">{t("table.position")}</TableHead>
                        <TableHead>{t("table.item")}</TableHead>
                        <TableHead>{t("table.majority")}</TableHead>
                        <TableHead>{t("table.outcome")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meeting.agendaItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs tabular-nums">{item.position}</TableCell>
                          <TableCell className="text-xs">{item.title}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.requiresResolution
                              ? `${fmt(Number(item.requiredMajorityPercent))} % ${t(`bases.${item.majorityBase}`)}`
                              : t("noResolutionNeeded")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.outcome === null ? (
                              // Ausdruecklich offen und nicht "abgelehnt".
                              <span className="text-muted-foreground">{t("outcomeOpen")}</span>
                            ) : (
                              <Badge
                                variant={
                                  item.outcome === "ADOPTED"
                                    ? "secondary"
                                    : item.outcome === "REJECTED"
                                      ? "destructive"
                                      : "outline"
                                }
                                className="text-xs"
                                title={item.resultStatement ?? undefined}
                              >
                                {t(`outcomes.${item.outcome}`)}
                                {item.achievedPercent !== null &&
                                  ` · ${fmt(Number(item.achievedPercent))} %`}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ))
        )}

        <p className="text-xs text-muted-foreground">{t("baseHint")}</p>
      </CardContent>
    </Card>
  );
}

function Statement({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p
      className={
        ok ? "flex items-start gap-1 text-xs" : "flex items-start gap-1 text-xs text-destructive"
      }
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <CalendarCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      )}
      {text}
    </p>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function fmt(value: number): string {
  return value.toFixed(2).replace(".", ",").replace(/,00$/, "");
}
