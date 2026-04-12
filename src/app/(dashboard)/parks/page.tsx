"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";
import { EditableCell } from "@/components/ui/editable-cell";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Wind,
  MapPin,
  Zap,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  Filter,
  List,
  Map,
  Trash2,
  Download,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ParksOverviewMapContainer } from "@/components/maps";
import { toast } from "sonner";
import { ENTITY_STATUS, getStatusBadge } from "@/lib/status-config";

// Reusable list page components
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { StatsCards } from "@/components/ui/stats-cards";
import { EmptyState } from "@/components/ui/empty-state";

interface Park {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  commissioningDate: string | null;
  totalCapacityKw: number | null;
  stats: {
    turbineCount: number;
    activeTurbineCount: number;
    totalCapacityKw: number;
    documentCount: number;
    contractCount: number;
  };
}

interface ParksResponse {
  data: Park[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


export default function ParksPage() {
  const router = useRouter();
  const t = useTranslations("parks.list");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "map">("table");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parkToDelete, setParkToDelete] = useState<Park | null>(null);

  // Archive state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [parkToArchive, setParkToArchive] = useState<string | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query URL with all filter/pagination params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  });

  const { data: parksData, isLoading: loading, error, refetch } = useApiQuery<ParksResponse>(
    ["parks", debouncedSearch, statusFilter, page.toString()],
    `/api/parks?${queryParams}`
  );

  const parks = parksData?.data ?? [];
  const pagination = parksData?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  // Bulk selection
  const {
    selectedIds,
    selectedCount,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
  } = useBatchSelection({ items: parks });

  function handleBulkCsvExport() {
    const selected = parks.filter(p => selectedIds.has(p.id));
    const header = t("csvHeader");
    const rows = selected.map(p => `"${p.name}";"${p.city || ''}";"${(p.stats?.totalCapacityKw ?? 0) / 1000}";"${p.stats?.turbineCount ?? 0}";"${p.status}"`);
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parks-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkDelete() {
    if (!confirm(t("bulkDeleteConfirm", { count: selectedCount }))) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/parks/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch { /* skip */ }
    }
    toast.success(t("bulkDeleted", { count: deleted }));
    clearSelection();
    refetch();
  }

  // Archive mutation
  const archiveMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/parks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: t("archiveError") }));
        throw new Error(error.error || t("archiveError"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success(t("archiveSuccess"));
        invalidate(["parks"]);
      },
      onError: () => {
        toast.error(t("archiveError"));
      },
      onSettled: () => {
        setArchiveDialogOpen(false);
        setParkToArchive(null);
      },
    }
  );

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/parks/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: t("deleteError") }));
        throw new Error(error.error || t("deleteError"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success(t("deleteSuccess"));
        invalidate(["parks"]);
      },
      onError: (error) => {
        toast.error(error.message || t("deleteError"));
      },
    }
  );

  function handleArchive(id: string) {
    setParkToArchive(id);
    setArchiveDialogOpen(true);
  }

  function handleConfirmArchive() {
    if (!parkToArchive) return;
    archiveMutation.mutate(parkToArchive);
  }

  function formatCapacity(kw: number): string {
    if (kw >= 1000) {
      return `${(kw / 1000).toFixed(1)} MW`;
    }
    return `${kw.toFixed(0)} kW`;
  }

  // Berechne Gesamtstatistiken (defensive: stats may be missing on error)
  const totalStats = parks.reduce(
    (acc, park) => ({
      parks: acc.parks + 1,
      turbines: acc.turbines + (park.stats?.turbineCount ?? 0),
      capacity: acc.capacity + (park.stats?.totalCapacityKw ?? 0),
    }),
    { parks: 0, turbines: 0, capacity: 0 }
  );

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
        description={t("subtitle")}
        createHref="/parks/new"
        createLabel={t("newPark")}
      />

      {/* Stats Cards */}
      <StatsCards
        columns={3}
        stats={[
          {
            label: t("statCardParks"),
            value: totalStats.parks,
            icon: Wind,
            subtitle: t("statActiveCount", { count: parks.filter((p) => p.status === "ACTIVE").length }),
          },
          {
            label: t("statCardTurbines"),
            value: totalStats.turbines,
            icon: Zap,
            subtitle: t("statTurbinesSubtitle"),
          },
          {
            label: t("statCardTotalPower"),
            value: formatCapacity(totalStats.capacity),
            icon: Zap,
            subtitle: t("statInstalledCapacity"),
          },
        ]}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t("parksHeader")}</CardTitle>
          <CardDescription>
            {t("portfolioSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("searchPlaceholder")}
            filters={[
              {
                value: statusFilter,
                onChange: (val) => { setStatusFilter(val); setPage(1); },
                placeholder: t("statusFilter"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                options: [
                  { value: "all", label: t("statusAll") },
                  { value: "ACTIVE", label: t("statusActive") },
                  { value: "INACTIVE", label: t("statusInactive") },
                  { value: "ARCHIVED", label: t("statusArchived") },
                ],
              },
            ]}
          >
            <div className="flex gap-1 rounded-lg border p-1">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <List className="mr-2 h-4 w-4" />
                {t("listView")}
              </Button>
              <Button
                variant={viewMode === "map" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("map")}
              >
                <Map className="mr-2 h-4 w-4" />
                {t("mapView")}
              </Button>
            </div>
          </SearchFilter>

          {/* Content: Table or Map */}
          {viewMode === "table" ? (
          <div className={cn("mt-4 rounded-md border overflow-x-auto transition-opacity", loading && parks.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleAll}
                      aria-label={t("selectAll")}
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})}
                    />
                  </TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("location")}</TableHead>
                  <TableHead className="text-center">{t("turbines")}</TableHead>
                  <TableHead className="text-right">{t("capacity")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("notes")}</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="w-12">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-8 mx-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : parks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState
                        icon={Wind}
                        title={t("empty")}
                        description={t("emptyDesc")}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  parks.map((park) => (
                    <TableRow
                      key={park.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/parks/${park.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/parks/${park.id}`); } }}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(park.id)}
                          onCheckedChange={() => toggleItem(park.id)}
                          aria-label={t("selectPark", { name: park.name })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{park.name}</div>
                        {park.shortName && (
                          <div className="text-sm text-muted-foreground">
                            {park.shortName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {park.city ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {park.city}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">
                          {park.stats?.activeTurbineCount ?? 0}
                        </span>
                        {(park.stats?.turbineCount ?? 0) !==
                          (park.stats?.activeTurbineCount ?? 0) && (
                          <span className="text-muted-foreground">
                            /{park.stats?.turbineCount ?? 0}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(park.stats?.totalCapacityKw ?? 0) > 0
                          ? formatCapacity(park.stats!.totalCapacityKw)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusBadge(ENTITY_STATUS, park.status).className}
                        >
                          {getStatusBadge(ENTITY_STATUS, park.status).label}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableCell
                          value={park.notes}
                          onSave={async (val) => {
                            await fetch(`/api/parks/${park.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ notes: val }),
                            });
                            refetch();
                          }}
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("viewDetails")}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/parks/${park.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("edit")}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/parks/${park.id}/edit`);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("moreActions")}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchive(park.id);
                                }}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                {t("archive")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setParkToDelete(park);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          ) : (
            <div className="mt-4">
              <ParksOverviewMapContainer
                parks={parks.map((park) => ({
                  id: park.id,
                  name: park.name,
                  shortName: park.shortName,
                  city: park.city,
                  latitude: park.latitude,
                  longitude: park.longitude,
                  status: park.status,
                  _count: { turbines: park.stats?.turbineCount ?? 0 },
                }))}
                height="500px"
              />
            </div>
          )}

          {/* Pagination - only shown in table view */}
          {viewMode === "table" && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("paginationInfo", {
                  from: (pagination.page - 1) * pagination.limit + 1,
                  to: Math.min(pagination.page * pagination.limit, pagination.total),
                  total: pagination.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        title={t("archiveTitle")}
        description={t("archiveDesc")}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (parkToDelete) {
            await deleteMutation.mutateAsync(parkToDelete.id);
            setParkToDelete(null);
          }
        }}
        title={t("deleteTitle")}
        itemName={parkToDelete?.name}
      />

      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          { label: t("csvExport"), icon: <Download className="h-4 w-4" />, onClick: handleBulkCsvExport },
          { label: t("delete"), icon: <Trash2 className="h-4 w-4" />, onClick: handleBulkDelete, variant: "destructive" as const },
        ]}
      />
    </div>
  );
}
