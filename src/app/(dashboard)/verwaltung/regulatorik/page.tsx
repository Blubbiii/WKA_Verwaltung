"use client";

/**
 * Regulatorik-Stammdaten und Meldefristen.
 *
 * B2 (Audit 2026-07): `mastrNumber` war ein ungeprüftes Freitextfeld, sonst
 * nichts — kein EEG-Anlagenschlüssel, kein Registrierungsstatus, kein
 * Zuschlagswert, kein Fristenset.
 *
 * ## Warum die Fristen oben stehen und die Stammdaten darunter
 *
 * Die Stammdaten pflegt man einmal, die Fristen schaut man wöchentlich an. Eine
 * fehlende MaStR-Registrierung kostet den Zahlungsanspruch (§ 52 Abs. 1 EEG),
 * eine versäumte Standortgüte-Nachprüfung eine Rückforderung — beides fällt
 * niemandem von selbst auf.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import { deadlineUrgency } from "@/lib/regulatory/deadline-rules";
import { RegulatoryProfileDialog } from "@/components/parks/regulatory-profile-dialog";

interface ParkRef {
  id: string;
  name: string;
  shortName: string | null;
}

export interface RegulatoryProfile {
  id: string;
  mastrUnitNumber: string | null;
  mastrPlantNumber: string | null;
  mastrStatus: "NOT_REGISTERED" | "PENDING" | "REGISTERED" | "DECOMMISSIONED";
  mastrRegisteredAt: string | null;
  lastChangeAt: string | null;
  lastChangeReportedAt: string | null;
  eegPlantKey: string | null;
  scheme: "FIXED_FEED_IN" | "MARKET_PREMIUM" | "TENDER_AWARD" | "OUTSIDE_EEG" | "UNKNOWN";
  awardValueCtPerKwh: string | null;
  awardDate: string | null;
  awardReference: string | null;
  siteQualityPercent: string | null;
  gridOperator: string | null;
  gridConnectionDate: string | null;
  annualReportDay: string | null;
  notes: string | null;
}

export interface TurbineRow {
  id: string;
  designation: string;
  commissioningDate: string | null;
  mastrNumber: string | null;
  park: ParkRef;
  regulatoryProfile: RegulatoryProfile | null;
  complianceDeadlines: {
    id: string;
    kind: string;
    dueDate: string;
    basis: string;
    operatingYear: number | null;
  }[];
}

interface Deadline {
  id: string;
  kind: string;
  status: string;
  dueDate: string;
  basis: string;
  operatingYear: number | null;
  reference: string | null;
  turbine: { id: string; designation: string; park: ParkRef } | null;
  park: ParkRef | null;
}

export default function RegulatoryPage() {
  const t = useTranslations("regulatory");
  const invalidate = useInvalidateQuery();

  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState<TurbineRow | null>(null);

  const { data: deadlinesData, isLoading: deadlinesLoading } = useApiQuery<{ data: Deadline[] }>(
    ["regulatory-deadlines"],
    "/api/regulatory/deadlines",
  );
  const deadlines = deadlinesData?.data ?? [];

  const { data: turbinesData, isLoading: turbinesLoading } = useApiQuery<{ data: TurbineRow[] }>(
    ["regulatory-profiles"],
    "/api/regulatory/profiles",
  );
  const turbines = turbinesData?.data ?? [];

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/regulatory/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonYears: 2 }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("generateError"));

      invalidate(["regulatory-deadlines"]);
      invalidate(["regulatory-profiles"]);

      // Welche Anlagen uebergangen wurden, gehoert dazu — sonst liest sich
      // „12 erzeugt" wie Vollstaendigkeit.
      if (result.turbinesWithoutProfile?.length > 0) {
        toast.warning(t("generated", { created: result.created, skipped: result.skipped }), {
          description: t("withoutProfile", {
            count: result.turbinesWithoutProfile.length,
            names: result.turbinesWithoutProfile.slice(0, 5).join(", "),
          }),
          duration: 15_000,
        });
      } else {
        toast.success(t("generated", { created: result.created, skipped: result.skipped }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("generateError"));
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(deadline: Deadline, status: "DONE" | "NOT_APPLICABLE") {
    setUpdating(deadline.id);
    try {
      const res = await fetch("/api/regulatory/deadlines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deadline.id, status }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("updateError"));
      invalidate(["regulatory-deadlines"]);
      invalidate(["regulatory-profiles"]);
      toast.success(status === "DONE" ? t("markedDone") : t("markedNotApplicable"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("updateError"));
    } finally {
      setUpdating(null);
    }
  }

  const now = new Date();
  const overdue = deadlines.filter((d) => deadlineUrgency(new Date(d.dueDate), now) === "overdue");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button size="sm" onClick={() => void generate()} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("generate")}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            {t("deadlinesTitle")}
            <InfoTooltip text={t("deadlinesTooltip")} />
            {overdue.length > 0 && (
              <Badge variant="destructive">{t("overdueCount", { count: overdue.length })}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deadlinesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : deadlines.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={t("noDeadlines")}
              description={t("noDeadlinesHint")}
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.due")}</TableHead>
                    <TableHead>{t("table.kind")}</TableHead>
                    <TableHead>{t("table.subject")}</TableHead>
                    <TableHead>{t("table.basis")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadlines.map((deadline) => {
                    const urgency = deadlineUrgency(new Date(deadline.dueDate), now);
                    return (
                      <TableRow key={deadline.id}>
                        <TableCell className="text-xs">
                          <span
                            className={
                              urgency === "overdue"
                                ? "font-medium text-destructive"
                                : urgency === "urgent"
                                  ? "font-medium text-amber-600"
                                  : ""
                            }
                          >
                            {new Date(deadline.dueDate).toLocaleDateString("de-DE")}
                          </span>
                          {urgency === "overdue" && (
                            <>
                              <br />
                              <span className="text-destructive">{t("overdue")}</span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {t(`kinds.${deadline.kind}`)}
                          {deadline.operatingYear !== null && (
                            <span className="text-muted-foreground"> · {deadline.operatingYear}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {deadline.turbine
                            ? `${deadline.turbine.designation} (${
                                deadline.turbine.park.shortName || deadline.turbine.park.name
                              })`
                            : (deadline.park?.name ?? "–")}
                        </TableCell>
                        {/* Die Rechtsgrundlage steht in der Zeile, damit niemand
                            nachschlagen muss, warum dieser Termin gilt. */}
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {deadline.basis}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updating === deadline.id}
                              onClick={() => void setStatus(deadline, "DONE")}
                            >
                              {updating === deadline.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              <span className="ml-1">{t("markDone")}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updating === deadline.id}
                              title={t("notApplicableHint")}
                              onClick={() => void setStatus(deadline, "NOT_APPLICABLE")}
                            >
                              {t("notApplicable")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="h-5 w-5" />
            {t("profilesTitle")}
            <InfoTooltip text={t("profilesTooltip")} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {turbinesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : turbines.length === 0 ? (
            <EmptyState icon={AlertTriangle} title={t("noTurbines")} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.turbine")}</TableHead>
                    <TableHead>{t("table.mastr")}</TableHead>
                    <TableHead>{t("table.eegKey")}</TableHead>
                    <TableHead>{t("table.scheme")}</TableHead>
                    <TableHead>{t("table.gridOperator")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {turbines.map((turbine) => {
                    const profile = turbine.regulatoryProfile;
                    return (
                      <TableRow key={turbine.id}>
                        <TableCell className="text-xs">
                          {turbine.designation}
                          <br />
                          <span className="text-muted-foreground">
                            {turbine.park.shortName || turbine.park.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {profile?.mastrUnitNumber ? (
                            <span className="font-mono">{profile.mastrUnitNumber}</span>
                          ) : turbine.mastrNumber ? (
                            // Das alte Freitextfeld. Es bleibt sichtbar, aber
                            // ausdrücklich als ungeprüft benannt — sonst sähe es
                            // aus wie ein gepflegter Stand.
                            <span className="text-amber-600">
                              {turbine.mastrNumber}
                              <br />
                              <span className="text-xs">{t("legacyField")}</span>
                            </span>
                          ) : (
                            <span className="text-destructive">{t("noMastr")}</span>
                          )}
                          {profile && (
                            <>
                              <br />
                              <Badge
                                variant={
                                  profile.mastrStatus === "REGISTERED" ? "secondary" : "outline"
                                }
                                className="mt-1 text-xs"
                              >
                                {t(`mastrStatuses.${profile.mastrStatus}`)}
                              </Badge>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {profile?.eegPlantKey ?? <span className="font-sans">–</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {profile ? t(`schemes.${profile.scheme}`) : "–"}
                          {profile?.awardValueCtPerKwh && (
                            <>
                              <br />
                              <span className="text-muted-foreground tabular-nums">
                                {Number(profile.awardValueCtPerKwh).toFixed(2).replace(".", ",")}{" "}
                                ct/kWh
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{profile?.gridOperator ?? "–"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setEditing(turbine)}>
                            {profile ? t("edit") : t("create")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RegulatoryProfileDialog
        turbine={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidate(["regulatory-profiles"]);
          invalidate(["regulatory-deadlines"]);
          setEditing(null);
        }}
      />
    </div>
  );
}
