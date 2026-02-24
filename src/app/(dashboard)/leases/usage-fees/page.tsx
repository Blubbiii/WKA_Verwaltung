"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
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
  CalendarDays,
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
import {
  SETTLEMENT_STATUS_LABELS,
  type LeaseRevenueSettlementStatus,
  type LeaseRevenueSettlementResponse,
} from "@/types/billing";

// =============================================================================
// CONSTANTS
// =============================================================================

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

const ITEMS_PER_PAGE = 20;

// =============================================================================
// SWR FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
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
    mutate,
  } = useSWR(apiUrl, fetcher, { revalidateOnFocus: false });

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
      toast.error("Bitte Park und Jahr angeben");
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
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || err.details || "Fehler beim Erstellen");
      }

      const created = await res.json();
      toast.success("Nutzungsentgelt-Abrechnung erfolgreich erstellt");
      setCreateDialogOpen(false);
      resetCreateForm();
      mutate();

      // Navigate to the new settlement
      router.push(`/leases/usage-fees/${created.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
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
      toast.error("Bitte alle Pflichtfelder ausfuellen");
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
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || err.details || "Fehler beim Importieren");
      }

      toast.success("Historische Abrechnung wurde erfolgreich importiert");
      setImportDialogOpen(false);
      setImportParkId("");
      setImportYear("");
      setImportRevenue("");
      setImportFee("");
      setImportUsedMinimum(false);
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Importieren"
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
            Nutzungsentgelt-Abrechnungen
          </h1>
          <p className="text-muted-foreground">
            Jahresabrechnungen für Grundeigentümer
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Historischer Import
          </Button>
          <Button
            onClick={() => {
              resetCreateForm();
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Neue Abrechnung
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jahreserlöse</CardTitle>
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
                  {selectedYear !== "all" ? selectedYear : "Alle Jahre"} -{" "}
                  {selectedParkId === "all" ? "Alle Parks" : "Ausgewaehlter Park"}
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
                  {formatCurrency(totalActualFee)}
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
                <div className="text-2xl font-bold">
                  {pagination?.total || settlements.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedYear !== "all" ? selectedYear : "Alle Jahre"}
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
            Nutzungsentgelt-Abrechnungen nach Park, Jahr und Status filtern
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
                value: statusFilter,
                onChange: (value) =>
                  handleFilterChange(setStatusFilter, value),
                placeholder: "Status",
                width: "w-[180px]",
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "OPEN", label: "Offen" },
                  { value: "CALCULATED", label: "Berechnet" },
                  { value: "ADVANCE_CREATED", label: "Vorschuss erstellt" },
                  { value: "SETTLED", label: "Abgerechnet" },
                  { value: "CLOSED", label: "Abgeschlossen" },
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
                    onClick={() => handleSort("calculated")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Berechnet
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("minimum")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Minimum
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort("actual")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Tatsaechlich
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
                        Fehler beim Laden der Nutzungsentgelt-Abrechnungen. Bitte
                        versuchen Sie es erneut.
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
                        <p>Keine Nutzungsentgelt-Abrechnungen gefunden</p>
                        {(selectedParkId !== "all" ||
                          selectedYear !== "all" ||
                          statusFilter !== "all") && (
                          <p className="text-sm">
                            Versuchen Sie, die Filter anzupassen.
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
                          {SETTLEMENT_STATUS_LABELS[settlement.status] ||
                            settlement.status}
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
                          aria-label="Details anzeigen"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/leases/usage-fees/${settlement.id}`
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
                {(currentPage - 1) * (pagination.limit || ITEMS_PER_PAGE) + 1}{" "}
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
            <DialogTitle>Neue Nutzungsentgelt-Abrechnung</DialogTitle>
            <DialogDescription>
              Erstellen Sie eine neue Jahresabrechnung für einen Windpark.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Park Selection */}
            <div className="space-y-2">
              <Label htmlFor="create-park">Park *</Label>
              <Select value={createParkId} onValueChange={setCreateParkId}>
                <SelectTrigger id="create-park">
                  <SelectValue placeholder="Park auswaehlen" />
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
              <Label htmlFor="create-year">Jahr *</Label>
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
                Vorschuss-Fälligkeitsdatum (optional)
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
                Abrechnungs-Fälligkeitsdatum (optional)
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
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createParkId}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historische Abrechnung importieren</DialogTitle>
            <DialogDescription>
              Importieren Sie eine abgeschlossene Abrechnung aus frueheren Jahren. Die Abrechnung wird mit Status &quot;Abgeschlossen&quot; erstellt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-park">Park *</Label>
              <Select value={importParkId} onValueChange={setImportParkId}>
                <SelectTrigger id="import-park">
                  <SelectValue placeholder="Park auswaehlen" />
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
              <Label htmlFor="import-year">Jahr *</Label>
              <Input
                id="import-year"
                type="number"
                min={2000}
                max={2100}
                value={importYear}
                onChange={(e) => setImportYear(e.target.value)}
                placeholder="z.B. 2020"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-revenue">Jahreserlöse (EUR) *</Label>
              <Input
                id="import-revenue"
                type="number"
                step="0.01"
                min="0"
                value={importRevenue}
                onChange={(e) => setImportRevenue(e.target.value)}
                placeholder="z.B. 500000.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-fee">Nutzungsentgelt gesamt (EUR) *</Label>
              <Input
                id="import-fee"
                type="number"
                step="0.01"
                min="0"
                value={importFee}
                onChange={(e) => setImportFee(e.target.value)}
                placeholder="z.B. 25000.00"
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
              <Label htmlFor="import-minimum">Mindestpacht wurde angewendet</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={importing}
            >
              Abbrechen
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
              Importieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
