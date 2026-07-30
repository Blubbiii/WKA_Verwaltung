"use client";

/**
 * Verfügbarkeitsgarantie am Wartungsvertrag.
 *
 * A2 (Audit 2026-07): Der Hersteller rechnet die Verfügbarkeit selbst ab. Diese
 * Karte trägt die vertraglichen Vorgaben und den Jahresabgleich dagegen.
 *
 * ## Warum die Kategorien nicht vorbelegt sind
 *
 * Es gibt zwei gebräuchliche Ausgangsdefinitionen, und sie stehen als Vorlage
 * zur Auswahl. Was gilt, steht aber im Vertragstext — eine stille Vorbelegung
 * würde eine Definition setzen, die niemand geprüft hat, und genau davon hängt
 * bei einer 97-%-Garantie ein fünfstelliger Betrag ab.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Loader2, Plus, ShieldCheck } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";

interface Tier {
  id: string;
  fromPct: string;
  toPct: string;
  kind: "BONUS" | "MALUS";
  mode: string;
  amount: string;
}

interface Guarantee {
  id: string;
  targetAvailabilityPct: string;
  method: string;
  availableCategories: string[];
  excludedCategories: string[];
  exclusionNotes: string | null;
  pointRounding: string;
  maxMalusEur: string | null;
  maxBonusEur: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  tiers: Tier[];
  _count: { settlements: number };
}

interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  actualAvailabilityPct: string | null;
  targetAvailabilityPct: string;
  vendorReportedPct: string | null;
  bonusMalusEur: string | null;
  status: string;
}

export function AvailabilityGuaranteeCard({ contractId }: { contractId: string }) {
  const t = useTranslations("availability");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const invalidate = useInvalidateQuery();

  const { data: guaranteesData, isLoading } = useApiQuery<{ data: Guarantee[] }>(
    ["availability-guarantees", contractId],
    `/api/availability/guarantees?contractId=${contractId}`,
  );
  const guarantees = guaranteesData?.data ?? [];
  const guarantee = guarantees.find((g) => g.isActive) ?? guarantees[0];

  const { data: settlementsData } = useApiQuery<{ data: Settlement[] }>(
    ["availability-settlements", guarantee?.id ?? "none"],
    guarantee ? `/api/availability/settlements?guaranteeId=${guarantee.id}` : null,
  );
  const settlements = settlementsData?.data ?? [];

  const [year, setYear] = useState(() => new Date().getFullYear() - 1);
  const [vendorPct, setVendorPct] = useState("");
  const [settling, setSettling] = useState(false);

  async function settle() {
    if (!guarantee) return;
    setSettling(true);
    try {
      const res = await fetch("/api/availability/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guaranteeId: guarantee.id,
          periodStart: new Date(Date.UTC(year, 0, 1)).toISOString(),
          periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
          vendorReportedPct: vendorPct ? Number(vendorPct.replace(",", ".")) : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("settleError"));

      invalidate(["availability-settlements", guarantee.id]);
      invalidate(["availability-guarantees", contractId]);

      if (!result.computed) {
        // Kein Ergebnis ist eine Aussage. Der Abgleich wurde trotzdem
        // festgehalten, damit sichtbar bleibt, dass geprüft wurde.
        toast.warning(result.reason, { duration: 12_000 });
        return;
      }
      if (result.warnings?.length > 0) {
        toast.warning(t("settledWithWarnings"), {
          description: result.warnings.slice(0, 3).join(" · "),
          duration: 12_000,
        });
      } else {
        toast.success(t("settled"));
      }
      if (result.vendorDeviation !== null && Math.abs(result.vendorDeviation) >= 0.1) {
        // Die Abweichung ist der Grund für die ganze Funktion — sie bekommt
        // eine eigene Meldung, statt in der Tabelle unterzugehen.
        toast.info(t("vendorDeviation", { deviation: result.vendorDeviation }), {
          duration: 15_000,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settleError"));
    } finally {
      setSettling(false);
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

  if (!guarantee) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5" />
            {t("cardTitle")}
            <InfoTooltip text={t("cardTooltip")} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("noGuarantee")}</p>
          <Button variant="outline" size="sm" className="mt-3" disabled>
            <Plus className="mr-2 h-4 w-4" />
            {t("addGuarantee")}
          </Button>
          {/* Ehrlich benannt statt einen toten Knopf anzubieten: das
              Erfassungsformular kommt noch, die Rechenkette steht. */}
          <p className="mt-2 text-xs text-muted-foreground">{t("addGuaranteeHint")}</p>
        </CardContent>
      </Card>
    );
  }

  const target = Number(guarantee.targetAvailabilityPct);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
          {!guarantee.isActive && <Badge variant="outline">{t("inactive")}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure label={t("target")} value={`${target.toFixed(2).replace(".", ",")} %`} />
          <Figure label={t("method")} value={t(`methods.${guarantee.method}`)} />
          <Figure
            label={t("validity")}
            value={`${format(new Date(guarantee.validFrom), "dd.MM.yyyy", { locale: dateLocale })} – ${
              guarantee.validTo
                ? format(new Date(guarantee.validTo), "dd.MM.yyyy", { locale: dateLocale })
                : t("openEnded")
            }`}
          />
          <Figure label={t("pointRounding")} value={t(`rounding.${guarantee.pointRounding}`)} />
        </div>

        <div>
          <p className="text-xs text-muted-foreground">{t("definition")}</p>
          <p>
            {t("definitionLine", {
              available: guarantee.availableCategories.map((c) => c.toUpperCase()).join(" + "),
              excluded:
                guarantee.excludedCategories.length > 0
                  ? guarantee.excludedCategories.map((c) => c.toUpperCase()).join(", ")
                  : t("noExclusions"),
            })}
          </p>
          {guarantee.exclusionNotes && (
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
              {guarantee.exclusionNotes}
            </p>
          )}
        </div>

        {guarantee.tiers.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("tiers")}</p>
            <ul className="space-y-0.5 text-xs">
              {guarantee.tiers.map((tier) => (
                <li key={tier.id}>
                  {Number(tier.fromPct).toFixed(2).replace(".", ",")} –{" "}
                  {Number(tier.toPct).toFixed(2).replace(".", ",")} %:{" "}
                  <Badge variant={tier.kind === "MALUS" ? "destructive" : "secondary"} className="mx-1">
                    {t(`kinds.${tier.kind}`)}
                  </Badge>
                  {t(`modes.${tier.mode}`, { amount: Number(tier.amount) })}
                </li>
              ))}
            </ul>
            {(guarantee.maxMalusEur || guarantee.maxBonusEur) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {guarantee.maxMalusEur &&
                  t("maxMalus", { amount: formatCurrency(Number(guarantee.maxMalusEur)) })}
                {guarantee.maxMalusEur && guarantee.maxBonusEur && " · "}
                {guarantee.maxBonusEur &&
                  t("maxBonus", { amount: formatCurrency(Number(guarantee.maxBonusEur)) })}
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* Jahresabgleich */}
        <div className="space-y-3">
          <p className="text-xs font-medium">{t("settlementTitle")}</p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="settleYear">
                {t("settleYear")}
              </Label>
              <Input
                id="settleYear"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="vendorPct">
                {t("vendorReported")}
              </Label>
              <Input
                id="vendorPct"
                value={vendorPct}
                onChange={(e) => setVendorPct(e.target.value)}
                placeholder="97,20"
                className="w-28"
              />
            </div>
            <Button size="sm" onClick={() => void settle()} disabled={settling}>
              {settling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              {t("settle")}
            </Button>
          </div>

          {settlements.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noSettlements")}</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.period")}</TableHead>
                    <TableHead className="text-right">{t("table.actual")}</TableHead>
                    <TableHead className="text-right">{t("table.vendor")}</TableHead>
                    <TableHead className="text-right">{t("table.deviation")}</TableHead>
                    <TableHead className="text-right">{t("table.bonusMalus")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((settlement) => {
                    const actual =
                      settlement.actualAvailabilityPct !== null
                        ? Number(settlement.actualAvailabilityPct)
                        : null;
                    const vendor =
                      settlement.vendorReportedPct !== null
                        ? Number(settlement.vendorReportedPct)
                        : null;
                    const deviation = actual !== null && vendor !== null ? vendor - actual : null;
                    const bonusMalus =
                      settlement.bonusMalusEur !== null ? Number(settlement.bonusMalusEur) : null;
                    return (
                      <TableRow key={settlement.id}>
                        <TableCell className="text-xs tabular-nums">
                          {new Date(settlement.periodStart).getFullYear()}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {actual !== null ? (
                            <span className={actual < target ? "font-medium text-destructive" : ""}>
                              {actual.toFixed(2).replace(".", ",")} %
                            </span>
                          ) : (
                            // Nicht als 0 % darstellen — das wäre die volle Pönale.
                            <span className="text-muted-foreground">{t("notComputable")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {vendor !== null ? `${vendor.toFixed(2).replace(".", ",")} %` : "–"}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {deviation !== null ? (
                            <span
                              className={Math.abs(deviation) >= 0.1 ? "font-medium text-amber-600" : ""}
                            >
                              {deviation > 0 ? "+" : ""}
                              {deviation.toFixed(2).replace(".", ",")}
                            </span>
                          ) : (
                            "–"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {bonusMalus !== null ? (
                            <span className={bonusMalus > 0 ? "font-medium text-green-700" : ""}>
                              {formatCurrency(Math.abs(bonusMalus))}
                              {bonusMalus > 0 ? ` ${t("claim")}` : bonusMalus < 0 ? ` ${t("owed")}` : ""}
                            </span>
                          ) : (
                            "–"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {t(`statuses.${settlement.status}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {t("independentHint")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
