"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  FileText,
  Eye,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/format";
import {
  type ParkCostAllocationStatus,
  type ParkCostAllocationResponse,
} from "@/types/billing";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const makeFetcher = (errMsg: string) => (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(errMsg);
    return res.json();
  });

const ALLOCATION_STATUS_COLORS: Record<ParkCostAllocationStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80",
  INVOICED: "bg-green-100 text-green-800 hover:bg-green-100/80",
  CLOSED: "bg-slate-100 text-slate-800 hover:bg-slate-100/80",
};

type CostAllocationListItem = Omit<ParkCostAllocationResponse, "leaseRevenueSettlement"> & {
  leaseRevenueSettlement?: {
    id: string;
    parkId: string;
    year: number;
    status: string;
    park?: {
      id: string;
      name: string;
      shortName: string | null;
    };
  };
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function CostAllocationPage() {
  const router = useRouter();
  const t = useTranslations("leases.costAllocation");
  const statusLabels: Record<ParkCostAllocationStatus, string> = {
    DRAFT: t("statusLabels.DRAFT"),
    INVOICED: t("statusLabels.INVOICED"),
    CLOSED: t("statusLabels.CLOSED"),
  };

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const {
    data: response,
    isLoading,
    error: isError,
  } = useQuery<{ data: CostAllocationListItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["/api/leases/cost-allocation"],
    queryFn: () => makeFetcher(t("fetchError"))("/api/leases/cost-allocation"),
  });

  const allocations = response?.data;

  // ---------------------------------------------------------------------------
  // KPI Stats
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    if (!allocations || allocations.length === 0) {
      return {
        total: 0,
        totalUsageFee: 0,
        totalTaxable: 0,
        totalExempt: 0,
        draftCount: 0,
      };
    }

    return {
      total: allocations.length,
      totalUsageFee: allocations.reduce(
        (sum, a) => sum + Number(a.totalUsageFeeEur || 0),
        0
      ),
      totalTaxable: allocations.reduce(
        (sum, a) => sum + Number(a.totalTaxableEur || 0),
        0
      ),
      totalExempt: allocations.reduce(
        (sum, a) => sum + Number(a.totalExemptEur || 0),
        0
      ),
      draftCount: allocations.filter((a) => a.status === "DRAFT").length,
    };
  }, [allocations]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.total")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalUsageFee)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.taxable")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalTaxable)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.exempt")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalExempt)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.drafts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.draftCount}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>
            {t("table.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      {t("table.park")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>{t("table.year")}</TableHead>
                  <TableHead>{t("table.period")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-right">{t("table.total")}</TableHead>
                  <TableHead className="text-right">{t("table.taxable")}</TableHead>
                  <TableHead className="text-right">{t("table.exempt")}</TableHead>
                  <TableHead className="w-[80px]">
                    <span className="sr-only">{t("table.actionsSr")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading Skeleton
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : isError ? (
                  // Error State
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="text-destructive">
                        {t("loadError")}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : !allocations || allocations.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <p>{t("emptyTitle")}</p>
                        <p className="text-sm">
                          {t("emptyHint")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  // Data Rows
                  allocations.map((allocation) => (
                    <TableRow
                      key={allocation.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(
                          `/leases/cost-allocation/${allocation.id}`
                        )
                      }
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(
                            `/leases/cost-allocation/${allocation.id}`
                          );
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {allocation.leaseRevenueSettlement?.park?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {allocation.leaseRevenueSettlement?.year || "-"}
                      </TableCell>
                      <TableCell>{allocation.periodLabel || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            ALLOCATION_STATUS_COLORS[allocation.status]
                          }
                        >
                          {statusLabels[allocation.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(allocation.totalUsageFeeEur))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(allocation.totalTaxableEur))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(allocation.totalExemptEur))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={t("showDetailsAria")}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/leases/cost-allocation/${allocation.id}`
                            );
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
