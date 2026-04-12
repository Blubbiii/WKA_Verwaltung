"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  Zap,
  TrendingUp,
  FileText,
  Clock,
  Wind,
  Radio,
  ArrowRight,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { KPICard, KPICardGrid, KPICardGridSkeleton } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScadaKpiCards } from "@/components/energy/scada-kpi-cards";
import {
  settlementStatusLabels,
  settlementStatusColors,
  formatPeriod,
  type EnergySettlementStatus,
} from "@/hooks/useEnergySettlements";

// =============================================================================
// TYPES
// =============================================================================

interface ProductionEntry {
  id: string;
  year: number;
  month: number;
  productionKwh: number;
  revenueEur: number | null;
  source: string;
  status: string;
  createdAt: string;
  turbine?: {
    id: string;
    designation: string;
    park?: {
      id: string;
      name: string;
    };
  };
  revenueType?: {
    id: string;
    name: string;
    code: string;
  };
}

// sourceLabels moved to useTranslations

interface SettlementEntry {
  id: string;
  year: number;
  month: number | null;
  totalProductionKwh: number;
  netOperatorRevenueEur: number;
  status: EnergySettlementStatus;
  createdAt: string;
  park?: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

interface OverviewData {
  totalProductionKwh: number;
  totalRevenueEur: number;
  openSettlementsCount: number;
  lastImportDate: string | null;
  turbineCount: number;
  scadaCoverage: number;
  recentProductions: ProductionEntry[];
  recentSettlements: SettlementEntry[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();

// =============================================================================
// HELPERS
// =============================================================================

function formatMWh(kwh: number): string {
  const mwh = kwh / 1000;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(mwh);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
}

// =============================================================================
// DATA FETCHING
// =============================================================================

async function fetchOverviewData(): Promise<OverviewData> {
  // Fetch all data in parallel
  const [
    productionsRes,
    settlementsRes,
    turbinesRes,
    scadaMappingsRes,
  ] = await Promise.all([
    fetch(`/api/energy/productions?year=${currentYear}&limit=5`),
    fetch(`/api/energy/settlements?year=${currentYear}&limit=5`),
    fetch("/api/turbines?limit=1000&status=ACTIVE"),
    fetch("/api/energy/scada/mappings"),
  ]);

  // Parse responses (handle failures gracefully)
  const productionsData = productionsRes.ok
    ? await productionsRes.json()
    : { data: [], aggregations: { totalProductionKwh: 0, totalRevenueEur: 0 } };

  const settlementsData = settlementsRes.ok
    ? await settlementsRes.json()
    : { data: [], aggregations: { totalProductionKwh: 0, totalRevenueEur: 0 } };

  const turbinesData = turbinesRes.ok
    ? await turbinesRes.json()
    : { data: [], pagination: { total: 0 } };

  const scadaMappingsData = scadaMappingsRes.ok
    ? await scadaMappingsRes.json()
    : { data: [] };

  // Extract data
  const recentProductions: ProductionEntry[] = productionsData.data ?? [];
  const recentSettlements: SettlementEntry[] = settlementsData.data ?? [];
  const scadaMappings = scadaMappingsData.data ?? scadaMappingsData ?? [];

  // Count turbines
  const turbineCount = turbinesData.pagination?.total ?? (turbinesData.data?.length ?? 0);

  // Count unique turbines with active SCADA mapping
  const activeMappings = Array.isArray(scadaMappings)
    ? scadaMappings.filter((m: { status: string }) => m.status === "ACTIVE")
    : [];
  const uniqueScadaTurbines = new Set(
    activeMappings.map((m: { turbineId: string }) => m.turbineId)
  );

  // Calculate open settlements count
  const openSettlementsCount = recentSettlements.filter(
    (s) => s.status === "DRAFT" || s.status === "CALCULATED"
  ).length;

  // Find the last import date
  let lastImportDate: string | null = null;
  if (recentProductions.length > 0) {
    lastImportDate = recentProductions[0].createdAt;
  }
  if (recentSettlements.length > 0) {
    const settlementDate = recentSettlements[0].createdAt;
    if (!lastImportDate || new Date(settlementDate) > new Date(lastImportDate)) {
      lastImportDate = settlementDate;
    }
  }

  return {
    totalProductionKwh: Number(productionsData.aggregations?.totalProductionKwh ?? 0),
    totalRevenueEur: Number(settlementsData.aggregations?.totalRevenueEur ?? 0),
    openSettlementsCount,
    lastImportDate,
    turbineCount,
    scadaCoverage: uniqueScadaTurbines.size,
    recentProductions,
    recentSettlements,
  };
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function EnergyOverviewPage() {
  const t = useTranslations("energy.overview");
  const tSrc = useTranslations("energy.sourceLabels");
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const result = await fetchOverviewData();
        if (!cancelled) {
          setData(result);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {/* KPI Cards */}
      {isLoading ? (
        <KPICardGridSkeleton count={6} />
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              {t("loadError")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <KPICardGrid className="lg:grid-cols-3 xl:grid-cols-6">
          <KPICard
            title={t("totalProductionTurbines")}
            value={`${formatMWh(data?.totalProductionKwh ?? 0)} MWh`}
            icon={Zap}
            description={t("productionDataYear", { year: currentYear })}
          />
          <KPICard
            title={t("gridOperatorRevenue")}
            value={formatCurrency(data?.totalRevenueEur ?? 0)}
            icon={TrendingUp}
            description={t("gridOperatorRevenueYear", { year: currentYear })}
          />
          <KPICard
            title={t("openSettlements")}
            value={data?.openSettlementsCount ?? 0}
            icon={FileText}
            description={t("draftOrCalculated")}
            isAlert={(data?.openSettlementsCount ?? 0) > 0}
          />
          <KPICard
            title={t("lastImport")}
            value={
              data?.lastImportDate
                ? format(new Date(data.lastImportDate), "dd.MM.yyyy", {
                    locale: de,
                  })
                : "-"
            }
            icon={Clock}
            description={
              data?.lastImportDate
                ? format(new Date(data.lastImportDate), "HH:mm 'Uhr'", {
                    locale: de,
                  })
                : t("noData")
            }
          />
          <KPICard
            title={t("turbineCount")}
            value={formatNumber(data?.turbineCount ?? 0)}
            icon={Wind}
            description={t("activeTurbines")}
          />
          <KPICard
            title={t("scadaCoverage")}
            value={formatNumber(data?.scadaCoverage ?? 0)}
            icon={Radio}
            description={
              data?.turbineCount
                ? t("ofTurbines", { count: data.turbineCount })
                : t("turbinesWithScada")
            }
          />
        </KPICardGrid>
      )}

      {/* SCADA Live KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("scadaLiveData")}
          </h2>
        </div>
        <ScadaKpiCards />
      </div>

      {/* Summary Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Productions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("recentProductions")}</CardTitle>
                <CardDescription>
                  {t("recentProductionsDesc")}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/energy/productions">
                  {t("showAll")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-32 flex-1" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <p className="text-center text-muted-foreground py-8">
                {t("dataLoadError")}
              </p>
            ) : data?.recentProductions && data.recentProductions.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("turbine")}</TableHead>
                      <TableHead>{t("period")}</TableHead>
                      <TableHead className="text-right">
                        {t("productionMWh")}
                      </TableHead>
                      <TableHead>{t("source")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentProductions.map((production) => (
                      <TableRow key={production.id}>
                        <TableCell className="font-medium">
                          {production.turbine?.designation ?? "-"}
                        </TableCell>
                        <TableCell>
                          {formatPeriod(production.year, production.month)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatMWh(Number(production.productionKwh))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {tSrc(production.source as "MANUAL" | "CSV_IMPORT" | "EXCEL_IMPORT" | "SCADA")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {t("noProductionData")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Settlements */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("recentSettlements")}</CardTitle>
                <CardDescription>
                  {t("recentSettlementsDesc")}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/energy/settlements">
                  {t("showAll")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-32 flex-1" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <p className="text-center text-muted-foreground py-8">
                {t("dataLoadError")}
              </p>
            ) : data?.recentSettlements && data.recentSettlements.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("park")}</TableHead>
                      <TableHead>{t("period")}</TableHead>
                      <TableHead className="text-right">{t("revenue")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentSettlements.map((settlement) => (
                      <TableRow
                        key={settlement.id}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell className="font-medium">
                          <Link
                            href={`/energy/settlements/${settlement.id}`}
                            className="hover:underline"
                          >
                            {settlement.park?.name ?? "-"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {formatPeriod(settlement.year, settlement.month)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(
                            Number(settlement.netOperatorRevenueEur)
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              settlementStatusColors[settlement.status]
                            }
                          >
                            {settlementStatusLabels[settlement.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {t("noSettlementData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
