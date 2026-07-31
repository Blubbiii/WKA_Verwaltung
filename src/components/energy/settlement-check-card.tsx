"use client";

/**
 * Dreiecksabgleich einer Netzbetreiber-Abrechnung.
 *
 * A3 (Audit 2026-07): Heute werden die Zahlen abgetippt und geglaubt. Diese
 * Karte hält die Gegenrechnung dagegen und macht sichtbar, welche der drei
 * Quellen vermutlich abweicht.
 *
 * ## Was hier bewusst nicht passiert
 *
 * Der Abgleich läuft NICHT automatisch beim Öffnen der Seite. Er liest
 * Zeitreihen mehrerer Anlagen, und jeder Lauf legt einen Datensatz an — eine
 * Seite, die bei jedem Aufruf rechnet, erzeugt eine Historie aus Zufall statt
 * aus Absicht. Wer prüft, tut das bewusst.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, ScanSearch, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";

type Severity = "OK" | "INFO" | "WARNING" | "CRITICAL";

interface Finding {
  code: string;
  severity: Severity;
  left: { label: string; value: number | null; unit: string };
  right: { label: string; value: number | null; unit: string };
  deviationPct: number | null;
  deviationAbs: number | null;
  message: string;
}

interface StoredCheck {
  id: string;
  findings: Finding[];
  worstSeverity: Severity;
  interpretation: string | null;
  tolerances: { scadaSource?: string | null; rateSource?: string | null; notes?: string[] } | null;
  createdAt: string;
}

const SEVERITY_STYLE: Record<Severity, { icon: React.ElementType; className: string }> = {
  OK: { icon: CheckCircle2, className: "text-green-600" },
  INFO: { icon: Info, className: "text-muted-foreground" },
  WARNING: { icon: AlertTriangle, className: "text-amber-600" },
  CRITICAL: { icon: XCircle, className: "text-destructive" },
};

export function SettlementCheckCard({ settlementId }: { settlementId: string }) {
  const t = useTranslations("settlementCheck");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const invalidate = useInvalidateQuery();

  const { data } = useApiQuery<{ data: StoredCheck | null }>(
    ["settlement-check", settlementId],
    `/api/energy/settlements/${settlementId}/check`,
  );
  const check = data?.data ?? null;

  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch(`/api/energy/settlements/${settlementId}/check`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("error"));

      invalidate(["settlement-check", settlementId]);

      // Die Hinweise zur Datenherkunft gehören vor die Augen des Bearbeiters:
      // eine Menge aus der Leistungsintegration ist weniger belastbar als eine
      // aus dem Zählwerk.
      if (result.sourceNotes?.length > 0) {
        toast.info(result.sourceNotes.join(" · "), { duration: 12_000 });
      }

      if (result.worstSeverity === "OK") {
        toast.success(t("resultOk"));
      } else if (result.worstSeverity === "INFO") {
        // Kein Befund, aber auch kein bestandener Abgleich — fehlende Quellen.
        toast.warning(t("resultIncomplete"), { duration: 10_000 });
      } else {
        toast.warning(t("resultDeviation"), { duration: 12_000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"));
    } finally {
      setRunning(false);
    }
  }

  const worst = check?.worstSeverity ?? null;
  const WorstIcon = worst ? SEVERITY_STYLE[worst].icon : ScanSearch;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <WorstIcon className={`h-4 w-4 ${worst ? SEVERITY_STYLE[worst].className : ""}`} />
          {t("title")}
          <InfoTooltip text={t("tooltip")} />
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={running}>
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="mr-2 h-4 w-4" />
          )}
          {t("run")}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {!check ? (
          <p className="text-sm text-muted-foreground">{t("notYetChecked")}</p>
        ) : (
          <>
            {check.interpretation && (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{check.interpretation}</p>
            )}

            <div className="space-y-1.5">
              {check.findings.map((finding) => {
                const style = SEVERITY_STYLE[finding.severity];
                const Icon = style.icon;
                return (
                  <div key={finding.code} className="flex items-start gap-2 text-sm">
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.className}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className={finding.severity === "OK" ? "text-muted-foreground" : ""}>
                        {finding.message}
                      </p>
                      {/* Die verglichenen Werte gehören daneben — sonst muss man
                          sie sich aus drei Karten zusammensuchen. */}
                      {finding.left.value !== null && finding.right.value !== null && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {finding.left.label}:{" "}
                          {formatValue(finding.left.value, finding.left.unit)} ·{" "}
                          {finding.right.label}:{" "}
                          {formatValue(finding.right.value, finding.right.unit)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                {t("checkedAt", {
                  date: format(new Date(check.createdAt), "dd.MM.yyyy HH:mm", {
                    locale: dateLocale,
                  }),
                })}
              </p>
              {check.tolerances?.scadaSource && (
                <p>
                  {t("scadaSource")}:{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {t(`sources.${check.tolerances.scadaSource}`)}
                  </Badge>
                </p>
              )}
              {check.tolerances?.rateSource && (
                <p>
                  {t("rateSource")}: {check.tolerances.rateSource}
                </p>
              )}
              {check.tolerances?.notes?.map((note, i) => (
                <p key={i} className="text-amber-600">
                  {note}
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatValue(value: number, unit: string): string {
  if (unit === "EUR/kWh") {
    return `${value.toFixed(4).replace(".", ",")} €/kWh`;
  }
  if (unit === "EUR") {
    return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} ${unit}`;
}
