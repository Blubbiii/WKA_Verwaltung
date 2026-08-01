"use client";

/**
 * Rückbauverpflichtung und Rückbausicherheit am Park.
 *
 * A7 (Audit 2026-07). Die Karte macht zwei Dinge sichtbar, die sonst niemand
 * sieht:
 *
 * 1. **Die Bürgschaft läuft still ab.** Sie liegt im Aktenordner, die
 *    Genehmigungsauflage verlangt sie, und niemand bekommt eine Erinnerung.
 *    Deshalb steht der Ablauf ganz oben und nicht in einer Detailzeile.
 * 2. **Handels- und Steuerbilanz kommen zu verschiedenen Beträgen**, und beide
 *    sind richtig. Sie nebeneinander zu zeigen ist der ganze Punkt — eine
 *    einzelne Zahl wäre die Hälfte der Wahrheit.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Hammer, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
import { formatCurrency, formatDate } from "@/lib/format";

interface Provision {
  id: string;
  year: number;
  hgbProvisionEur: string;
  hgbAdditionEur: string | null;
  taxProvisionEur: string;
  taxAdditionEur: string | null;
  differenceEur: string;
  hgbDiscountRatePercent: string | null;
  accrualRatio: string;
  remainingYears: number;
}

interface SecurityCheck {
  shortfallEur: number;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  expiresSoon: boolean;
  problems: string[];
}

interface Obligation {
  id: string;
  estimatedCostTodayEur: string;
  costEstimateDate: string | null;
  costEstimateSource: string | null;
  dismantlingYear: number;
  costInflationPercent: string;
  requiredSecurityEur: string | null;
  providedSecurityEur: string | null;
  securityType: string | null;
  securityProvider: string | null;
  securityValidTo: string | null;
  provisions: Provision[];
  securityCheck: SecurityCheck;
}

export function DismantlingCard({ parkId }: { parkId: string }) {
  const t = useTranslations("dismantling");
  const invalidate = useInvalidateQuery();

  const { data, isLoading } = useApiQuery<{ data: Obligation[] }>(
    ["dismantling", parkId],
    `/api/dismantling?parkId=${parkId}`,
  );
  const obligation = data?.data?.[0];

  const [year, setYear] = useState(() => new Date().getFullYear() - 1);
  const [discountRate, setDiscountRate] = useState("");
  const [running, setRunning] = useState(false);

  async function compute() {
    if (!obligation) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/dismantling/${obligation.id}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          hgbDiscountRatePercent: discountRate ? Number(discountRate.replace(",", ".")) : null,
          // Eine bestehende Fortschreibung wird NICHT still ersetzt — sie kann
          // Grundlage eines festgestellten Abschlusses sein. Der Nutzer
          // bestätigt das über die Rückfrage der Route.
          overwrite: false,
        }),
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.message || t("computeError"));

      if (!result.computed) {
        // Kein Ergebnis ist eine Aussage: eine Rückstellung ohne Grundlage
        // wäre eine Bilanzgrösse, die niemand erklären kann.
        toast.warning(result.reason, { duration: 12_000 });
        return;
      }

      invalidate(["dismantling", parkId]);

      if (result.warnings?.length > 0) {
        // Vor allem der Hinweis zum fehlenden Abzinsungssatz: ohne ihn wird
        // nicht abgezinst und der handelsrechtliche Betrag ist zu hoch.
        toast.warning(t("computedWithWarnings"), {
          description: result.warnings.slice(0, 3).join(" · "),
          duration: 15_000,
        });
      } else {
        toast.success(t("computed", { year }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("computeError"));
    } finally {
      setRunning(false);
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

  if (!obligation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hammer className="h-5 w-5" />
            {t("cardTitle")}
            <InfoTooltip text={t("cardTooltip")} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("noObligation")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("noObligationHint")}</p>
        </CardContent>
      </Card>
    );
  }

  const check = obligation.securityCheck;
  const latest = obligation.provisions[0];
  const required = Number(obligation.requiredSecurityEur ?? 0);
  const provided = Number(obligation.providedSecurityEur ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hammer className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
          {check.isExpired && <Badge variant="destructive">{t("securityExpired")}</Badge>}
          {!check.isExpired && check.expiresSoon && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("securityExpiresSoon")}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Die Probleme stehen ganz oben. Eine abgelaufene Bürgschaft ist ein
            Verstoss gegen die Genehmigungsauflage — sie darf nicht unter den
            Zahlen verschwinden. */}
        {check.problems.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-destructive">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              {t("securityProblems")}
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              {check.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Figure
            label={t("estimatedCost")}
            value={formatCurrency(Number(obligation.estimatedCostTodayEur))}
            hint={
              obligation.costEstimateDate
                ? t("estimateFrom", {
                    date: formatDate(new Date(obligation.costEstimateDate)),
                  })
                : // Ein Kostenansatz ohne Datum lässt sich nicht beurteilen.
                  t("estimateUndated")
            }
          />
          <Figure label={t("dismantlingYear")} value={String(obligation.dismantlingYear)} />
          <Figure
            label={t("security")}
            value={
              required > 0
                ? `${formatCurrency(provided)} / ${formatCurrency(required)}`
                : t("securityUnknown")
            }
            hint={obligation.securityProvider ?? undefined}
          />
          <Figure
            label={t("securityValidTo")}
            value={
              obligation.securityValidTo
                ? formatDate(new Date(obligation.securityValidTo))
                : t("securityNoExpiry")
            }
            hint={
              check.daysUntilExpiry !== null
                ? check.daysUntilExpiry >= 0
                  ? t("daysLeft", { days: check.daysUntilExpiry })
                  : t("daysExpired", { days: Math.abs(check.daysUntilExpiry) })
                : undefined
            }
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-xs font-medium">{t("provisionTitle")}</p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="dismantlingYearInput">
                {t("provisionYear")}
              </Label>
              <Input
                id="dismantlingYearInput"
                type="number"
                min={2000}
                max={2200}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="hgbDiscountRate">
                {t("discountRate")}
              </Label>
              <Input
                id="hgbDiscountRate"
                value={discountRate}
                onChange={(e) => setDiscountRate(e.target.value)}
                placeholder="1,80"
                className="w-24"
              />
            </div>
            <Button size="sm" onClick={() => void compute()} disabled={running}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              {t("compute")}
            </Button>
          </div>

          {/* Der Satz wird nicht geschätzt. Die Bundesbank veröffentlicht ihn;
              eine erfundene Zahl wäre eine erfundene Bilanzgrösse. */}
          <p className="text-xs text-muted-foreground">{t("discountRateHint")}</p>

          {obligation.provisions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noProvisions")}</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.year")}</TableHead>
                    <TableHead className="text-right">{t("table.hgb")}</TableHead>
                    <TableHead className="text-right">{t("table.tax")}</TableHead>
                    <TableHead className="text-right">{t("table.difference")}</TableHead>
                    <TableHead className="text-right">{t("table.addition")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obligation.provisions.map((provision) => (
                    <TableRow key={provision.id}>
                      <TableCell className="text-xs tabular-nums">
                        {provision.year}
                        {provision.hgbDiscountRatePercent === null && (
                          // Ohne Abzinsungssatz ist der handelsrechtliche
                          // Betrag zu hoch. Das muss an der Zahl stehen.
                          <span
                            className="ml-1 text-amber-600"
                            title={t("notDiscounted")}
                            aria-label={t("notDiscounted")}
                          >
                            *
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(Number(provision.hgbProvisionEur))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(Number(provision.taxProvisionEur))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(Number(provision.differenceEur))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {provision.hgbAdditionEur !== null
                          ? formatCurrency(Number(provision.hgbAdditionEur))
                          : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {latest && (
            <p className="text-xs text-muted-foreground">
              {t("accrualLine", {
                percent: (Number(latest.accrualRatio) * 100).toFixed(1).replace(".", ","),
                years: latest.remainingYears,
              })}
            </p>
          )}

          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {t("differenceHint")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
