"use client";

/**
 * Störungsvorgang — Detailansicht.
 *
 * A1 (Audit 2026-07). Zwei Dinge trägt diese Seite, die es vorher nirgends gab:
 * den bewerteten Ertragsausfall samt seiner Herleitung, und die Wiedervorlage
 * mit der Verjährungsfrist des Anspruchs.
 */

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Loader2,
  Wind,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmountInput } from "@/components/ui/amount-input";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useInvalidateQuery } from "@/hooks/useApiQuery";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  CAUSE_CATEGORIES,
  CASE_STATUSES,
  CLAIM_STATUSES,
  CLAIMABLE_CAUSES,
  type CauseCategory,
} from "@/lib/faults/constants";

interface LostEnergyBasis {
  expectedKwh?: number;
  actualKwh?: number;
  referenceTurbineIds?: string[];
  intervalCount?: number;
  warnings?: string[];
  windowStart?: string;
  windowEnd?: string;
}

interface FaultCaseDetail {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  status: string;
  causeCategory: string;
  lostEnergyKwh: string | null;
  lostEnergyMethod: string | null;
  lostEnergyBasis: LostEnergyBasis | null;
  lostEnergyNotes: string | null;
  lostEnergyComputedAt: string | null;
  ratePerKwh: string | null;
  rateSource: string | null;
  lostRevenueEur: string | null;
  claimStatus: string;
  claimDeadline: string | null;
  claimAmountEur: string | null;
  claimNotes: string | null;
  followUpAt: string | null;
  resolutionNotes: string | null;
  turbine: {
    id: string;
    designation: string;
    ratedPowerKw: string | null;
    manufacturer: string | null;
    park: { id: string; name: string; shortName: string | null } | null;
  };
  statusCode: { description: string; mainCode: number; subCode: number } | null;
}

export default function FaultCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("faults");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const router = useRouter();
  const invalidate = useInvalidateQuery();

  const { data, isLoading } = useApiQuery<FaultCaseDetail>(["fault", id], `/api/faults/${id}`);

  const [saving, setSaving] = useState(false);
  const [valuating, setValuating] = useState(false);
  /**
   * Handeingabe des Ausfalls. Bewusst getrennt vom geladenen Wert: solange
   * hier getippt wird, darf ein Neuladen im Hintergrund nichts ueberschreiben.
   * `undefined` heisst "noch nicht angefasst" — dann zeigt das Feld den Wert
   * aus dem Datensatz.
   */
  const [manualEnergyRaw, setManualEnergy] = useState<number | null | undefined>(undefined);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/faults/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || t("saveError"));
      }
      invalidate(["fault", id]);
      invalidate(["faults"]);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function valuate() {
    setValuating(true);
    try {
      const res = await fetch(`/api/faults/${id}/valuate`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("valuateError"));

      if (!result.computed) {
        // Kein Ergebnis ist eine Aussage, kein Fehler — der Grund muss lesbar
        // sein, damit der Bearbeiter weiss, ob er von Hand beziffern muss.
        toast.warning(result.reason, { duration: 10_000 });
        return;
      }

      invalidate(["fault", id]);
      invalidate(["faults"]);

      if (result.warnings?.length > 0) {
        toast.warning(t("valuatedWithWarnings"), {
          description: result.warnings.join(" · "),
          duration: 12_000,
        });
      } else if (!result.rateFound) {
        toast.warning(t("valuatedWithoutRate"), { duration: 10_000 });
      } else {
        toast.success(t("valuated"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("valuateError"));
    } finally {
      setValuating(false);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const basis = data.lostEnergyBasis;
  const manualEnergy =
    manualEnergyRaw !== undefined
      ? manualEnergyRaw
      : data.lostEnergyKwh !== null
        ? Number(data.lostEnergyKwh)
        : null;
  const claimable = CLAIMABLE_CAUSES.includes(data.causeCategory as CauseCategory);
  const deadlinePassed = data.claimDeadline !== null && new Date(data.claimDeadline) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/faults">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{data.caseNumber}</h1>
            <Badge variant="outline">{t(`status.${data.status}`)}</Badge>
            <Badge variant="outline">{t(`cause.${data.causeCategory}`)}</Badge>
          </div>
          <p className="text-muted-foreground">{data.title}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Anlage und Zeitraum */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wind className="h-5 w-5" />
              {t("detail.turbineCard")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label={t("detail.turbine")}>
              <Link href={`/parks/${data.turbine.park?.id}`} className="text-primary hover:underline">
                {data.turbine.designation}
              </Link>
              {data.turbine.park && ` · ${data.turbine.park.shortName || data.turbine.park.name}`}
            </Row>
            <Row label={t("detail.ratedPower")}>
              {data.turbine.ratedPowerKw
                ? `${formatNumber(Number(data.turbine.ratedPowerKw))} kW`
                : "–"}
            </Row>
            <Row label={t("detail.start")}>
              {format(new Date(data.startAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
            </Row>
            <Row label={t("detail.end")}>
              {data.endAt
                ? format(new Date(data.endAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })
                : t("stillRunning")}
            </Row>
            {data.statusCode && (
              <Row label={t("detail.statusCode")}>
                {data.statusCode.mainCode}/{data.statusCode.subCode} · {data.statusCode.description}
              </Row>
            )}
          </CardContent>
        </Card>

        {/* Bewerteter Ertragsausfall */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-5 w-5" />
              {t("detail.lossCard")}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={valuate} disabled={valuating || !data.endAt}>
              {valuating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              {t("detail.valuate")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!data.endAt && (
              // Eine laufende Störung "bis jetzt" zu bewerten ergäbe eine Zahl,
              // die beim nächsten Klick anders ausfällt.
              <p className="text-xs text-muted-foreground">{t("detail.needsEnd")}</p>
            )}

            <Row label={t("detail.lostEnergy")}>
              {data.lostEnergyKwh !== null ? (
                <span className="font-medium tabular-nums">
                  {formatNumber(Number(data.lostEnergyKwh))} kWh
                </span>
              ) : (
                <span className="text-muted-foreground">{t("notValuated")}</span>
              )}
            </Row>
            <Row label={t("detail.rate")}>
              {data.ratePerKwh !== null ? (
                <>
                  {Number(data.ratePerKwh).toFixed(4).replace(".", ",")} €/kWh
                  {data.rateSource && (
                    <span className="ml-2 text-xs text-muted-foreground">({data.rateSource})</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </Row>
            <Row label={t("detail.lostRevenue")}>
              {data.lostRevenueEur !== null ? (
                <span className="font-semibold tabular-nums">
                  {formatCurrency(Number(data.lostRevenueEur))}
                </span>
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </Row>

            {data.lostEnergyMethod && (
              <Row label={t("detail.method")}>
                {t(`method.${data.lostEnergyMethod}`)}
                {data.lostEnergyComputedAt && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(data.lostEnergyComputedAt), "dd.MM.yyyy HH:mm", {
                      locale: dateLocale,
                    })}
                  </span>
                )}
              </Row>
            )}

            {basis && (
              <>
                <Separator />
                {/* Die Herleitung gehört sichtbar an den Vorgang: eine Forderung
                    ist nur so viel wert wie ihre Nachvollziehbarkeit. */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    {t("detail.basisLine", {
                      expected: formatNumber(basis.expectedKwh ?? 0),
                      actual: formatNumber(basis.actualKwh ?? 0),
                      references: basis.referenceTurbineIds?.length ?? 0,
                      intervals: basis.intervalCount ?? 0,
                    })}
                  </p>
                  {basis.warnings?.map((warning, i) => (
                    <p key={i} className="flex items-start gap-1 text-amber-600">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {warning}
                    </p>
                  ))}
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">{t("detail.manualEnergy")}</Label>
              <div className="flex items-center gap-2">
                {/* Der Wert wird lokal gehalten und erst per Knopf
                    uebernommen — sonst schriebe jeder Tastendruck einen neuen
                    Schadenswert fest. */}
                <AmountInput
                  value={manualEnergy}
                  onValueChange={setManualEnergy}
                  decimals={3}
                  className="w-40"
                  aria-label={t("detail.manualEnergy")}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || manualEnergy === null}
                  onClick={() => {
                    if (manualEnergy === null || manualEnergy < 0) {
                      toast.error(t("detail.invalidEnergy"));
                      return;
                    }
                    void patch({ lostEnergyKwh: manualEnergy });
                  }}
                >
                  {t("detail.applyManual")}
                </Button>
              </div>
              <Textarea
                defaultValue={data.lostEnergyNotes ?? ""}
                placeholder={t("detail.manualNotesPlaceholder")}
                rows={2}
                onBlur={(e) => {
                  if (e.target.value !== (data.lostEnergyNotes ?? "")) {
                    void patch({ lostEnergyNotes: e.target.value || null });
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ursache und Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detail.classificationCard")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label={t("detail.cause")}>
              <Select
                value={data.causeCategory}
                onValueChange={(value) => void patch({ causeCategory: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAUSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`cause.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("detail.status")}>
              <Select value={data.status} onValueChange={(value) => void patch({ status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("detail.followUp")}>
              <Input
                type="date"
                defaultValue={data.followUpAt ? data.followUpAt.slice(0, 10) : ""}
                onBlur={(e) => void patch({ followUpAt: e.target.value || null })}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Anspruch */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detail.claimCard")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!claimable && (
              // Bei Wetter oder Eigenverschulden gibt es keinen Anspruchsgegner.
              <p className="text-xs text-muted-foreground">{t("detail.notClaimable")}</p>
            )}

            <Field label={t("detail.claimStatus")}>
              <Select
                value={data.claimStatus}
                onValueChange={(value) => void patch({ claimStatus: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAIM_STATUSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`claim.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("detail.claimDeadline")}>
              <Input
                type="date"
                defaultValue={data.claimDeadline ? data.claimDeadline.slice(0, 10) : ""}
                onBlur={(e) => void patch({ claimDeadline: e.target.value || null })}
              />
              {/* Die Frist wird bewusst NICHT berechnet: sie hängt vom
                  Vertragstyp ab (§ 195 BGB, § 438 BGB, abweichende
                  Wartungsverträge). Eine automatisch gesetzte Frist wäre eine
                  Rechtsauskunft. */}
              <p className="mt-1 text-xs text-muted-foreground">{t("detail.deadlineHint")}</p>
              {deadlinePassed && data.claimStatus !== "TIME_BARRED" && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {t("detail.deadlinePassed")}
                </p>
              )}
            </Field>

            <Field label={t("detail.claimNotes")}>
              <Textarea
                defaultValue={data.claimNotes ?? ""}
                rows={3}
                onBlur={(e) => {
                  if (e.target.value !== (data.claimNotes ?? "")) {
                    void patch({ claimNotes: e.target.value || null });
                  }
                }}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          disabled={saving}
          onClick={async () => {
            if (!window.confirm(t("detail.confirmDelete"))) return;
            const res = await fetch(`/api/faults/${id}`, { method: "DELETE" });
            if (!res.ok) {
              const error = await res.json().catch(() => ({}));
              toast.error(error.message || t("detail.deleteError"));
              return;
            }
            invalidate(["faults"]);
            router.push("/faults");
          }}
        >
          {t("detail.delete")}
        </Button>
      </div>

      {data.status === "CLOSED" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
          {t("detail.closed")}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
