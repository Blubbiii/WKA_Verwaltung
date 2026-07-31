"use client";

/**
 * Portfolio-Cockpit Park × Jahr.
 *
 * B5 (Audit 2026-07): „Es fehlt die verdichtete Matrix, auf die Banken und
 * Beiräte schauen."
 *
 * ## Warum leere Zellen hier anders aussehen als Nullen
 *
 * Diese Seite wird nach aussen gegeben. Eine Bank liest „0" als Zahl, nicht
 * als Lücke. Deshalb steht in einer Zelle ohne Datengrundlage ein Strich, und
 * der Grund hängt als Titel daran — nachlesbar, ohne die Tabelle zu stören.
 *
 * ## Warum die Kennzahl in Zeilen und die Jahre in Spalten stehen
 *
 * So liest sich die Entwicklung einer Kennzahl über die Jahre in einer Zeile.
 * Umgekehrt müsste man beim Vergleich zweier Jahre die Augen über die halbe
 * Tabelle bewegen — und genau dieser Vergleich ist der Zweck.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useApiQuery } from "@/hooks/useApiQuery";
import { downloadBlob } from "@/lib/download";
import { generateCsv } from "@/lib/export/csv";
import type { CockpitCell, CockpitSummary, Metric } from "@/lib/portfolio/cockpit";

interface Response {
  years: number[];
  parks: { id: string; name: string }[];
  cells: CockpitCell[];
  summaries: CockpitSummary[];
  warnings: string[];
}

/** Die Kennzahlen in der Reihenfolge, in der sie gelesen werden. */
const ROWS = [
  { key: "productionMwh", unit: "MWh", digits: 0 },
  { key: "fullLoadHours", unit: "h", digits: 0 },
  { key: "forecastAchievement", unit: "%", digits: 1 },
  { key: "technicalAvailability", unit: "%", digits: 2 },
  { key: "contractualAvailability", unit: "%", digits: 2 },
  { key: "revenueEur", unit: "EUR", digits: 0 },
  { key: "revenuePerMwh", unit: "EUR/MWh", digits: 2 },
  { key: "operatingCostEur", unit: "EUR", digits: 0 },
  { key: "costPerMwh", unit: "EUR/MWh", digits: 2 },
  { key: "operatingResultEur", unit: "EUR", digits: 0 },
  { key: "payoutRatio", unit: "%", digits: 1 },
  { key: "debtServiceCoverage", unit: "", digits: 2 },
] as const;

type RowKey = (typeof ROWS)[number]["key"];

function formatValue(metric: Metric, digits: number): string {
  if (metric.value === null) return "–";
  return metric.value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function PortfolioCockpitPage() {
  const t = useTranslations("portfolioCockpit");
  const currentYear = new Date().getFullYear();
  const [to, setTo] = useState(currentYear);
  const [from, setFrom] = useState(currentYear - 4);

  const { data, isLoading, error } = useApiQuery<Response>(
    ["portfolio-cockpit", String(from), String(to)],
    `/api/reports/portfolio-cockpit?from=${from}&to=${to}`,
  );

  function exportCsv() {
    if (!data) return;

    const columns = [
      { key: "park", header: t("park") },
      { key: "metric", header: t("metric") },
      { key: "unit", header: t("unit") },
      ...data.years.map((year) => ({ key: `y${year}`, header: String(year) })),
    ];

    const rows = data.parks.flatMap((park) =>
      ROWS.map((row) => {
        const entry: Record<string, unknown> = {
          park: park.name,
          metric: t(`rows.${row.key}`),
          unit: row.unit,
        };
        for (const year of data.years) {
          const cell = data.cells.find((c) => c.parkId === park.id && c.year === year);
          const metric = cell?.[row.key as RowKey];
          // Im Export steht der GRUND statt eines leeren Feldes. Ein leeres
          // Feld in einer Tabellenkalkulation wird zu 0, sobald jemand damit
          // rechnet — und dann steht in einem Bankbericht eine Null, die
          // niemand geschrieben hat.
          entry[`y${year}`] =
            metric && metric.value !== null ? metric.value : (metric?.unavailable ?? "");
        }
        return entry;
      }),
    );

    const csv = generateCsv(rows, columns);
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `portfolio-cockpit-${from}-${to}.csv`,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            {t("export")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="cockpitFrom">
            {t("from")}
          </Label>
          <Input
            id="cockpitFrom"
            type="number"
            className="w-28"
            value={from}
            min={2000}
            max={to}
            onChange={(e) => setFrom(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="cockpitTo">
            {t("to")}
          </Label>
          <Input
            id="cockpitTo"
            type="number"
            className="w-28"
            value={to}
            min={from}
            max={2100}
            onChange={(e) => setTo(Number(e.target.value))}
          />
        </div>
      </div>

      {data && data.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t("warningsTitle")}
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <EmptyState icon={AlertTriangle} title={t("loadError")} description={t("loadErrorHint")} />
      ) : !data || data.parks.length === 0 ? (
        <EmptyState icon={LayoutGrid} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          {/* Jahressummen zuerst — die Frage „wie lief das Portfolio" kommt
              vor der Frage „wie lief Park X". */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {t("summaryTitle")}
                <InfoTooltip text={t("summaryTooltip")} />
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left">{t("metric")}</th>
                    {data.years.map((year) => (
                      <th key={year} className="py-2 text-right tabular-nums">
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["productionMwh", 0],
                      ["revenueEur", 0],
                      ["operatingCostEur", 0],
                      ["operatingResultEur", 0],
                      ["revenuePerMwh", 2],
                    ] as const
                  ).map(([key, digits]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-1.5 text-xs">{t(`rows.${key}`)}</td>
                      {data.years.map((year) => {
                        const summary = data.summaries.find((s) => s.year === year);
                        const metric = summary?.[key];
                        return (
                          <td
                            key={year}
                            className="py-1.5 text-right text-xs tabular-nums"
                            title={metric?.unavailable ?? undefined}
                          >
                            {metric ? formatValue(metric, digits) : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="text-xs text-muted-foreground">
                    <td className="py-1.5">{t("parksWithData")}</td>
                    {data.years.map((year) => {
                      const summary = data.summaries.find((s) => s.year === year);
                      return (
                        <td key={year} className="py-1.5 text-right tabular-nums">
                          {/* Ohne diese Zeile saehe eine Summe ueber drei von
                              zehn Parks aus wie das Portfolio. */}
                          {summary ? `${summary.parksWithData} / ${summary.parksTotal}` : "–"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {data.parks.map((park) => (
            <Card key={park.id}>
              <CardHeader>
                <CardTitle className="text-base">{park.name}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-left">{t("metric")}</th>
                      <th className="py-2 text-left">{t("unit")}</th>
                      {data.years.map((year) => (
                        <th key={year} className="py-2 text-right tabular-nums">
                          {year}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="py-1.5 text-xs">{t(`rows.${row.key}`)}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{row.unit}</td>
                        {data.years.map((year) => {
                          const cell = data.cells.find(
                            (c) => c.parkId === park.id && c.year === year,
                          );
                          const metric = cell?.[row.key as RowKey];
                          return (
                            <td
                              key={year}
                              className={
                                metric && metric.value === null
                                  ? "py-1.5 text-right text-xs text-muted-foreground"
                                  : "py-1.5 text-right text-xs tabular-nums"
                              }
                              // Der Grund haengt am Strich — nachlesbar, ohne
                              // die Tabelle zu stoeren.
                              title={metric?.unavailable ?? undefined}
                            >
                              {metric ? formatValue(metric, row.digits) : "–"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          <p className="text-xs text-muted-foreground">{t("dashHint")}</p>
        </>
      )}
    </div>
  );
}
