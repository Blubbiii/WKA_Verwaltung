"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format, differenceInDays } from "date-fns";
import { de, enUS } from "date-fns/locale";
import {
  MapPin,
  Calendar,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Download,
  Filter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { LeaseDialogs } from "@/components/leases";
import { toast } from "sonner";
import { CONTRACT_STATUS, getStatusBadge } from "@/lib/status-config";

interface Plot {
  id: string;
  cadastralDistrict: string | null;
  fieldNumber: string | null;
  plotNumber: string | null;
  areaSqm: number | null;
  park: {
    id: string;
    name: string;
    shortName: string | null;
  } | null;
}

interface Lease {
  id: string;
  contractNumber: string | null;
  startDate: string;
  endDate: string | null;
  annualRent: number | null;
  status: string;
  plots: Plot[];
  lessor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    personType: string;
  };
}

interface LeasesResponse {
  data: Lease[];
}

export default function LeasesPage() {
  const router = useRouter();
  const t = useTranslations("leases.list");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaseToDelete, setLeaseToDelete] = useState<Lease | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    limit: "100",
    ...(statusFilter !== "all" && { status: statusFilter }),
  });

  const { data: leasesData, isLoading: loading, error, refetch } = useApiQuery<LeasesResponse>(
    ["leases", statusFilter],
    `/api/leases?${queryParams}`
  );

  const leases = leasesData?.data ?? [];

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/leases/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("delete.errorFallback") }));
        throw new Error(data.error || t("delete.errorContract"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["leases"]);
      },
      onError: (error) => {
        toast.error(error.message || t("delete.errorContract"));
      },
    }
  );

  function getLessorName(lessor: Lease["lessor"]): string {
    if (lessor.personType === "legal") {
      return lessor.companyName || "-";
    }
    return [lessor.firstName, lessor.lastName].filter(Boolean).join(" ") || "-";
  }

  function getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber ? t("table.plotFlur", { flur: plot.fieldNumber }) : null,
      plot.plotNumber ? t("table.plotFlurstueck", { plot: plot.plotNumber }) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : t("table.plotUnknown");
  }

  function getPlotsLabel(plots: Plot[]): string {
    if (!plots || plots.length === 0) return "-";
    if (plots.length === 1) return getPlotLabel(plots[0]);
    return t("table.plotsLabel", { count: plots.length });
  }

  function getTotalArea(plots: Plot[]): number {
    if (!plots || plots.length === 0) return 0;
    return plots.reduce((sum, plot) => sum + (Number(plot.areaSqm) || 0), 0);
  }

  function getParksLabel(plots: Plot[]): string {
    if (!plots || plots.length === 0) return "-";
    const parks = [...new Set(plots.map(p => p.park?.shortName || p.park?.name).filter(Boolean))];
    if (parks.length === 0) return "-";
    if (parks.length === 1) return parks[0] || "-";
    return t("table.parksLabel", { count: parks.length });
  }

  function getDaysUntilEnd(endDate: string | null): number | null {
    if (!endDate) return null;
    return differenceInDays(new Date(endDate), new Date());
  }

  // Filter by search
  const filteredLeases = leases.filter((lease) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    const plotsMatch = lease.plots?.some(plot =>
      getPlotLabel(plot).toLowerCase().includes(searchLower) ||
      plot.park?.name.toLowerCase().includes(searchLower)
    );
    return (
      getLessorName(lease.lessor).toLowerCase().includes(searchLower) ||
      plotsMatch ||
      lease.contractNumber?.toLowerCase().includes(searchLower)
    );
  });

  // Batch selection
  const {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  } = useBatchSelection({ items: filteredLeases });

  // CSV export for selected leases
  function handleCsvExport() {
    const selected = filteredLeases.filter((l) => selectedIds.has(l.id));
    const header = t("csv.headers");
    const rows = selected.map((l) =>
      [
        l.contractNumber || "-",
        getLessorName(l.lessor),
        getPlotsLabel(l.plots),
        getParksLabel(l.plots),
        l.annualRent != null ? l.annualRent.toString().replace(".", ",") : "-",
        getStatusBadge(CONTRACT_STATUS, l.status).label,
      ].join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("csv.filePrefix")}_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("csv.exportedToast", { count: selected.length }));
  }

  // Bulk delete for selected leases
  async function handleBulkDelete() {
    const ids = [...selectedIds];
    let successCount = 0;
    for (const id of ids) {
      try {
        const response = await fetch(`/api/leases/${id}`, { method: "DELETE" });
        if (response.ok) successCount++;
      } catch {
        // continue with next
      }
    }
    clearSelection();
    invalidate(["leases"]);
    if (successCount === ids.length) {
      toast.success(t("delete.bulkDeleted", { count: successCount }));
    } else {
      toast.warning(t("delete.bulkPartial", { success: successCount, total: ids.length }));
    }
  }

  // Expiring leases (within 90 days)
  const expiringLeases = leases.filter((l) => {
    const days = getDaysUntilEnd(l.endDate);
    return days !== null && days > 0 && days <= 90;
  });

  const totalAnnualRent = leases
    .filter((l) => l.status === "ACTIVE")
    .reduce((sum, l) => sum + (l.annualRent || 0), 0);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{t("loadError")}</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("title")}
        description={t("description")}
        createHref="/leases/new"
        createLabel={t("newContract")}
      />

      {/* Stats Cards */}
      <StatsCards
        columns={3}
        stats={[
          { label: t("stats.contracts"), value: leases.length, icon: MapPin, subtitle: t("stats.active", { count: leases.filter((l) => l.status === "ACTIVE").length }) },
          { label: t("stats.annualRent"), value: formatCurrency(totalAnnualRent), icon: Calendar, subtitle: t("stats.activeContracts") },
          { label: t("stats.expiring"), value: expiringLeases.length, icon: AlertTriangle, iconClassName: expiringLeases.length > 0 ? "text-yellow-500" : undefined, cardClassName: expiringLeases.length > 0 ? "border-yellow-500" : "", subtitle: t("stats.expiringHint") },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("card.title")}</CardTitle>
          <CardDescription>{t("card.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("searchPlaceholder")}
            filters={[
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: t("filters.statusPlaceholder"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                options: [
                  { value: "all", label: t("filters.allStatus") },
                  { value: "ACTIVE", label: t("filters.active") },
                  { value: "EXPIRING", label: t("filters.expiring") },
                  { value: "EXPIRED", label: t("filters.expired") },
                ],
              },
            ]}
          />

          <div className={cn("mt-4 rounded-md border overflow-x-auto transition-opacity", loading && leases.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label={t("table.selectAllAria")}
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})} />
                  </TableHead>
                  <TableHead>{t("table.contract")}</TableHead>
                  <TableHead>{t("table.lessor")}</TableHead>
                  <TableHead>{t("table.plot")}</TableHead>
                  <TableHead>{t("table.park")}</TableHead>
                  <TableHead>{t("table.term")}</TableHead>
                  <TableHead className="text-right">{t("table.annualRent")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredLeases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {t("table.emptyText")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeases.map((lease) => {
                    const daysUntilEnd = getDaysUntilEnd(lease.endDate);
                    return (
                      <TableRow
                        key={lease.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedLease(lease);
                          setIsDetailOpen(true);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedLease(lease); setIsDetailOpen(true); } }}
                      >
                        <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(lease.id)} onCheckedChange={() => toggleItem(lease.id)} aria-label={t("table.selectAria")} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {lease.contractNumber || "-"}
                        </TableCell>
                        <TableCell>{getLessorName(lease.lessor)}</TableCell>
                        <TableCell className="text-sm">
                          {getPlotsLabel(lease.plots)}
                          {getTotalArea(lease.plots) > 0 && (
                            <span className="ml-1 text-muted-foreground">
                              ({(getTotalArea(lease.plots) / 10000).toFixed(2)} ha)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getParksLabel(lease.plots)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(lease.startDate), "dd.MM.yyyy", { locale: dateLocale })}
                            {" - "}
                            {lease.endDate
                              ? format(new Date(lease.endDate), "dd.MM.yyyy", { locale: dateLocale })
                              : t("table.unlimited")}
                          </div>
                          {daysUntilEnd !== null && daysUntilEnd <= 90 && daysUntilEnd > 0 && (
                            <div className="text-xs text-yellow-600">
                              {t("table.daysRemaining", { days: daysUntilEnd })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {lease.annualRent ? formatCurrency(lease.annualRent) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getStatusBadge(CONTRACT_STATUS, lease.status).className}>
                            {getStatusBadge(CONTRACT_STATUS, lease.status).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t("actions.detailsAria")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLease(lease);
                                setIsDetailOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t("actions.editAria")}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/leases/${lease.id}/edit`);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("actions.moreAria")}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLeaseToDelete(lease);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("actions.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lease Dialogs */}
      <LeaseDialogs
        onSuccess={() => invalidate(["leases"])}
        isDetailOpen={isDetailOpen}
        setIsDetailOpen={setIsDetailOpen}
        viewingLease={selectedLease}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (leaseToDelete) {
            await deleteMutation.mutateAsync(leaseToDelete.id);
            setLeaseToDelete(null);
          }
        }}
        title={t("delete.title")}
        itemName={leaseToDelete?.contractNumber || (leaseToDelete?.lessor ? t("delete.contractWith", { name: getLessorName(leaseToDelete.lessor) }) : t("delete.defaultItemName"))}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: t("actions.csvExport"),
            icon: <Download className="h-4 w-4" />,
            onClick: handleCsvExport,
          },
          {
            label: t("actions.delete"),
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleBulkDelete,
            variant: "destructive",
          },
        ]}
      />
    </div>
  );
}
