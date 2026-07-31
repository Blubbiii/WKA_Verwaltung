"use client";

/**
 * Policenübersicht mit Deckungsprüfung.
 *
 * A6 (Audit 2026-07): Policen waren nur `Contract(contractType=INSURANCE)` —
 * ein Vertrag mit Titel und Laufzeit, ohne Versicherungssumme, ohne
 * Selbstbehalt, ohne versicherte Objekte.
 *
 * ## Warum die Deckungslücke oben steht und nicht in einer Spalte
 *
 * „Unterversicherung ist selten, aber existenziell." Nach § 75 VVG kürzt der
 * Versicherer im Verhältnis Versicherungssumme zu Versicherungswert — bei
 * 20 % Unterdeckung sind das 20 % jedes Schadens, dauerhaft. Die Frage stellt
 * sich VOR dem Schaden. Danach ist sie nur noch die Erklärung, warum weniger
 * kam als erwartet.
 *
 * Die bestehende Seite unter `../` listet die Versicherungsverträge. Diese
 * hier listet die Policen dazu — sie ersetzt sie nicht.
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatCurrency, formatDate } from "@/lib/format";

interface Coverage {
  id: string;
  coverageType: string;
  sumInsuredEur: string | null;
  insuredValueEur: string | null;
  deductibleType: string | null;
  deductibleValue: string | null;
  indemnityPeriodMonths: number | null;
}

interface InsuredObject {
  id: string;
  insuredValueEur: string | null;
  park: { id: string; name: string; shortName: string | null } | null;
  turbine: { id: string; designation: string } | null;
}

interface Policy {
  id: string;
  policyNumber: string | null;
  insurerName: string | null;
  brokerName: string | null;
  sumInsuredEur: string | null;
  insuredValueEur: string | null;
  waivesUnderinsurance: boolean;
  deductibleType: string;
  deductibleValue: string;
  deductibleMinEur: string | null;
  deductibleMaxEur: string | null;
  premiumEur: string | null;
  premiumInterval: string | null;
  nextPremiumDue: string | null;
  contract: {
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
  };
  coverages: Coverage[];
  insuredObjects: InsuredObject[];
  coverageGap: { gapEur: number | null; gapPercent: number | null; message: string | null };
  insuredValueSource: "INSURED_OBJECTS" | "POLICY";
  _count: { claims: number };
}

export default function InsurancePoliciesPage() {
  const t = useTranslations("insurancePolicies");
  const [gapsOnly, setGapsOnly] = useState(false);

  const { data, isLoading, error } = useApiQuery<{ data: Policy[] }>(
    ["insurance-policies", gapsOnly ? "gaps" : "all"],
    `/api/insurance/policies${gapsOnly ? "?gapsOnly=true" : ""}`,
  );

  const policies = data?.data ?? [];

  // Drei Zustände, nicht zwei. „Nicht beurteilbar" ist nicht dasselbe wie
  // „gedeckt" — es ist die häufigste und die gefährlichste Lage, weil sie
  // aussieht wie Ordnung.
  const unassessable = policies.filter((p) => p.coverageGap.gapEur === null).length;
  const underinsured = policies.filter((p) => (p.coverageGap.gapEur ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/management-billing/insurance">{t("backToContracts")}</Link>
          </Button>
        }
      />

      {!isLoading && policies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryTile
            icon={<ShieldCheck className="h-5 w-5 text-green-600" />}
            label={t("summary.covered")}
            value={String(policies.length - underinsured - unassessable)}
          />
          <SummaryTile
            icon={<ShieldAlert className="h-5 w-5 text-destructive" />}
            label={t("summary.underinsured")}
            value={String(underinsured)}
            emphasis={underinsured > 0}
          />
          <SummaryTile
            icon={<ShieldQuestion className="h-5 w-5 text-amber-600" />}
            label={t("summary.unassessable")}
            value={String(unassessable)}
            hint={t("summary.unassessableHint")}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={gapsOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setGapsOnly((current) => !current)}
        >
          {t("filterGapsOnly")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("loadError")}
          description={t("loadErrorHint")}
        />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={ShieldQuestion}
          title={gapsOnly ? t("emptyGaps") : t("empty")}
          description={gapsOnly ? t("emptyGapsHint") : t("emptyHint")}
        />
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({ policy }: { policy: Policy }) {
  const t = useTranslations("insurancePolicies");
  const gap = policy.coverageGap;
  const hasGap = (gap.gapEur ?? 0) > 0;
  const unassessable = gap.gapEur === null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Link href={`/contracts/${policy.contract.id}`} className="hover:underline">
            {policy.contract.title}
          </Link>
          {policy.policyNumber && (
            <span className="font-mono text-xs text-muted-foreground">{policy.policyNumber}</span>
          )}
          {hasGap && <Badge variant="destructive">{t("badgeUnderinsured")}</Badge>}
          {unassessable && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("badgeUnassessable")}
            </Badge>
          )}
          {policy.waivesUnderinsurance && (
            <Badge variant="secondary">{t("badgeWaiver")}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {gap.message && (
          <div
            className={
              hasGap
                ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs"
                : "rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"
            }
          >
            {gap.message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label={t("insurer")}
            value={policy.insurerName ?? "–"}
            hint={policy.brokerName ? t("viaBroker", { broker: policy.brokerName }) : undefined}
          />
          <Figure
            label={t("sumInsured")}
            value={policy.sumInsuredEur ? formatCurrency(Number(policy.sumInsuredEur)) : "–"}
          />
          <Figure
            label={t("insuredValue")}
            value={policy.insuredValueEur ? formatCurrency(Number(policy.insuredValueEur)) : "–"}
            hint={
              policy.insuredValueSource === "INSURED_OBJECTS"
                ? t("valueFromObjects", { count: policy.insuredObjects.length })
                : undefined
            }
          />
          <Figure label={t("deductible")} value={deductibleLabel(policy, t)} />
        </div>

        {policy.coverages.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("coverages")}</p>
            <div className="flex flex-wrap gap-1.5">
              {policy.coverages.map((coverage) => (
                <Badge key={coverage.id} variant="outline" className="text-xs font-normal">
                  {t(`coverageTypes.${coverage.coverageType}`)}
                  {coverage.sumInsuredEur &&
                    ` · ${formatCurrency(Number(coverage.sumInsuredEur))}`}
                  {coverage.indemnityPeriodMonths &&
                    ` · ${t("indemnityPeriod", { months: coverage.indemnityPeriodMonths })}`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("term", {
              from: policy.contract.startDate ? formatDate(policy.contract.startDate) : "–",
              to: policy.contract.endDate ? formatDate(policy.contract.endDate) : t("openEnded"),
            })}
          </span>
          {policy.premiumEur && (
            <span>
              {t("premium", {
                amount: formatCurrency(Number(policy.premiumEur)),
                interval: t(`intervals.${policy.premiumInterval ?? "ANNUAL"}`),
              })}
            </span>
          )}
          {policy.nextPremiumDue && (
            <span>{t("nextDue", { date: formatDate(policy.nextPremiumDue) })}</span>
          )}
          <span>{t("claimCount", { count: policy._count.claims })}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function deductibleLabel(policy: Policy, t: (key: string, values?: Record<string, string | number>) => string): string {
  const value = Number(policy.deductibleValue);
  const base =
    policy.deductibleType === "FIXED_EUR"
      ? formatCurrency(value)
      : `${value.toFixed(2).replace(".", ",")} % ${t(`deductibleBases.${policy.deductibleType}`)}`;

  // Mindest- und Höchstselbstbehalt gehören dazu: bei „10 % des Schadens, mind.
  // 25.000 EUR" ist die Prozentzahl bei kleinen Schäden bedeutungslos.
  const bounds: string[] = [];
  if (policy.deductibleMinEur) {
    bounds.push(t("deductibleMin", { amount: formatCurrency(Number(policy.deductibleMinEur)) }));
  }
  if (policy.deductibleMaxEur) {
    bounds.push(t("deductibleMax", { amount: formatCurrency(Number(policy.deductibleMaxEur)) }));
  }

  return bounds.length > 0 ? `${base} (${bounds.join(", ")})` : base;
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className={emphasis ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold"}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
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
