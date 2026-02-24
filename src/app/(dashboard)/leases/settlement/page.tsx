"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Plus,
  FileText,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Euro,
  Calculator,
  BarChart3,
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
import { PageHeader } from "@/components/ui/page-header";
import { useParks } from "@/hooks/useParks";
import { formatCurrency } from "@/lib/format";
import {
  SETTLEMENT_STATUS_LABELS,
  getSettlementPeriodLabel,
  type LeaseRevenueSettlementStatus,
} from "@/types/billing";

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

const ITEMS_PER_PAGE = 20;

// =============================================================================
// TYPES
// =============================================================================

interface SettlementListItem {
  id: string;
  parkId: string;
  year: number;
  status: LeaseRevenueSettlementStatus;
  periodType: string;
  advanceInterval: string | null;
  month: number | null;
  totalParkRevenueEur: number;
  actualFeeEur: number;
  calculatedFeeEur: number;
  minimumGuaranteeEur: number;
  usedMinimum: boolean;
  createdAt: string;
  updatedAt: string;
  park?: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiResponse {
  data: SettlementListItem[];
  pagination: PaginationInfo;
  kpis?: {
    totalRevenueFinal: number;
    totalActualFeeFinal: number;
    openCount: number;
    totalCount: number;
  };
}

// =============================================================================
// SWR FETCHER
// =============================================================================

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// STATUS BADGE COLOR HELPER
// =============================================================================

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "CALCULATED":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "ADVANCE_CREATED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "SETTLED":
      return "bg-green-100 text-green-700 border-green-200";
    case "PENDING_REVIEW":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "CANCELLED":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function LeaseSettlementOverviewPage() {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------
  const [selectedParkId, setSelectedParkId] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedPeriodType, setSelectedPeriodType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>("year");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const { parks, isLoading: parksLoading } = useParks();

  const apiUrl = (() => {
    const params = new URLSearchParams();
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedYear !== "all") params.set("year", selectedYear);
    if (selectedPeriodType !== "all")
      params.set("periodType", selectedPeriodType);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", currentPage.toString());
    params.set("limit", ITEMS_PER_PAGE.toString());
    return `/api/leases/settlement?${params.toString()}`;
  })();

  const {
    data: apiResponse,
    isLoading: settlementsLoading,
    error: settlementsError,
  } = useSWR<ApiResponse>(apiUrl, fetcher, { revalidateOnFocus: false });

  const settlements: SettlementListItem[] = apiResponse?.data || [];
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
        comparison = (a.park?.name || "").localeCompare(
          b.park?.name || "",
          "de"
        );
        break;
      case "year":
        comparison = a.year - b.year;
        break;
      case "type":
        comparison = (a.periodType || "").localeCompare(b.periodType || "");
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      case "revenue":
        comparison =
          Number(a.totalParkRevenueEur || 0) -
          Number(b.totalParkRevenueEur || 0);
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
  // KPI Stats (from API kpis or calculated client-side)
  // ---------------------------------------------------------------------------
  const kpis = apiResponse?.kpis;

  const totalRevenueFinal =
    kpis?.totalRevenueFinal ??
    settlements
      .filter((s) => s.periodType === "FINAL")
      .reduce((sum, s) => sum + Number(s.totalParkRevenueEur || 0), 0);

  const totalActualFeeFinal =
    kpis?.totalActualFeeFinal ??
    settlements
      .filter((s) => s.periodType === "FINAL")
      .reduce((sum, s) => sum + Number(s.actualFeeEur || 0), 0);

  const openCount =
    kpis?.openCount ??
    settlements.filter(
      (s) => s.status === "OPEN" || s.status === "CALCULATED"
    ).length;

  const totalCount = kpis?.totalCount ?? pagination?.total ?? settlements.length;

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Pachtabrechnungen"
        description="Jahres- und Vorschussabrechnungen für Grundeigentümer"
        createHref="/leases/settlement/new"
        createLabel="Neue Abrechnung"
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Jahreserlöse
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalRevenueFinal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Summe aus Endabrechnungen
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Nutzungsentgelt gesamt
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalActualFeeFinal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tatsaechlich abzurechnender Betrag
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Offene Abrechnungen
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
                  Offen oder berechnet
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Abrechnungen gesamt
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalCount}</div>
                <p className="text-xs text-muted-foreground">
                  {selectedYear !== "all" ? selectedYear : "Alle Jahre"} -{" "}
                  {selectedParkId === "all"
                    ? "Alle Parks"
                    : "Ausgewaehlter Park"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Abrechnungen</CardTitle>
          <CardDescription>
            Pachtabrechnungen nach Park, Jahr, Typ und Status filtern
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
                placeholder: "Park waehlen",
                width: "w-[200px]",
                options: [
                  { value: "all", label: "Alle Parks" },
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
                placeholder: "Jahr",
                width: "w-[140px]",
                options: [
                  { value: "all", label: "Alle Jahre" },
                  ...years.map((year) => ({
                    value: year.toString(),
                    label: year.toString(),
                  })),
                ],
              },
              {
                value: selectedPeriodType,
                onChange: (value) =>
                  handleFilterChange(setSelectedPeriodType, value),
                placeholder: "Typ",
                width: "w-[180px]",
                options: [
                  { value: "all", label: "Alle Typen" },
                  { value: "FINAL", label: "Endabrechnung" },
                  { value: "ADVANCE", label: "Vorschuss" },
                ],
              },
              {
                value: statusFilter,
                onChange: (value) =>
                  handleFilterChange(setStatusFilter, value),
                placeholder: "Status",
                width: "w-[200px]",
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "OPEN", label: "Offen" },
                  { value: "CALCULATED", label: "Berechnet" },
                  {
                    value: "ADVANCE_CREATED",
                    label: "Vorschuss erstellt",
                  },
                  { value: "SETTLED", label: "Abgerechnet" },
                  {
                    value: "PENDING_REVIEW",
                    label: "Zur Prüfung",
                  },
                  { value: "APPROVED", label: "Freigegeben" },
                  { value: "CLOSED", label: "Abgeschlossen" },
                  { value: "CANCELLED", label: "Storniert" },
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
                      Park
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("year")}
                  >
                    <div className="flex items-center gap-1">
                      Jahr
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("type")}
                  >
                    <div className="flex items-center gap-1">
                      Typ
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Erlöse
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("actual")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Betrag
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px]">
                    <span className="sr-only">Aktionen</span>
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
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : isError ? (
                  // Error State
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="text-destructive">
                        Fehler beim Laden der Pachtabrechnungen. Bitte
                        versuchen Sie es erneut.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedSettlements.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <p>Keine Pachtabrechnungen gefunden</p>
                        {(selectedParkId !== "all" ||
                          selectedYear !== "all" ||
                          selectedPeriodType !== "all" ||
                          statusFilter !== "all") && (
                          <p className="text-sm">
                            Versuchen Sie, die Filter anzupassen.
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() =>
                            router.push("/leases/settlement/new")
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Neue Abrechnung erstellen
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
                        router.push(
                          `/leases/settlement/${settlement.id}`
                        )
                      }
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(
                            `/leases/settlement/${settlement.id}`
                          );
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {settlement.park?.name || "-"}
                      </TableCell>
                      <TableCell>{settlement.year}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {getSettlementPeriodLabel(
                            settlement.periodType,
                            settlement.advanceInterval,
                            settlement.month,
                            settlement.year
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusBadgeClasses(
                            settlement.status
                          )}
                        >
                          {SETTLEMENT_STATUS_LABELS[settlement.status] ||
                            settlement.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {settlement.periodType === "ADVANCE"
                          ? "-"
                          : formatCurrency(
                              Number(
                                settlement.totalParkRevenueEur || 0
                              )
                            )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {settlement.status === "OPEN"
                          ? "-"
                          : formatCurrency(
                              Number(settlement.actualFeeEur || 0)
                            )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Details anzeigen"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/leases/settlement/${settlement.id}`
                            );
                          }}
                        >
                          Details
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
                Zeige{" "}
                {(currentPage - 1) *
                  (pagination.limit || ITEMS_PER_PAGE) +
                  1}{" "}
                bis{" "}
                {Math.min(
                  currentPage * (pagination.limit || ITEMS_PER_PAGE),
                  pagination.total
                )}{" "}
                von {pagination.total} Einträgen
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
                  Seite {currentPage} von {totalPages}
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
    </div>
  );
}
