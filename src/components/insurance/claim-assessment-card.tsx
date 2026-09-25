"use client";

/**
 * Assigns a claim to a policy (and coverage) and computes the expected
 * reimbursement — POST /api/insurance/claims/[id]/assess does both in one
 * step. The result (deductible, underinsurance, cap) is stored on the claim
 * together with the terms applied, so a later policy change does not
 * recalculate a settled claim.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatCurrency } from "@/lib/format";

interface Police {
  id: string;
  policyNumber: string | null;
  insurerName: string | null;
  contract: { id: string; title: string } | null;
  coverages: { id: string; coverageType: string }[];
}

interface Bewertung {
  lossEur: number;
  deductibleEur: number;
  expectedReimbursementEur: number;
  underinsuranceFactor: number | null;
  cappedAtSumInsured: boolean;
}

interface ClaimAssessmentCardProps {
  claimId: string;
  contractId: string | null;
  policyId: string | null;
  coverageId: string | null;
  /** Stored results of an earlier assessment. */
  expectedReimbursementEur: number | null;
  deductibleAppliedEur: number | null;
}

const GANZE_POLICE = "__policy__";

function policenName(p: Police) {
  return [p.insurerName, p.policyNumber].filter(Boolean).join(" · ") || p.contract?.title || p.id;
}

export function ClaimAssessmentCard(props: ClaimAssessmentCardProps) {
  const t = useTranslations("insurancePolicies.assessment");
  const tTypen = useTranslations("insurancePolicies.coverageTypes");

  const [policyId, setPolicyId] = useState(props.policyId ?? "");
  const [coverageId, setCoverageId] = useState(props.coverageId ?? GANZE_POLICE);
  const [schadenhoehe, setSchadenhoehe] = useState("");
  const [ergebnis, setErgebnis] = useState<{ result: Bewertung; lossSource: string; warnings: string[] } | null>(null);
  const [grund, setGrund] = useState<string | null>(null);

  // Policies of the claim's insurance contract first; without a contract all.
  const { data, error } = useApiQuery<{ data: Police[] }>(
    ["insurance-policies", props.contractId ?? "all"],
    `/api/insurance/policies${props.contractId ? `?contractId=${props.contractId}` : ""}`,
  );
  const policen = data?.data ?? [];
  const police = policen.find((p) => p.id === policyId);

  const ermitteln = useMutation({
    mutationFn: async () => {
      const betrag = schadenhoehe.trim() ? Number(schadenhoehe.replace(",", ".")) : undefined;
      const res = await fetch(`/api/insurance/claims/${props.claimId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId,
          coverageId: coverageId === GANZE_POLICE ? null : coverageId,
          ...(betrag !== undefined && Number.isFinite(betrag) ? { lossEur: betrag } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("error"));
      return json;
    },
    onSuccess: (json) => {
      if (json.assessed) {
        setErgebnis({ result: json.result, lossSource: json.lossSource, warnings: json.warnings ?? [] });
        setGrund(null);
        toast.success(t("done"));
      } else {
        // Not an error: the claim lacks an amount or the policy a sum insured.
        setErgebnis(null);
        setGrund(json.reason);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Without insurance:read there is no policy to choose from.
  if (error) return null;

  const erwartet = ergebnis?.result.expectedReimbursementEur ?? props.expectedReimbursementEur;
  const selbstbehalt = ergebnis?.result.deductibleEur ?? props.deductibleAppliedEur;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {policen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {props.contractId ? t("noPolicyForContract") : t("noPolicy")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="assess-policy">{t("policy")}</Label>
              <Select
                value={policyId}
                onValueChange={(v) => {
                  setPolicyId(v);
                  setCoverageId(GANZE_POLICE);
                }}
              >
                <SelectTrigger id="assess-policy">
                  <SelectValue placeholder={t("choosePolicy")} />
                </SelectTrigger>
                <SelectContent>
                  {policen.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {policenName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assess-coverage">{t("coverage")}</Label>
              <Select value={coverageId} onValueChange={setCoverageId} disabled={!police}>
                <SelectTrigger id="assess-coverage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GANZE_POLICE}>{t("wholePolicy")}</SelectItem>
                  {(police?.coverages ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {tTypen(c.coverageType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assess-loss">{t("loss")}</Label>
              <Input
                id="assess-loss"
                type="number"
                step="0.01"
                min="0"
                value={schadenhoehe}
                onChange={(e) => setSchadenhoehe(e.target.value)}
                placeholder={t("lossPlaceholder")}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("lossHint")}</p>
          <Button onClick={() => ermitteln.mutate()} disabled={!policyId || ermitteln.isPending}>
            {ermitteln.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            {t("assess")}
          </Button>
        </div>

        {grund && <p className="text-sm text-amber-600">{grund}</p>}

        {erwartet != null && (
          <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
            {ergebnis && (
              <div>
                <p className="text-muted-foreground">{t("lossUsed", { source: ergebnis.lossSource })}</p>
                <p className="font-medium">{formatCurrency(ergebnis.result.lossEur)}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">{t("deductible")}</p>
              <p className="font-medium">{selbstbehalt != null ? formatCurrency(selbstbehalt) : "–"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("expected")}</p>
              <p className="text-lg font-semibold">{formatCurrency(erwartet)}</p>
            </div>
          </div>
        )}
        {ergebnis?.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-600">
            {w}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
