"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useApiQuery,
  useApiMutation,
  useInvalidateQuery,
} from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { StatsCards } from "@/components/ui/stats-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { EditableCell } from "@/components/ui/editable-cell";
import {
  Wrench,
  Eye,
  Trash2,
  Download,
  MoreHorizontal,
  Filter,
  Calendar,
  Euro,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";

// -- Types --

interface ServiceEvent {
  id: string;
  eventDate: string;
  eventType: string;
  description: string | null;
  durationHours: number | null;
  cost: number | null;
  performedBy: string | null;
  notes: string | null;
  createdAt: string;
  turbine: {
    id: string;
    designation: string;
    park: {
      id: string;
      name: string;
      shortName: string | null;
    };
  };
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface ServiceEventsResponse {
  data: ServiceEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalCount: number;
    monthCount: number;
    totalCost: number;
    upcomingCount: number;
  };
}

interface ParkOption {
  id: string;
  name: string;
  shortName: string | null;
}

interface ParksResponse {
  data: ParkOption[];
}

// -- Constants --

const EVENT_TYPE_KEYS = [
  "MAINTENANCE",
  "REPAIR",
  "INSPECTION",
  "BLADE_INSPECTION",
  "GEARBOX_SERVICE",
  "GENERATOR_SERVICE",
  "SOFTWARE_UPDATE",
  "EMERGENCY",
  "TECHNICIAN_VISIT",
  "OTHER",
] as const;

const eventTypeBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  MAINTENANCE: "warning",
  REPAIR: "warning",
  INSPECTION: "default",
  BLADE_INSPECTION: "default",
  GEARBOX_SERVICE: "secondary",
  GENERATOR_SERVICE: "secondary",
  SOFTWARE_UPDATE: "outline",
  EMERGENCY: "destructive",
  TECHNICIAN_VISIT: "success",
  OTHER: "secondary",
};

type SortField =
  | "eventDate"
  | "eventType"
  | "cost"
  | "durationHours"
  | "performedBy";
type SortOrder = "asc" | "desc";

// -- Helper Components --

function SortIcon({
  field,
  sortBy,
  sortOrder,
}: {
  field: SortField;
  sortBy: SortField;
  sortOrder: SortOrder;
}) {
  if (sortBy !== field) {
    return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-50" />;
  }
  return sortOrder === "asc" ? (
    <ArrowUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3 inline" />
  );
}

// -- Component --

export default function ServiceEventsPage() {
  const t = useTranslations("serviceEvents");
  const tType = useTranslations("serviceEvents.eventTypes");
  const router = useRouter();

  // Filter state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [parkFilter, setParkFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>("eventDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<ServiceEvent | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sortBy,
    sortOrder,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(parkFilter !== "all" && { parkId: parkFilter }),
    ...(typeFilter !== "all" && { eventType: typeFilter }),
  });

  // Fetch service events
  const { data: eventsData, isLoading: loading, error, refetch } =
    useApiQuery<ServiceEventsResponse>(
      [
        "service-events",
        debouncedSearch,
        parkFilter,
        typeFilter,
        page.toString(),
        sortBy,
        sortOrder,
      ],
      `/api/service-events?${queryParams}`
    );

  // Fetch parks for filter dropdown
  const { data: parksData } = useApiQuery<ParksResponse>(
    ["parks-list"],
    "/api/parks?limit=100"
  );

  const events = eventsData?.data ?? [];

  // Batch selection
  const { selectedIds, isAllSelected, isSomeSelected, toggleItem, toggleAll, clearSelection, selectedCount } =
    useBatchSelection({ items: events });
  const pagination = eventsData?.pagination ?? {
    page: 1,
    limit,
    total: 0,
    totalPages: 0,
  };
  const stats = eventsData?.stats ?? {
    totalCount: 0,
    monthCount: 0,
    totalCost: 0,
    upcomingCount: 0,
  };
  const parks = parksData?.data ?? [];

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/service-events/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: t("delete.error") }));
        throw new Error(
          data.error || t("delete.error")
        );
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success(t("delete.success"));
        invalidate(["service-events"]);
      },
      onError: (error) => {
        toast.error(error.message || t("delete.error"));
      },
    }
  );

  // Sort handler
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  // Truncate helper
  function truncate(text: string | null, maxLength: number): string {
    if (!text) return "-";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  // Helper to safely translate event type
  const translateEventType = useCallback((type: string) => {
    try { return tType(type as "MAINTENANCE"); } catch { return type; }
  }, [tType]);

  // Batch CSV export
  const handleBatchExport = useCallback(() => {
    const selected = events.filter((e) => selectedIds.has(e.id));
    const header = t("batch.csvHeader");
    const rows = selected.map((e) =>
      [
        format(new Date(e.eventDate), "dd.MM.yyyy", { locale: de }),
        translateEventType(e.eventType),
        e.turbine.designation,
        e.turbine.park.shortName || e.turbine.park.name,
        (e.description || "").replace(/;/g, ","),
        e.cost != null ? e.cost.toFixed(2).replace(".", ",") : "",
        e.durationHours != null ? String(e.durationHours) : "",
      ].join(";")
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-events-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("batch.exported", { count: selected.length }));
  }, [events, selectedIds, t, translateEventType]);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!confirm(t("batch.confirm", { count: ids.length }))) return;
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/service-events/${id}`, { method: "DELETE" });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }
    if (success > 0) {
      toast.success(t("batch.deleted", { count: success }));
      clearSelection();
      invalidate(["service-events"]);
    }
    if (failed > 0) {
      toast.error(t("batch.failed", { count: failed }));
    }
  }, [selectedIds, clearSelection, invalidate, t]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{t("list.loadError")}</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          {t("list.retry")}
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
      />

      {/* Stats Cards */}
      <StatsCards
        columns={4}
        stats={[
          {
            label: t("list.total"),
            value: stats.totalCount,
            icon: Wrench,
            subtitle: t("list.totalSubtitle"),
          },
          {
            label: t("list.thisMonth"),
            value: stats.monthCount,
            icon: Calendar,
            subtitle: t("list.thisMonthSubtitle"),
          },
          {
            label: t("list.totalCost"),
            value: formatCurrency(stats.totalCost),
            icon: Euro,
            subtitle: t("list.totalCostSubtitle"),
          },
          {
            label: t("list.upcoming"),
            value: stats.upcomingCount,
            icon: Clock,
            subtitle: t("list.upcomingSubtitle"),
          },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("list.cardTitle")}</CardTitle>
          <CardDescription>
            {t("list.cardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <SearchFilter
            search={search}
            onSearchChange={(val) => { setSearch(val); setPage(1); }}
            searchPlaceholder={t("list.searchPlaceholder")}
            filters={[
              {
                value: parkFilter,
                onChange: (val) => { setParkFilter(val); setPage(1); },
                placeholder: t("list.parkPlaceholder"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[200px]",
                options: [
                  { value: "all", label: t("list.allParks") },
                  ...parks.map((park) => ({
                    value: park.id,
                    label: park.shortName || park.name,
                  })),
                ],
              },
              {
                value: typeFilter,
                onChange: (val) => { setTypeFilter(val); setPage(1); },
                placeholder: t("list.typePlaceholder"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[200px]",
                options: [
                  { value: "all", label: t("list.allTypes") },
                  ...EVENT_TYPE_KEYS.map((value) => ({
                    value,
                    label: translateEventType(value),
                  })),
                ],
              },
            ]}
          />

          {/* Table */}
          <div className={cn("rounded-md border overflow-x-auto transition-opacity", loading && events.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label={t("list.cols.sortByDate")}
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})} />
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("eventDate")}
                      aria-label={t("list.cols.sortByDate")}
                    >
                      {t("list.cols.date")}
                      <SortIcon field="eventDate" sortBy={sortBy} sortOrder={sortOrder} />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("eventType")}
                      aria-label={t("list.cols.sortByType")}
                    >
                      {t("list.cols.type")}
                      <SortIcon field="eventType" sortBy={sortBy} sortOrder={sortOrder} />
                    </button>
                  </TableHead>
                  <TableHead>{t("list.cols.turbinePark")}</TableHead>
                  <TableHead>{t("list.cols.description")}</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("performedBy")}
                      aria-label={t("list.cols.sortByCompany")}
                    >
                      {t("list.cols.company")}
                      <SortIcon field="performedBy" sortBy={sortBy} sortOrder={sortOrder} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("cost")}
                      aria-label={t("list.cols.sortByCost")}
                    >
                      {t("list.cols.cost")}
                      <SortIcon field="cost" sortBy={sortBy} sortOrder={sortOrder} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("durationHours")}
                      aria-label={t("list.cols.sortByDuration")}
                    >
                      {t("list.cols.duration")}
                      <SortIcon field="durationHours" sortBy={sortBy} sortOrder={sortOrder} />
                    </button>
                  </TableHead>
                  <TableHead>{t("list.cols.notes")}</TableHead>
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
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-12 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <EmptyState
                        icon={Wrench}
                        title={t("list.empty")}
                        description={t("list.emptyDesc")}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/service-events/${event.id}`)
                      }
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/service-events/${event.id}`);
                        }
                      }}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(event.id)} onCheckedChange={() => toggleItem(event.id)} aria-label={t("list.cols.sortByDate")} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(
                          new Date(event.eventDate),
                          "dd.MM.yyyy",
                          { locale: de }
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            eventTypeBadgeVariants[event.eventType] ||
                            eventTypeBadgeVariants.OTHER
                          }
                        >
                          {translateEventType(event.eventType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {event.turbine.designation}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {event.turbine.park.shortName ||
                              event.turbine.park.name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span title={event.description || undefined}>
                          {truncate(event.description, 50)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {event.performedBy || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {event.cost ? (
                          formatCurrency(event.cost)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {event.durationHours ? (
                          `${event.durationHours} h`
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                        <EditableCell
                          value={event.notes}
                          placeholder="—"
                          onSave={async (newValue) => {
                            const res = await fetch(`/api/service-events/${event.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ notes: newValue || null }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({ error: t("noteError") }));
                              throw new Error(data.error || t("noteError"));
                            }
                            toast.success(t("noteSaved"));
                            invalidate(["service-events"]);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("list.showDetails")}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/service-events/${event.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("list.moreActions")}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEventToDelete(event);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("list.delete")}
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("list.pagination", {
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
                  {t("list.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("list.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: t("batch.export"),
            icon: <Download className="h-4 w-4" />,
            onClick: handleBatchExport,
          },
          {
            label: t("batch.delete"),
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleBatchDelete,
            variant: "destructive",
          },
        ]}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (eventToDelete) {
            await deleteMutation.mutateAsync(eventToDelete.id);
            setEventToDelete(null);
          }
        }}
        title={t("delete.title")}
        itemName={
          eventToDelete
            ? `${translateEventType(eventToDelete.eventType)} - ${eventToDelete.turbine.designation}`
            : undefined
        }
      />
    </div>
  );
}
