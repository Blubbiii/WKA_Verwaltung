"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Euro,
  Calculator,
  BarChart3,
  Upload,
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
import { SearchFilter } from "@/components/ui/search-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParks } from "@/hooks/useParks";
import { formatCurrency } from "@/lib/format";
import { type LeaseRevenueSettlementResponse } from "@/types/billing";

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

const ITEMS_PER_PAGE = 20;

// =============================================================================
// SWR FETCHER
// =============================================================================

const makeFetcher = (unknownErr: string, loadErr: string) => async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: unknownErr }));
    throw new Error(error.error || loadErr);
  }
  return res.json();
};

// =============================================================================
// STATUS BADGE HELPERS
// =============================================================================

function getStatusColor(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "ADVANCE_CREATED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "CALCULATED":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "SETTLED":
      return "bg-green-100 text-green-800 border-green-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-800 border-slate-200";
    default:
      return "";
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function UsageFeesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("leases.usageFees");
  const tStatus = useTranslations("billing.settlementStatus");
  const tCommon = useTranslations("common");

  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------
  const [selectedParkId, setSelectedParkId] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>("year");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // ---------------------------------------------------------------------------
  // Create Dialog State
  // ---------------------------------------------------------------------------
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParkId, setCreateParkId] = useState<string>("");
  const [createYear, setCreateYear] = useState<string>(currentYear.toString());
  const [createAdvanceDueDate, setCreateAdvanceDueDate] = useState<string>("");
  const [createSettlementDueDate, setCreateSettlementDueDate] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // ---------------------------------------------------------------------------
  // Import Dialog State
  // ---------------------------------------------------------------------------
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importParkId, setImportParkId] = useState<string>("");
  const [importYear, setImportYear] = useState<string>("");
  const [importRevenue, setImportRevenue] = useState<string>("");
  const [importFee, setImportFee] = useState<string>("");
  const [importUsedMinimum, setImportUsedMinimum] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const { parks, isLoading: parksLoading } = useParks();

  const apiUrl = (() => {
    const params = new URLSearchParams();
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedYear !== "all") params.set("year", selectedYear);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", currentPage.toString());
    params.set("limit", ITEMS_PER_PAGE.toString());
    return `/api/leases/usage-fees?${params.toString()}`;
  })();

  const {
    data: apiResponse,
    isLoading: settlementsLoading,
    error: settlementsError,
  } = useQuery({
    queryKey: [apiUrl],
    queryFn: () => makeFetcher(t("loaderError"), t("fetchError"))(apiUrl),
    refetchOnWindowFocus: false,
  });
  const mutate = () => queryClient.invalidateQueries({ queryKey: [apiUrl] });

  const settlements: (LeaseRevenueSettlementResponse & { _count?: { items: number } })[] =
    apiResponse?.data || [];
  const pagination = apiResponse?.pagination;

  const isLoading = parksLoading || settlementsLoading;
  const isError = !!settlementsError;

  // ---------------------------------------------------------------------------
  // Sorting (client-side within current page)
  // ---------------------------------------------------------------------------
  const sortedSettlements = [...settlements].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case "park":
        comparison = (a.park?.name || "").localeCompare(b.park?.name || "", "de");
        break;
      case "year":
        comparison = a.year - b.year;
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      case "revenue":
        comparison =
          Number(a.totalParkRevenueEur || 0) - Number(b.totalParkRevenueEur || 0);
        break;
      case "calculated":
        comparison =
          Number(a.calculatedFeeEur || 0) - Number(b.calculatedFeeEur || 0);
        break;
      case "minimum":
        comparison =
          Number(a.minimumGuaranteeEur || 0) - Number(b.minimumGuaranteeEur || 0);
        break;
      case "actual":
        comparison =
          Number(a.actualFeeEur || 0) - Number(b.actualFeeEur || 0);
        break;
      default:
        comparison = 0;
    }

    return sortDirection === "desc" ? -comparison : comparison;
  });

  // ---------------------------------------------------------------------------
  // KPI Stats
  // ---------------------------------------------------------------------------
  const totalRevenue = settlements.reduce(
    (sum, s) => sum + Number(s.totalParkRevenueEur || 0),
    0
  );
  const totalActualFee = settlements.reduce(
    (sum, s) => sum + Number(s.actualFeeEur || 0),
    0
  );
  const openCount = settlements.filter(
    (s) => s.status === "OPEN" || s.status === "CALCULATED"
  ).length;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleFilterChange = (
    setter: (value: string) => void,
    value: string
  ) => {
    setter(value);
    setCurrentPage(1);
  };

  const totalPages = pagination?.totalPages || 1;

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handleCreate = async () => {
    if (!createParkId || !createYear) {
      toast.error(t("create.validationError"));
      return;
    }

    try {
      setCreating(true);
      const body: Record<string, unknown> = {
        parkId: createParkId,
        year: parseInt(createYear),
      };
      if (createAdvanceDueDate) {
        body.advanceDueDate = new Date(createAdvanceDueDate).toISOString();
      }
      if (createSettlementDueDate) {
        body.settlementDueDate = new Date(createSettlementDueDate).toISOString();
      }

      const res = await fetch("/api/leases/usage-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("create.unknownError") }));
        throw new Error(err.error || err.details || t("create.errorFallback"));
      }

      const created = await res.json();
      toast.success(t("create.successToast"));
      setCreateDialogOpen(false);
      resetCreateForm();
      mutate();

      // Navigate to the new settlement
      router.push(`/leases/usage-fees/${created.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("create.errorFallback")
      );
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateParkId("");
    setCreateYear(currentYear.toString());
    setCreateAdvanceDueDate("");
    setCreateSettlementDueDate("");
  };

  const handleImport = async () => {
    if (!importParkId || !importYear || !importFee) {
      toast.error(t("import.validationError"));
      return;
    }

    try {
      setImporting(true);
      const body = {
        parkId: importParkId,
        year: parseInt(importYear),
        totalParkRevenueEur: parseFloat(importRevenue || "0"),
        actualFeeEur: parseFloat(importFee),
        usedMinimum: importUsedMinimum,
        items: [],
      };

      const res = await fetch("/api/leases/usage-fees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("create.unknownError") }));
        throw new Error(err.error || err.details || t("import.errorFallback"));
      }

      toast.success(t("import.successToast"));
      setImportDialogOpen(false);
      setImportParkId("");
      setImportYear("");
      setImportRevenue("");
      setImportFee("");
      setImportUsedMinimum(false);
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("import.errorFallback")
      );
    } finally {
      setImporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("pageDescription")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("historicalImport")}
          </Button>
          <Button
            onClick={() => {
              resetCreateForm();
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("newSettlement")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpi.yearlyRevenue")}</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalRevenue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedYear !== "all"
                    ? t("kpi.yearlyRevenueHintScope", {
                        year: selectedYear,
                        scope: selectedParkId === "all" ? t("kpi.scopeAllParks") : t("kpi.scopeSelectedPark"),
                      })
                    : t("kpi.yearlyRevenueHintAll")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.totalFee")}
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalActualFee)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("kpi.totalFeeHint")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.openSettlements")}
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{openCount}</div>
                <p className="text-xs text-muted-foreground">
                  {t("kpi.openSettlementsHint")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("kpi.totalSettlements")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {pagination?.total || settlements.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedYear !== "all" ? selectedYear : t("filters.allYears")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tableCardTitle")}</CardTitle>
          <CardDescription>
            {t("tableCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <SearchFilter
            filters={[
              {
                value: selectedParkId,
                onChange: (value) =>
                  handleFilterChange(setSelectedParkId, value),
                placeholder: t("filters.parkPlaceholder"),
                width: "w-[200px]",
                options: [
                  { value: "all", label: t("filters.allParks") },
                  ...(parks?.map((park) => ({
                    value: park.id,
                    label: park.name,
                  })) || []),
                ],
              },
              {
                value: selectedYear,
                onChange: (value) =>
                  handleFilterChange(setSelectedYear, value),
                placeholder: t("filters.yearPlaceholder"),
                width: "w-[140px]",
                options: [
                  { value: "all", label: t("filters.allYears") },
                  ...years.map((year) => ({
                    value: year.toString(),
                    label: year.toString(),
                  })),
                ],
              },
              {
                value: statusFilter,
                onChange: (value) =>
                  handleFilterChange(setStatusFilter, value),
                placeholder: t("filters.statusPlaceholder"),
                width: "w-[180px]",
                options: [
                  { value: "all", label: t("filters.allStatus") },
                  { value: "OPEN", label: t("filters.statusOpen") },
                  { value: "CALCULATED", label: t("filters.statusCalculated") },
                  { value: "ADVANCE_CREATED", label: t("filters.statusAdvanceCreated") },
                  { value: "SETTLED", label: t("filters.statusSettled") },
                  { value: "CLOSED", label: t("filters.statusClosed") },
                ],
              },
            ]}
          />

          <div className="mb-4" />

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("park")}
                  >
                    <div className="flex items-center gap-1">
                      {t("columns.park")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("year")}
                  >
                    <div className="flex items-center gap-1">
                      {t("columns.year")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      {t("columns.status")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("columns.revenue")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("calculated")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("columns.calculated")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("minimum")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("columns.minimum")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("actual")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("columns.actual")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px]">
                    <span className="sr-only">{t("columns.actionsSr")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading Skeleton
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
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
                ) : sortedSettlements.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <p>{t("emptyTitle")}</p>
                        {(selectedParkId !== "all" ||
                          selectedYear !== "all" ||
                          statusFilter !== "all") && (
                          <p className="text-sm">
                            {t("emptyHintFilters")}
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            resetCreateForm();
                            setCreateDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t("createCtaEmpty")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  // Data Rows
                  sortedSettlements.map((settlement) => (
                    <TableRow
                      key={settlement.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/leases/usage-fees/${settlement.id}`)
                      }
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/leases/usage-fees/${settlement.id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {settlement.park?.name || "-"}
                      </TableCell>
                      <TableCell>{settlement.year}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(settlement.status)}
                        >
                          {tStatus(settlement.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(settlement.totalParkRevenueEur || 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {settlement.status === "OPEN"
                          ? "-"
                          : formatCurrency(Number(settlement.calculatedFeeEur || 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {settlement.status === "OPEN"
                          ? "-"
                          : formatCurrency(
                              Number(settlement.minimumGuaranteeEur || 0)
                            )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {settlement.status === "OPEN" ? (
                          "-"
                        ) : (
                          <span
                            className={
                              settlement.usedMinimum
                                ? "text-amber-600 font-semibold"
                                : ""
                            }
                          >
                            {formatCurrency(
                              Number(settlement.actualFeeEur || 0)
                            )}
                            {settlement.usedMinimum && " *"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t("detailsAria")}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/leases/usage-fees/${settlement.id}`
                            );
                          }}
                        >
                          {t("detailsButton")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!isLoading && pagination && pagination.total > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t("pagination.showing", {
                  from: (currentPage - 1) * (pagination.limit || ITEMS_PER_PAGE) + 1,
                  to: Math.min(currentPage * (pagination.limit || ITEMS_PER_PAGE), pagination.total),
                  total: pagination.total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  aria-label={t("pagination.prevAria")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {t("pagination.pageOf", { current: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  aria-label={t("pagination.nextAria")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("create.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("create.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Park Selection */}
            <div className="space-y-2">
              <Label htmlFor="create-park">{t("create.parkLabel")}</Label>
              <Select value={createParkId} onValueChange={setCreateParkId}>
                <SelectTrigger id="create-park">
                  <SelectValue placeholder={t("create.parkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {parks?.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="space-y-2">
              <Label htmlFor="create-year">{t("create.yearLabel")}</Label>
              <Input
                id="create-year"
                type="number"
                min={2000}
                max={2100}
                value={createYear}
                onChange={(e) => setCreateYear(e.target.value)}
              />
            </div>

            {/* Advance Due Date */}
            <div className="space-y-2">
              <Label htmlFor="create-advance-due">
                {t("create.advanceDueLabel")}
              </Label>
              <Input
                id="create-advance-due"
                type="date"
                value={createAdvanceDueDate}
                onChange={(e) => setCreateAdvanceDueDate(e.target.value)}
              />
            </div>

            {/* Settlement Due Date */}
            <div className="space-y-2">
              <Label htmlFor="create-settlement-due">
                {t("create.settlementDueLabel")}
              </Label>
              <Input
                id="create-settlement-due"
                type="date"
                value={createSettlementDueDate}
                onChange={(e) => setCreateSettlementDueDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createParkId}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {t("create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("import.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("import.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-park">{t("import.parkLabel")}</Label>
              <Select value={importParkId} onValueChange={setImportParkId}>
                <SelectTrigger id="import-park">
                  <SelectValue placeholder={t("import.parkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {parks?.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-year">{t("import.yearLabel")}</Label>
              <Input
                id="import-year"
                type="number"
                min={2000}
                max={2100}
                value={importYear}
                onChange={(e) => setImportYear(e.target.value)}
                placeholder={t("import.yearPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-revenue">{t("import.revenueLabel")}</Label>
              <Input
                id="import-revenue"
                type="number"
                step="0.01"
                min="0"
                value={importRevenue}
                onChange={(e) => setImportRevenue(e.target.value)}
                placeholder={t("import.revenuePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-fee">{t("import.feeLabel")}</Label>
              <Input
                id="import-fee"
                type="number"
                step="0.01"
                min="0"
                value={importFee}
                onChange={(e) => setImportFee(e.target.value)}
                placeholder={t("import.feePlaceholder")}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="import-minimum"
                type="checkbox"
                checked={importUsedMinimum}
                onChange={(e) => setImportUsedMinimum(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="import-minimum">{t("import.minimumAppliedLabel")}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={importing}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !importParkId || !importYear || !importFee}
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t("import.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
