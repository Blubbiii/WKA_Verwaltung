"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Download,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

function useCurrencyFormatter() {
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-US" : "de-DE";
  const formatEur = (val: number | undefined): string => {
    if (val === undefined || val === null) return "–";
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(val);
  };
  const formatVariance = (val: number): string => {
    if (val === 0) return "–";
    const sign = val > 0 ? "+" : "";
    return (
      sign +
      new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(val)
    );
  };
  return { formatEur, formatVariance };
}

interface MonthData {
  month: number;
  energyRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  leaseExpenses: number;
  operatingCosts: number;
  totalCosts: number;
  netPL: number;
  budgetRevenue: number;
  budgetCosts: number;
  budgetNetPL: number;
  varianceRevenue: number;
  varianceCosts: number;
  varianceNetPL: number;
}

interface ParkEntry {
  parkId: string;
  parkName: string;
  months: MonthData[];
  totals: MonthData;
  hasBudget: boolean;
}

interface PLData {
  year: number;
  parks: ParkEntry[];
  hasBudget: boolean;
}

function VarianceCell({
  val,
  invert = false,
}: {
  val: number;
  invert?: boolean;
}) {
  const { formatVariance } = useCurrencyFormatter();
  const isPositive = invert ? val <= 0 : val >= 0;
  if (val === 0)
    return (
      <td className="text-right px-2 py-1 text-xs text-muted-foreground">–</td>
    );
  return (
    <td
      className={`text-right px-2 py-1 text-xs font-medium ${isPositive ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
    >
      {formatVariance(val)}
    </td>
  );
}

function ParkTable({
  park,
  hasBudget,
}: {
  park: ParkEntry;
  hasBudget: boolean;
}) {
  const t = useTranslations("wirtschaftsplan.pl");
  const tMonths = useTranslations("wirtschaftsplan.months");
  const { formatEur } = useCurrencyFormatter();
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle className="text-base">{park.parkName}</CardTitle>
          <Badge variant={park.totals.netPL >= 0 ? "default" : "destructive"} className="ml-auto text-xs">
            {formatEur(park.totals.netPL)}
          </Badge>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-medium min-w-[160px]">
                    {t("tablePosition")}
                  </th>
                  {MONTH_KEYS.map((mk) => (
                    <th
                      key={mk}
                      className="text-right px-2 py-2 font-medium min-w-[80px]"
                    >
                      {tMonths(mk)}
                    </th>
                  ))}
                  <th className="text-right px-2 py-2 font-medium min-w-[90px]">
                    {t("tableTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* EINNAHMEN */}
                <tr className="bg-muted/30">
                  <td
                    colSpan={14}
                    className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {t("sectionIncome")}
                  </td>
                </tr>
                {[
                  {
                    label: t("rowEnergyRevenue"),
                    key: "energyRevenue" as keyof MonthData,
                  },
                  {
                    label: t("rowOtherRevenue"),
                    key: "otherRevenue" as keyof MonthData,
                  },
                ].map(({ label, key }) => (
                  <tr key={label} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-1 text-xs">{label}</td>
                    {park.months.map((m) => (
                      <td
                        key={m.month}
                        className="text-right px-2 py-1 text-xs"
                      >
                        {formatEur(m[key] as number)}
                      </td>
                    ))}
                    <td className="text-right px-2 py-1 text-xs font-medium">
                      {formatEur(park.totals[key] as number)}
                    </td>
                  </tr>
                ))}
                {hasBudget && (
                  <tr className="border-b bg-blue-50/30 dark:bg-blue-950/20">
                    <td className="px-3 py-1 text-xs text-muted-foreground italic">
                      {t("rowRevenuePlan")}
                    </td>
                    {park.months.map((m) => (
                      <td
                        key={m.month}
                        className="text-right px-2 py-1 text-xs text-muted-foreground"
                      >
                        {formatEur(m.budgetRevenue)}
                      </td>
                    ))}
                    <td className="text-right px-2 py-1 text-xs text-muted-foreground">
                      {formatEur(park.totals.budgetRevenue)}
                    </td>
                  </tr>
                )}
                <tr className="border-b font-medium bg-green-50/30 dark:bg-green-950/20">
                  <td className="px-3 py-1 text-xs font-semibold">
                    {t("rowTotalRevenue")}
                  </td>
                  {park.months.map((m) => (
                    <td
                      key={m.month}
                      className="text-right px-2 py-1 text-xs font-semibold"
                    >
                      {formatEur(m.totalRevenue)}
                    </td>
                  ))}
                  <td className="text-right px-2 py-1 text-xs font-semibold">
                    {formatEur(park.totals.totalRevenue)}
                  </td>
                </tr>
                {hasBudget && (
                  <tr className="border-b">
                    <td className="px-3 py-1 text-xs text-muted-foreground">
                      {t("rowRevenueVariance")}
                    </td>
                    {park.months.map((m) => (
                      <VarianceCell key={m.month} val={m.varianceRevenue} />
                    ))}
                    <VarianceCell val={park.totals.varianceRevenue} />
                  </tr>
                )}

                {/* AUSGABEN */}
                <tr className="bg-muted/30">
                  <td
                    colSpan={14}
                    className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {t("sectionExpenses")}
                  </td>
                </tr>
                {[
                  {
                    label: t("rowLeaseExpenses"),
                    key: "leaseExpenses" as keyof MonthData,
                  },
                  {
                    label: t("rowOperatingCosts"),
                    key: "operatingCosts" as keyof MonthData,
                  },
                ].map(({ label, key }) => (
                  <tr key={label} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-1 text-xs">{label}</td>
                    {park.months.map((m) => (
                      <td
                        key={m.month}
                        className="text-right px-2 py-1 text-xs"
                      >
                        {formatEur(m[key] as number)}
                      </td>
                    ))}
                    <td className="text-right px-2 py-1 text-xs font-medium">
                      {formatEur(park.totals[key] as number)}
                    </td>
                  </tr>
                ))}
                {hasBudget && (
                  <tr className="border-b bg-blue-50/30 dark:bg-blue-950/20">
                    <td className="px-3 py-1 text-xs text-muted-foreground italic">
                      {t("rowCostsPlan")}
                    </td>
                    {park.months.map((m) => (
                      <td
                        key={m.month}
                        className="text-right px-2 py-1 text-xs text-muted-foreground"
                      >
                        {formatEur(m.budgetCosts)}
                      </td>
                    ))}
                    <td className="text-right px-2 py-1 text-xs text-muted-foreground">
                      {formatEur(park.totals.budgetCosts)}
                    </td>
                  </tr>
                )}
                <tr className="border-b font-medium bg-red-50/30 dark:bg-red-950/20">
                  <td className="px-3 py-1 text-xs font-semibold">
                    {t("rowTotalCosts")}
                  </td>
                  {park.months.map((m) => (
                    <td
                      key={m.month}
                      className="text-right px-2 py-1 text-xs font-semibold"
                    >
                      {formatEur(m.totalCosts)}
                    </td>
                  ))}
                  <td className="text-right px-2 py-1 text-xs font-semibold">
                    {formatEur(park.totals.totalCosts)}
                  </td>
                </tr>
                {hasBudget && (
                  <tr className="border-b">
                    <td className="px-3 py-1 text-xs text-muted-foreground">
                      {t("rowCostsVariance")}
                    </td>
                    {park.months.map((m) => (
                      <VarianceCell
                        key={m.month}
                        val={-m.varianceCosts}
                        invert
                      />
                    ))}
                    <VarianceCell val={-park.totals.varianceCosts} invert />
                  </tr>
                )}

                {/* ERGEBNIS */}
                <tr className="bg-muted/30">
                  <td
                    colSpan={14}
                    className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {t("sectionResult")}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 text-sm font-bold">
                    {t("rowNetPl")}
                  </td>
                  {park.months.map((m) => (
                    <td
                      key={m.month}
                      className={`text-right px-2 py-2 text-sm font-bold ${
                        m.netPL >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-destructive"
                      }`}
                    >
                      {formatEur(m.netPL)}
                    </td>
                  ))}
                  <td
                    className={`text-right px-2 py-2 text-sm font-bold ${
                      park.totals.netPL >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }`}
                  >
                    {formatEur(park.totals.netPL)}
                  </td>
                </tr>
                {hasBudget && (
                  <>
                    <tr className="border-b bg-blue-50/30 dark:bg-blue-950/20">
                      <td className="px-3 py-1 text-xs text-muted-foreground italic">
                        {t("rowNetPlPlan")}
                      </td>
                      {park.months.map((m) => (
                        <td
                          key={m.month}
                          className="text-right px-2 py-1 text-xs text-muted-foreground"
                        >
                          {formatEur(m.budgetNetPL)}
                        </td>
                      ))}
                      <td className="text-right px-2 py-1 text-xs text-muted-foreground">
                        {formatEur(park.totals.budgetNetPL)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 text-xs font-medium">
                        {t("rowNetPlVariance")}
                      </td>
                      {park.months.map((m) => (
                        <VarianceCell key={m.month} val={m.varianceNetPL} />
                      ))}
                      <VarianceCell val={park.totals.varianceNetPL} />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function WirtschaftsplanPLPage() {
  const t = useTranslations("wirtschaftsplan.pl");
  const tMonths = useTranslations("wirtschaftsplan.months");
  const { formatEur } = useCurrencyFormatter();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [parkId, setParkId] = useState<string>("all");

  const url = `/api/wirtschaftsplan/pl?year=${year}${parkId !== "all" ? `&parkId=${parkId}` : ""}`;
  const { data, isLoading } = useQuery<PLData>({
    queryKey: [url],
    queryFn: () => fetcher(url),
  });

  const handleExport = useCallback(async () => {
    if (!data) return;
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const monthHeaders = MONTH_KEYS.map((mk) => tMonths(mk));

    for (const park of data.parks) {
      const rows: (string | number)[][] = [
        [t("exportHeaderPosition"), ...monthHeaders, t("exportHeaderTotal")],
        [t("sectionIncome")],
        [
          t("rowEnergyRevenue"),
          ...park.months.map((m) => m.energyRevenue),
          park.totals.energyRevenue,
        ],
        [
          t("rowOtherRevenue"),
          ...park.months.map((m) => m.otherRevenue),
          park.totals.otherRevenue,
        ],
        [
          t("exportRowTotalRevenue"),
          ...park.months.map((m) => m.totalRevenue),
          park.totals.totalRevenue,
        ],
        ...(data.hasBudget
          ? [
              [
                t("rowRevenuePlan"),
                ...park.months.map((m) => m.budgetRevenue),
                park.totals.budgetRevenue,
              ],
            ]
          : []),
        [t("sectionExpenses")],
        [
          t("rowLeaseExpenses"),
          ...park.months.map((m) => m.leaseExpenses),
          park.totals.leaseExpenses,
        ],
        [
          t("rowOperatingCosts"),
          ...park.months.map((m) => m.operatingCosts),
          park.totals.operatingCosts,
        ],
        [
          t("exportRowTotalCosts"),
          ...park.months.map((m) => m.totalCosts),
          park.totals.totalCosts,
        ],
        ...(data.hasBudget
          ? [
              [
                t("rowCostsPlan"),
                ...park.months.map((m) => m.budgetCosts),
                park.totals.budgetCosts,
              ],
            ]
          : []),
        [t("sectionResult")],
        [
          t("rowNetPl"),
          ...park.months.map((m) => m.netPL),
          park.totals.netPL,
        ],
        ...(data.hasBudget
          ? [
              [
                t("rowNetPlPlan"),
                ...park.months.map((m) => m.budgetNetPL),
                park.totals.budgetNetPL,
              ],
              [
                t("exportRowVariance"),
                ...park.months.map((m) => m.varianceNetPL),
                park.totals.varianceNetPL,
              ],
            ]
          : []),
      ];

      const worksheet = workbook.addWorksheet(park.parkName.slice(0, 30));
      for (const row of rows) {
        worksheet.addRow(row);
      }
    }

    // Write buffer and trigger browser download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = t("exportFileName", { year });
    a.click();
    URL.revokeObjectURL(blobUrl);
  }, [data, year, t, tMonths]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!data || data.parks.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          {t("exportButton")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={parkId} onValueChange={setParkId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("allParks")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allParks")}</SelectItem>
            {data?.parks.map((p) => (
              <SelectItem key={p.parkId} value={p.parkId}>
                {p.parkName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data?.hasBudget && (
          <Badge className="h-9 px-3 flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <TrendingUp className="h-3 w-3" />
            {t("budgetActive")}
          </Badge>
        )}
        {data && !data.hasBudget && (
          <Badge
            variant="outline"
            className="h-9 px-3 flex items-center gap-1 text-amber-600 border-amber-300"
          >
            <TrendingDown className="h-3 w-3" />
            {t("noBudgetForYear", { year })}
          </Badge>
        )}
      </div>

      {/* Summary KPIs */}
      {data && data.parks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {(() => {
            const totalRev = data.parks.reduce(
              (s, p) => s + p.totals.totalRevenue,
              0,
            );
            const totalCosts = data.parks.reduce(
              (s, p) => s + p.totals.totalCosts,
              0,
            );
            const totalNetPL = data.parks.reduce(
              (s, p) => s + p.totals.netPL,
              0,
            );
            return [
              {
                key: "totalRevenue",
                label: t("kpiTotalRevenue"),
                val: totalRev,
                positive: true,
              },
              {
                key: "totalCosts",
                label: t("kpiTotalCosts"),
                val: totalCosts,
                positive: false,
              },
              {
                key: "netPl",
                label: t("kpiNetPl"),
                val: totalNetPL,
                positive: totalNetPL >= 0,
              },
            ].map(({ key, label, val, positive }) => (
              <Card key={key}>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p
                    className={`text-xl font-bold mt-1 ${
                      positive
                        ? "text-green-600 dark:text-green-400"
                        : key === "totalCosts"
                          ? ""
                          : "text-destructive"
                    }`}
                  >
                    {formatEur(val)}
                  </p>
                </CardContent>
              </Card>
            ));
          })()}
        </div>
      )}

      {/* Park Tables */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data?.parks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noData", { year })}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data?.parks.map((park) => (
            <ParkTable
              key={park.parkId}
              park={park}
              hasBudget={data.hasBudget}
            />
          ))}
        </div>
      )}
    </div>
  );
}
