"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useApiQuery,
  useApiMutation,
  useInvalidateQuery,
} from "@/hooks/useApiQuery";
import { formatCurrency } from "@/lib/format";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { StatsCards } from "@/components/ui/stats-cards";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Wrench,
  Eye,
  Trash2,
  MoreHorizontal,
  Filter,
  Calendar,
  Euro,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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

const eventTypeLabels: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  BLADE_INSPECTION: "Rotorblatt-Inspektion",
  GEARBOX_SERVICE: "Getriebe-Service",
  GENERATOR_SERVICE: "Generator-Service",
  SOFTWARE_UPDATE: "Software-Update",
  EMERGENCY: "Notfall",
  OTHER: "Sonstiges",
};

const eventTypeColors: Record<string, string> = {
  MAINTENANCE:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  REPAIR:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  INSPECTION:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  BLADE_INSPECTION:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  GEARBOX_SERVICE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  GENERATOR_SERVICE:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  SOFTWARE_UPDATE:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  EMERGENCY:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  OTHER:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

type SortField =
  | "eventDate"
  | "eventType"
  | "cost"
  | "durationHours"
  | "performedBy";
type SortOrder = "asc" | "desc";

// -- Component --

export default function ServiceEventsPage() {
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
          .catch(() => ({ error: "Fehler beim Löschen" }));
        throw new Error(
          data.error || "Fehler beim Löschen des Service-Events"
        );
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success("Service-Event wurde gelöscht");
        invalidate(["service-events"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Löschen des Service-Events");
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

  // Sort icon helper
  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-50" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 inline" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 inline" />
    );
  }

  // Truncate helper
  function truncate(text: string | null, maxLength: number): string {
    if (!text) return "-";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Service-Events</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Service-Events"
        description="Übersicht aller Wartungen, Reparaturen und Inspektionen"
      />

      {/* Stats Cards */}
      <StatsCards
        columns={4}
        stats={[
          {
            label: "Gesamte Events",
            value: stats.totalCount,
            icon: Wrench,
            subtitle: "Alle Service-Events",
          },
          {
            label: "Diesen Monat",
            value: stats.monthCount,
            icon: Calendar,
            subtitle: "Events im aktuellen Monat",
          },
          {
            label: "Gesamtkosten",
            value: formatCurrency(stats.totalCost),
            icon: Euro,
            subtitle: "Alle Kosten kumuliert",
          },
          {
            label: "Offene Events",
            value: stats.upcomingCount,
            icon: Clock,
            subtitle: "Geplante Events",
          },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Service-Events</CardTitle>
          <CardDescription>
            Wartungen, Reparaturen und Inspektionen aller Anlagen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <SearchFilter
            search={search}
            onSearchChange={(val) => { setSearch(val); setPage(1); }}
            searchPlaceholder="Suchen nach Beschreibung, Firma, Notizen..."
            filters={[
              {
                value: parkFilter,
                onChange: (val) => { setParkFilter(val); setPage(1); },
                placeholder: "Windpark",
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[200px]",
                options: [
                  { value: "all", label: "Alle Windparks" },
                  ...parks.map((park) => ({
                    value: park.id,
                    label: park.shortName || park.name,
                  })),
                ],
              },
              {
                value: typeFilter,
                onChange: (val) => { setTypeFilter(val); setPage(1); },
                placeholder: "Event-Typ",
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[200px]",
                options: [
                  { value: "all", label: "Alle Typen" },
                  ...Object.entries(eventTypeLabels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ],
              },
            ]}
          />

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("eventDate")}
                      aria-label="Nach Datum sortieren"
                    >
                      Datum
                      <SortIcon field="eventDate" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("eventType")}
                      aria-label="Nach Typ sortieren"
                    >
                      Typ
                      <SortIcon field="eventType" />
                    </button>
                  </TableHead>
                  <TableHead>Anlage / Park</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors"
                      onClick={() => handleSort("performedBy")}
                      aria-label="Nach Firma sortieren"
                    >
                      Firma
                      <SortIcon field="performedBy" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("cost")}
                      aria-label="Nach Kosten sortieren"
                    >
                      Kosten
                      <SortIcon field="cost" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="flex items-center font-medium hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("durationHours")}
                      aria-label="Nach Dauer sortieren"
                    >
                      Dauer
                      <SortIcon field="durationHours" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
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
                        <Skeleton className="h-5 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState
                        icon={Wrench}
                        title="Keine Service-Events gefunden"
                        description="Es wurden keine Service-Events gefunden, die Ihren Filterkriterien entsprechen."
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
                      <TableCell className="whitespace-nowrap">
                        {format(
                          new Date(event.eventDate),
                          "dd.MM.yyyy",
                          { locale: de }
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            eventTypeColors[event.eventType] ||
                            eventTypeColors.OTHER
                          }
                        >
                          {eventTypeLabels[event.eventType] ||
                            event.eventType}
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Details anzeigen"
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
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
                                Löschen
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
                Zeige{" "}
                {(pagination.page - 1) * pagination.limit + 1} bis{" "}
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}{" "}
                von {pagination.total} Service-Events
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
        title="Service-Event löschen"
        itemName={
          eventToDelete
            ? `${eventTypeLabels[eventToDelete.eventType] || eventToDelete.eventType} - ${eventToDelete.turbine.designation}`
            : undefined
        }
      />
    </div>
  );
}
