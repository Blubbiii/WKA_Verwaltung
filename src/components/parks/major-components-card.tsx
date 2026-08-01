"use client";

/**
 * Grosskomponenten-Register einer Anlage oder eines Parks.
 *
 * B3 (Audit 2026-07): „0 Treffer für Ersatzteil/Komponente."
 *
 * ## Warum Gewährleistung und Tauschhistorie im Vordergrund stehen
 *
 * Zwei Fragen kosten Geld, wenn sie zu spät gestellt werden: „läuft die
 * Gewährleistung noch" (danach trägt der Betreiber den Schaden) und „das
 * wievielte Getriebe ist das" (der Gutachter fragt es beim Verkauf). Die
 * rechnerische Restdauer ist demgegenüber eine Planungsgrösse — sie steht
 * dabei, aber nicht obenan.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Cog, ShieldAlert, ShieldCheck } from "lucide-react";
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
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ComponentLifetime } from "@/lib/components/lifetime";

interface ComponentRow {
  id: string;
  type: string;
  position: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedAt: string | null;
  removedAt: string | null;
  removalReason: string | null;
  designLifeYears: number | null;
  warrantyEndDate: string | null;
  warrantyProvider: string | null;
  costEur: string | null;
  turbine: {
    id: string;
    designation: string;
    park: { id: string; name: string; shortName: string | null };
  };
  vendor: { id: string; name: string } | null;
  replacedBy: { id: string; installedAt: string | null; serialNumber: string | null } | null;
  replaces: { id: string; removedAt: string | null; serialNumber: string | null } | null;
  lifetime: ComponentLifetime;
}

interface Response {
  data: ComponentRow[];
  positionProblems: { turbineId: string; designation: string; problems: string[] }[];
}

export function MajorComponentsCard({
  turbineId,
  parkId,
}: {
  turbineId?: string;
  parkId?: string;
}) {
  const t = useTranslations("majorComponents");
  const [includeRemoved, setIncludeRemoved] = useState(false);

  const query = new URLSearchParams();
  if (turbineId) query.set("turbineId", turbineId);
  if (parkId) query.set("parkId", parkId);
  if (includeRemoved) query.set("includeRemoved", "true");

  const { data, isLoading } = useApiQuery<Response>(
    ["major-components", query.toString()],
    `/api/components?${query.toString()}`,
  );

  const components = data?.data ?? [];
  const problems = data?.positionProblems ?? [];

  // Die drei Zahlen, die den Blick lenken. „Keine Gewährleistung erfasst" ist
  // bewusst NICHT unter „abgelaufen" mitgezählt — es ist eine Wissenslücke,
  // kein Zustand.
  const expired = components.filter(
    (c) => !c.removedAt && c.lifetime.warranty === "EXPIRED",
  ).length;
  const expiring = components.filter(
    (c) =>
      !c.removedAt &&
      c.lifetime.warranty === "ACTIVE" &&
      c.lifetime.warrantyDaysLeft !== null &&
      c.lifetime.warrantyDaysLeft <= 180,
  ).length;
  const unknownWarranty = components.filter(
    (c) => !c.removedAt && c.lifetime.warranty === "NONE",
  ).length;

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
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Cog className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
          {expired > 0 && (
            <Badge variant="destructive">{t("warrantyExpired", { count: expired })}</Badge>
          )}
          {expiring > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("warrantyExpiring", { count: expiring })}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setIncludeRemoved((current) => !current)}
          >
            {includeRemoved ? t("hideHistory") : t("showHistory")}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Zwei eingebaute Getriebe sind fast immer ein vergessener Ausbau. */}
        {problems.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("positionProblems")}
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              {problems.flatMap((entry) =>
                entry.problems.map((problem) => (
                  <li key={`${entry.turbineId}-${problem}`}>
                    {entry.designation}: {problem}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        {unknownWarranty > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("unknownWarranty", { count: unknownWarranty })}
          </p>
        )}

        {components.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.component")}</TableHead>
                  {!turbineId && <TableHead>{t("table.turbine")}</TableHead>}
                  <TableHead>{t("table.serial")}</TableHead>
                  <TableHead>{t("table.installed")}</TableHead>
                  <TableHead className="text-right">{t("table.age")}</TableHead>
                  <TableHead>{t("table.warranty")}</TableHead>
                  <TableHead className="text-right">{t("table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((component) => (
                  <TableRow key={component.id} className={component.removedAt ? "opacity-60" : ""}>
                    <TableCell className="text-xs">
                      {t(`types.${component.type}`)}
                      {component.position && (
                        <span className="text-muted-foreground"> {component.position}</span>
                      )}
                      {component.manufacturer && (
                        <>
                          <br />
                          <span className="text-muted-foreground">
                            {component.manufacturer}
                            {component.model ? ` ${component.model}` : ""}
                          </span>
                        </>
                      )}
                      {component.removedAt && (
                        <>
                          <br />
                          <Badge variant="outline" className="mt-1 text-xs">
                            {t("removedOn", {
                              date: formatDate(new Date(component.removedAt)),
                            })}
                            {component.removalReason
                              ? ` · ${t(`removalReasons.${component.removalReason}`)}`
                              : ""}
                          </Badge>
                        </>
                      )}
                    </TableCell>
                    {!turbineId && (
                      <TableCell className="text-xs">
                        {component.turbine.designation}
                        <br />
                        <span className="text-muted-foreground">
                          {component.turbine.park.shortName || component.turbine.park.name}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">
                      {component.serialNumber ?? <span className="font-sans">–</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {component.installedAt
                        ? formatDate(new Date(component.installedAt))
                        : "–"}
                      {/* Die Tauschkette: „das dritte Getriebe" ohne Nachzählen. */}
                      {component.replaces && (
                        <>
                          <br />
                          <span className="text-muted-foreground">{t("isReplacement")}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {component.lifetime.ageYears !== null ? (
                        <>
                          {component.lifetime.ageYears.toFixed(1).replace(".", ",")} {t("years")}
                          {component.lifetime.consumedRatio !== null && !component.removedAt && (
                            <>
                              <br />
                              <span
                                className={
                                  component.lifetime.consumedRatio >= 0.8
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                                }
                              >
                                {t("consumed", {
                                  percent: Math.round(component.lifetime.consumedRatio * 100),
                                })}
                              </span>
                            </>
                          )}
                          {component.lifetime.consumedRatio === null && !component.removedAt && (
                            // Ausdrücklich, statt eine Restdauer zu erfinden.
                            <>
                              <br />
                              <span className="text-muted-foreground">{t("noDesignLife")}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("noInstallDate")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <WarrantyCell component={component} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {component.costEur ? formatCurrency(Number(component.costEur)) : "–"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("designLifeHint")}</p>
      </CardContent>
    </Card>
  );
}

function WarrantyCell({ component }: { component: ComponentRow }) {
  const t = useTranslations("majorComponents");
  const { warranty, warrantyDaysLeft } = component.lifetime;

  if (component.removedAt) {
    return <span className="text-muted-foreground">–</span>;
  }

  if (warranty === "NONE") {
    // Nicht als „abgelaufen" darstellen — das wäre eine Behauptung über etwas,
    // das nie erfasst wurde.
    return <span className="text-muted-foreground">{t("warrantyNone")}</span>;
  }

  if (warranty === "EXPIRED") {
    return (
      <span className="flex items-center gap-1 text-destructive">
        <ShieldAlert className="h-3 w-3" aria-hidden />
        {t("warrantyEnded", {
          date: formatDate(new Date(component.warrantyEndDate!)),
        })}
      </span>
    );
  }

  const soon = warrantyDaysLeft !== null && warrantyDaysLeft <= 180;
  return (
    <span className={soon ? "flex items-center gap-1 text-amber-600" : "flex items-center gap-1"}>
      <ShieldCheck className="h-3 w-3" aria-hidden />
      {formatDate(new Date(component.warrantyEndDate!))}
      {soon && ` · ${t("daysLeft", { days: warrantyDaysLeft })}`}
    </span>
  );
}
