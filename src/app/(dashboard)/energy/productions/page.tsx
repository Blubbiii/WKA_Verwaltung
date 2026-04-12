"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Zap,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Plus,
  Pencil,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilter } from "@/components/ui/search-filter";
import { useParks } from "@/hooks/useParks";
import { monthNames } from "@/hooks/useEnergySettlements";
import { useApiQuery } from "@/hooks/useApiQuery";
import { ProductionImportSheet } from "@/components/energy/production-import-sheet";
import {
  ProductionEntryDialog,
  type ProductionEditData,
} from "@/components/energy/production-entry-dialog";

// =============================================================================
// TYPES
// =============================================================================

interface TurbineProductionRecord {
  id: string;
  year: number;
  month: number;
  productionKwh: number;
  operatingHours: number | null;
  availabilityPct: number | null;
  source: string;
  status: string;
  notes: string | null;
  revenueEur?: number | null;
  turbine: {
    id: string;
    designation: string;
    park: {
      id: string;
      name: string;
    };
  };
  revenueType?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface ProductionsResponse {
  data: TurbineProductionRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  aggregations: {
    totalProductionKwh: number;
  };
}

interface Turbine {
  id: string;
  designation: string;
  parkId: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 11 }, (_, i) => currentYear + 1 - i);

// sourceLabels moved to useTranslations

const sourceBadgeColors: Record<string, string> = {
  MANUAL: "bg-blue-50 text-blue-700 border-blue-200",
  CSV_IMPORT: "bg-purple-50 text-purple-700 border-purple-200",
  EXCEL_IMPORT: "bg-purple-50 text-purple-700 border-purple-200",
  SCADA: "bg-blue-50 text-blue-700 border-blue-200",
};

// statusLabels moved to useTranslations

const statusBadgeColors: Record<string, string> = {
  DRAFT: "bg-gray-50 text-gray-700 border-gray-200",
  CONFIRMED: "bg-green-50 text-green-700 border-green-200",
  INVOICED: "bg-amber-50 text-amber-700 border-amber-200",
};

// =============================================================================
// FORMATTERS
// =============================================================================

const numberFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMWh(kwh: number): string {
  const mwh = kwh / 1000;
  return numberFormatter.format(mwh);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ProductionDataPage() {
  const t = useTranslations("energy.productions");
  const tSrc = useTranslations("energy.sourceLabels");
  const tSt = useTranslations("energy.statusLabels");
  // Filter State
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedParkId, setSelectedParkId] = useState<string>("all");
  const [selectedTurbineId, setSelectedTurbineId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>("period");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Overlay State
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editData, setEditData] = useState<ProductionEditData | null>(null);

  // Data Fetching - Parks
  const { parks, isLoading: parksLoading } = useParks();

  // Turbines for selected park
  interface ParkDetailResponse {
    turbines: Turbine[];
  }

  const { data: parkDetailData, isLoading: turbinesLoading } = useApiQuery<ParkDetailResponse>(
    ["park-detail", selectedParkId],
    selectedParkId !== "all" ? `/api/parks/${selectedParkId}` : null,
    { staleTime: 5 * 60 * 1000 }
  );

  const turbines = parkDetailData?.turbines ?? [];

  // Load turbines when park changes
  const handleParkChange = (value: string) => {
    setSelectedParkId(value);
    setSelectedTurbineId("all");
    setCurrentPage(1);
  };

  // Build query string for TurbineProduction API
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("year", selectedYear);
    if (selectedMonth !== "all") params.set("month", selectedMonth);
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedTurbineId !== "all") params.set("turbineId", selectedTurbineId);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    params.set("page", currentPage.toString());
    params.set("limit", "25");
    return params.toString();
  }, [selectedYear, selectedMonth, selectedParkId, selectedTurbineId, selectedStatus, currentPage]);

  const {
    data: productionsData,
    error: productionsError,
    isLoading: productionsLoading,
    refetch,
  } = useApiQuery<ProductionsResponse>(
    ["productions", selectedYear, selectedMonth, selectedParkId, selectedTurbineId, selectedStatus, currentPage.toString()],
    `/api/energy/productions?${queryParams}`,
    { staleTime: 30 * 1000 }
  );

  const productions = useMemo(
    () => productionsData?.data ?? [],
    [productionsData]
  );
  const pagination = productionsData?.pagination;
  const aggregations = productionsData?.aggregations;
  const isError = !!productionsError;

  // Sorted Productions (client-side sort)
  const sortedProductions = useMemo(() => {
    if (!productions.length) return productions;

    return [...productions].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "turbine":
          comparison = (a.turbine?.designation || "").localeCompare(
            b.turbine?.designation || ""
          );
          break;
        case "park":
          comparison = (a.turbine?.park?.name || "").localeCompare(
            b.turbine?.park?.name || ""
          );
          break;
        case "period": {
          const aVal = a.year * 100 + a.month;
          const bVal = b.year * 100 + b.month;
          comparison = aVal - bVal;
          break;
        }
        case "production":
          comparison = Number(a.productionKwh) - Number(b.productionKwh);
          break;
        case "operatingHours":
          comparison = (Number(a.operatingHours) || 0) - (Number(b.operatingHours) || 0);
          break;
        case "availability":
          comparison = (Number(a.availabilityPct) || 0) - (Number(b.availabilityPct) || 0);
          break;
        case "source":
          comparison = (a.source || "").localeCompare(b.source || "");
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [productions, sortField, sortDirection]);

  // Toggle Sort
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Pagination
  const totalPages = pagination?.totalPages || 1;

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  // Filter change handlers (reset page to 1)
  const handleYearChange = (value: string) => {
    setSelectedYear(value);
    setCurrentPage(1);
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    setCurrentPage(1);
  };

  const handleTurbineChange = (value: string) => {
    setSelectedTurbineId(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  // Overlay handlers
  const handleImportSuccess = () => {
    setImportSheetOpen(false);
    refetch();
  };

  const handleEntrySuccess = () => {
    setEntryDialogOpen(false);
    setEditData(null);
    refetch();
  };

  const handleEditClick = (row: TurbineProductionRecord) => {
    setEditData({
      id: row.id,
      year: row.year,
      month: row.month,
      productionKwh: Number(row.productionKwh),
      revenueEur: row.revenueEur != null ? Number(row.revenueEur) : null,
      notes: row.notes,
      source: row.source,
      status: row.status,
      turbine: row.turbine,
      revenueType: row.revenueType ?? null,
    });
    setEntryDialogOpen(true);
  };

  const isLoading = parksLoading || productionsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportSheetOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            {t("csvImport")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditData(null);
              setEntryDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("manualEntry")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gesamtproduktion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("totalProductionTurbines")}
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatMWh(aggregations?.totalProductionKwh ?? 0)} MWh
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedParkId === "all"
                    ? t("allParks")
                    : t("selectedPark")}{" "}
                  - {selectedYear}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Datensaetze */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("records")}</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {pagination?.total ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("filteredEntries")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("productionData")}</CardTitle>
          <CardDescription>
            {t("monthlyPerTurbine")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <SearchFilter
            filters={[
              {
                value: selectedYear,
                onChange: handleYearChange,
                placeholder: "Jahr",
                width: "w-[120px]",
                options: years.map((year) => ({
                  value: year.toString(),
                  label: year.toString(),
                })),
              },
              {
                value: selectedMonth,
                onChange: handleMonthChange,
                placeholder: "Monat",
                width: "w-[150px]",
                options: [
                  { value: "all", label: t("allMonths") },
                  ...Object.entries(monthNames).map(([num, name]) => ({
                    value: num,
                    label: name,
                  })),
                ],
              },
              {
                value: selectedParkId,
                onChange: handleParkChange,
                placeholder: t("selectPark"),
                width: "w-[180px]",
                options: [
                  { value: "all", label: t("allParks") },
                  ...(parks?.map((park) => ({
                    value: park.id,
                    label: park.name,
                  })) || []),
                ],
              },
              {
                value: selectedStatus,
                onChange: handleStatusChange,
                placeholder: "Status",
                width: "w-[150px]",
                options: [
                  { value: "all", label: t("allStatus") },
                  { value: "DRAFT", label: tSt("DRAFT") },
                  { value: "CONFIRMED", label: tSt("CONFIRMED") },
                  { value: "INVOICED", label: tSt("INVOICED") },
                ],
              },
            ]}
          >
            {/* Turbine Filter - dynamic options based on selected park */}
            <Select
              value={selectedTurbineId}
              onValueChange={handleTurbineChange}
              disabled={selectedParkId === "all" || turbinesLoading}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue
                  placeholder={
                    selectedParkId === "all"
                      ? t("selectParkFirst")
                      : t("selectTurbine")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTurbines")}</SelectItem>
                {turbines.map((turbine) => (
                  <SelectItem key={turbine.id} value={turbine.id}>
                    {turbine.designation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SearchFilter>

          <div className="mb-2" />

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("turbine")}
                  >
                    <div className="flex items-center gap-1">
                      {t("turbine")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("park")}
                  >
                    <div className="flex items-center gap-1">
                      {t("park")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("period")}
                  >
                    <div className="flex items-center gap-1">
                      {t("period")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("production")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("productionMWh")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("operatingHours")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("operatingHours")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("availability")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {t("availabilityCol")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("source")}
                  >
                    <div className="flex items-center gap-1">
                      {t("source")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      {t("status")}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading Skeleton
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : isError ? (
                  // Error State
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-destructive">
                          {t("loadError")}
                        </p>
                        <Button onClick={() => refetch()} variant="outline" size="sm">
                          {t("retry")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedProductions.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {t("emptyState")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setImportSheetOpen(true)}
                          >
                            {t("csvImportAction")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditData(null);
                              setEntryDialogOpen(true);
                            }}
                          >
                            {t("manualEntry")}
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  // Data Rows
                  sortedProductions.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.turbine?.designation ?? "-"}
                      </TableCell>
                      <TableCell>
                        {row.turbine?.park?.name ?? "-"}
                      </TableCell>
                      <TableCell>
                        {monthNames[row.month] ?? row.month} {row.year}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMWh(Number(row.productionKwh))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.operatingHours != null
                          ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(row.operatingHours))
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.availabilityPct != null
                          ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(row.availabilityPct)) + " %"
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={sourceBadgeColors[row.source] || ""}
                        >
                          {tSrc(row.source as "MANUAL" | "CSV_IMPORT" | "EXCEL_IMPORT" | "SCADA")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeColors[row.status] || ""}
                        >
                          {tSt(row.status as "DRAFT" | "CONFIRMED" | "INVOICED")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditClick(row)}
                          aria-label={t("edit")}
                        >
                          <Pencil className="h-4 w-4" />
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
                {t("showRange", { from: (currentPage - 1) * (pagination.limit || 25) + 1, to: Math.min(currentPage * (pagination.limit || 25), pagination.total), total: pagination.total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  aria-label="Vorherige Seite"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {t("pageInfo", { page: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  aria-label="Nächste Seite"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overlay Components */}
      <ProductionImportSheet
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
        onSuccess={handleImportSuccess}
      />
      <ProductionEntryDialog
        open={entryDialogOpen}
        onOpenChange={(open) => {
          setEntryDialogOpen(open);
          if (!open) setEditData(null);
        }}
        onSuccess={handleEntrySuccess}
        editData={editData}
      />
    </div>
  );
}
