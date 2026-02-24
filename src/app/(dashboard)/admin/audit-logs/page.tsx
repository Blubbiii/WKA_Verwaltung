"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  Calendar,
  Filter,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getEntityDisplayName,
  getActionDisplayName,
  type AuditAction,
  type AuditEntityType,
} from "@/lib/audit-types";

// Types
interface AuditLogUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditLogUser | null;
  impersonatedBy: AuditLogUser | null;
  tenant: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface UserOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

// Action types for filtering
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "Alle Aktionen" },
  { value: "CREATE", label: "Erstellt" },
  { value: "UPDATE", label: "Bearbeitet" },
  { value: "DELETE", label: "Gelöscht" },
  { value: "VIEW", label: "Angesehen" },
  { value: "EXPORT", label: "Exportiert" },
  { value: "DOCUMENT_DOWNLOAD", label: "Heruntergeladen" },
  { value: "LOGIN", label: "Angemeldet" },
  { value: "LOGOUT", label: "Abgemeldet" },
  { value: "IMPERSONATE", label: "Impersoniert" },
];

// Entity types for filtering - complete list from audit-types.ts
const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "Alle Entitaeten" },
  { value: "Park", label: "Windpark" },
  { value: "Turbine", label: "Anlage" },
  { value: "TurbineProduction", label: "Netzbetreiber-Daten" },
  { value: "Fund", label: "Gesellschaft" },
  { value: "FundHierarchy", label: "Gesellschafts-Hierarchie" },
  { value: "Shareholder", label: "Gesellschafter" },
  { value: "Plot", label: "Flurstueck" },
  { value: "Lease", label: "Pachtvertrag" },
  { value: "Contract", label: "Vertrag" },
  { value: "Document", label: "Dokument" },
  { value: "Invoice", label: "Rechnung" },
  { value: "Vote", label: "Abstimmung" },
  { value: "ServiceEvent", label: "Service-Event" },
  { value: "News", label: "Neuigkeit" },
  { value: "Person", label: "Person" },
  { value: "User", label: "Benutzer" },
  { value: "Role", label: "Rolle" },
  { value: "Tenant", label: "Mandant" },
  { value: "TurbineOperator", label: "WKA-Betreiber" },
  { value: "EnergySettlement", label: "Stromabrechnung" },
  { value: "EnergySettlementItem", label: "Stromabrechnung-Position" },
  { value: "LeaseRevenueSettlement", label: "Nutzungsentgelt-Abrechnung" },
  { value: "ParkCostAllocation", label: "Kostenaufteilung" },
];

// Get badge variant and color based on action
function getActionBadgeProps(action: AuditAction): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  switch (action) {
    case "DELETE":
      return { variant: "destructive" };
    case "CREATE":
      return { variant: "default", className: "bg-green-600 hover:bg-green-700" };
    case "UPDATE":
      return { variant: "default", className: "bg-blue-600 hover:bg-blue-700" };
    case "LOGIN":
    case "LOGOUT":
      return { variant: "secondary" };
    case "IMPERSONATE":
      return { variant: "outline", className: "border-orange-500 text-orange-600" };
    case "EXPORT":
    case "DOCUMENT_DOWNLOAD":
      return { variant: "outline", className: "border-purple-500 text-purple-600" };
    default:
      return { variant: "outline" };
  }
}

// Format user name
function formatUserName(user: AuditLogUser | null): string {
  if (!user) return "System";
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.email;
}

// Helper to get display label for a filter value
function getFilterLabel(
  filterKey: string,
  value: string,
  users: UserOption[]
): string {
  switch (filterKey) {
    case "action": {
      const opt = ACTION_OPTIONS.find((o) => o.value === value);
      return opt ? opt.label : value;
    }
    case "entityType": {
      const opt = ENTITY_OPTIONS.find((o) => o.value === value);
      return opt ? opt.label : value;
    }
    case "userId": {
      const user = users.find((u) => u.id === value);
      if (user) {
        if (user.firstName || user.lastName) {
          return `${user.firstName || ""} ${user.lastName || ""}`.trim();
        }
        return user.email;
      }
      return value;
    }
    case "startDate":
      return `ab ${value}`;
    case "endDate":
      return `bis ${value}`;
    case "search":
      return `"${value}"`;
    default:
      return value;
  }
}

function getFilterIcon(filterKey: string) {
  switch (filterKey) {
    case "action":
      return "Aktion";
    case "entityType":
      return "Entitaet";
    case "userId":
      return "Benutzer";
    case "startDate":
      return "Von";
    case "endDate":
      return "Bis";
    case "search":
      return "Suche";
    default:
      return filterKey;
  }
}

// Inner component that uses useSearchParams (must be inside Suspense)
function AuditLogsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Users for filter dropdown
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Filter state - initialize from URL params
  const [actionFilter, setActionFilter] = useState(
    searchParams.get("action") || "ALL"
  );
  const [entityTypeFilter, setEntityTypeFilter] = useState(
    searchParams.get("entityType") || "ALL"
  );
  const [userFilter, setUserFilter] = useState(
    searchParams.get("userId") || "ALL"
  );
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || ""
  );
  const [endDate, setEndDate] = useState(
    searchParams.get("endDate") || ""
  );
  const [searchText, setSearchText] = useState(
    searchParams.get("search") || ""
  );
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.get("page")) || 1
  );

  // Collapsible filter panel state
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Modal state
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Debounce search text
  const debouncedSearch = useDebounce(searchText, 400);

  // Fetch users for filter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        const response = await fetch("/api/admin/users");
        if (response.ok) {
          const data = await response.json();
          setUsers(
            (data.data || []).map((u: UserOption) => ({
              id: u.id,
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
            }))
          );
        }
      } catch {
      } finally {
        setUsersLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // Sync filters to URL query params
  useEffect(() => {
    const params = new URLSearchParams();

    if (actionFilter !== "ALL") params.set("action", actionFilter);
    if (entityTypeFilter !== "ALL") params.set("entityType", entityTypeFilter);
    if (userFilter !== "ALL") params.set("userId", userFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (currentPage > 1) params.set("page", currentPage.toString());

    const paramString = params.toString();
    const newUrl = paramString ? `${pathname}?${paramString}` : pathname;

    // Use replaceState to avoid polluting browser history with every filter change
    router.replace(newUrl, { scroll: false });
  }, [
    actionFilter,
    entityTypeFilter,
    userFilter,
    startDate,
    endDate,
    debouncedSearch,
    currentPage,
    pathname,
    router,
  ]);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", "25");

      if (actionFilter !== "ALL") {
        params.set("action", actionFilter);
      }
      if (entityTypeFilter !== "ALL") {
        params.set("entityType", entityTypeFilter);
      }
      if (userFilter !== "ALL") {
        params.set("userId", userFilter);
      }
      if (startDate) {
        params.set("startDate", startDate);
      }
      if (endDate) {
        params.set("endDate", endDate);
      }
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Laden der Audit-Logs");
      }

      const data = await response.json();
      setAuditLogs(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [currentPage, actionFilter, entityTypeFilter, userFilter, startDate, endDate, debouncedSearch]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Reset page when filters change (but not when page itself changes)
  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, entityTypeFilter, userFilter, startDate, endDate, debouncedSearch]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  // Clear all filters
  const clearFilters = () => {
    setActionFilter("ALL");
    setEntityTypeFilter("ALL");
    setUserFilter("ALL");
    setStartDate("");
    setEndDate("");
    setSearchText("");
    setCurrentPage(1);
  };

  // Remove a single filter
  const removeFilter = (filterKey: string) => {
    switch (filterKey) {
      case "action":
        setActionFilter("ALL");
        break;
      case "entityType":
        setEntityTypeFilter("ALL");
        break;
      case "userId":
        setUserFilter("ALL");
        break;
      case "startDate":
        setStartDate("");
        break;
      case "endDate":
        setEndDate("");
        break;
      case "search":
        setSearchText("");
        break;
    }
  };

  // Check if any filters are active
  const hasActiveFilters =
    actionFilter !== "ALL" ||
    entityTypeFilter !== "ALL" ||
    userFilter !== "ALL" ||
    startDate !== "" ||
    endDate !== "" ||
    debouncedSearch !== "";

  // Build list of active filters for badge display
  const activeFilterEntries: { key: string; value: string }[] = [];
  if (actionFilter !== "ALL") activeFilterEntries.push({ key: "action", value: actionFilter });
  if (entityTypeFilter !== "ALL") activeFilterEntries.push({ key: "entityType", value: entityTypeFilter });
  if (userFilter !== "ALL") activeFilterEntries.push({ key: "userId", value: userFilter });
  if (startDate) activeFilterEntries.push({ key: "startDate", value: startDate });
  if (endDate) activeFilterEntries.push({ key: "endDate", value: endDate });
  if (debouncedSearch) activeFilterEntries.push({ key: "search", value: debouncedSearch });

  // Open details dialog
  const openDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailsDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit-Logs</h1>
          <p className="text-muted-foreground">
            Protokoll aller Loesch- und wichtigen Aktionen
          </p>
        </div>
        <Button variant="outline" onClick={fetchAuditLogs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Filters Card */}
      <Card>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Filter className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Filter</CardTitle>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      {activeFilterEntries.length}
                    </Badge>
                  )}
                  {filtersOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Filter zurücksetzen
                </Button>
              )}
            </div>

            {/* Active filter badges - always visible even when collapsed */}
            {hasActiveFilters && !filtersOpen && (
              <div className="flex flex-wrap gap-2 pt-2">
                {activeFilterEntries.map((entry) => (
                  <Badge
                    key={entry.key}
                    variant="outline"
                    className="flex items-center gap-1 pl-2 pr-1 py-1"
                  >
                    <span className="text-muted-foreground text-xs">
                      {getFilterIcon(entry.key)}:
                    </span>
                    <span className="text-xs font-medium">
                      {getFilterLabel(entry.key, entry.value, users)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFilter(entry.key);
                      }}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted transition-colors"
                      aria-label={`Filter ${getFilterIcon(entry.key)} entfernen`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Search row */}
              <div className="mb-4">
                <Label htmlFor="search-field">Suche</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-field"
                    type="text"
                    placeholder="Suche in Entity-ID, Benutzer, IP-Adresse..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-10"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText("")}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Suche löschen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter row */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {/* User Filter */}
                <div className="space-y-2">
                  <Label htmlFor="user-filter">Benutzer</Label>
                  <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger id="user-filter">
                      <div className="flex items-center gap-2 truncate">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <SelectValue placeholder="Benutzer waehlen" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Alle Benutzer</SelectItem>
                      {usersLoading && (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Lade Benutzer...
                        </div>
                      )}
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <span className="truncate">
                            {user.firstName || user.lastName
                              ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                              : user.email}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Filter */}
                <div className="space-y-2">
                  <Label htmlFor="action-filter">Aktion</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger id="action-filter">
                      <SelectValue placeholder="Aktion waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Entity Type Filter */}
                <div className="space-y-2">
                  <Label htmlFor="entity-filter">Entitaet</Label>
                  <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                    <SelectTrigger id="entity-filter">
                      <SelectValue placeholder="Entitaet waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Date */}
                <div className="space-y-2">
                  <Label htmlFor="start-date">Von</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* End Date */}
                <div className="space-y-2">
                  <Label htmlFor="end-date">Bis</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {/* Active filter badges inside expanded panel */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground self-center mr-1">
                    Aktive Filter:
                  </span>
                  {activeFilterEntries.map((entry) => (
                    <Badge
                      key={entry.key}
                      variant="outline"
                      className="flex items-center gap-1 pl-2 pr-1 py-1"
                    >
                      <span className="text-muted-foreground text-xs">
                        {getFilterIcon(entry.key)}:
                      </span>
                      <span className="text-xs font-medium">
                        {getFilterLabel(entry.key, entry.value, users)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFilter(entry.key)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted transition-colors"
                        aria-label={`Filter ${getFilterIcon(entry.key)} entfernen`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Protokolleinträge</CardTitle>
              <CardDescription>
                {pagination
                  ? `${pagination.totalCount} Einträge gefunden`
                  : "Lade Einträge..."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="font-medium">Fehler beim Laden</p>
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={fetchAuditLogs}
              >
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Table */}
          {!error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Datum/Zeit</TableHead>
                  <TableHead>Benutzer</TableHead>
                  <TableHead className="w-[120px]">Aktion</TableHead>
                  <TableHead>Entitaet</TableHead>
                  <TableHead className="w-[100px] text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Loading State */}
                {loading &&
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}

                {/* Empty State */}
                {!loading && auditLogs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>Keine Audit-Logs gefunden</p>
                      {hasActiveFilters && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={clearFilters}
                          className="mt-2"
                        >
                          Filter zurücksetzen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )}

                {/* Data Rows */}
                {!loading &&
                  auditLogs.map((log) => {
                    const badgeProps = getActionBadgeProps(log.action);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.createdAt), "dd.MM.yyyy HH:mm:ss", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {formatUserName(log.user)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.user?.email || "system@internal"}
                            </p>
                            {log.impersonatedBy && (
                              <p className="text-xs text-orange-600">
                                (via {formatUserName(log.impersonatedBy)})
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeProps.variant}
                            className={badgeProps.className}
                          >
                            {getActionDisplayName(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {getEntityDisplayName(log.entityType)}
                            </p>
                            {log.entityId && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {log.entityId.substring(0, 8)}...
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDetails(log)}
                            title="Anzeigen"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Seite {pagination.page} von {pagination.totalPages} (
                {pagination.totalCount} Einträge)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrevPage || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNextPage || loading}
                >
                  Weiter
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Audit-Log Details
            </DialogTitle>
            <DialogDescription>
              Detaillierte Informationen zum Protokolleintrag
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Zeitpunkt</Label>
                  <p className="font-medium">
                    {format(new Date(selectedLog.createdAt), "dd.MM.yyyy HH:mm:ss", {
                      locale: de,
                    })}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Aktion</Label>
                  <div className="mt-1">
                    <Badge
                      variant={getActionBadgeProps(selectedLog.action).variant}
                      className={getActionBadgeProps(selectedLog.action).className}
                    >
                      {getActionDisplayName(selectedLog.action)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Benutzer</Label>
                  <p className="font-medium">{formatUserName(selectedLog.user)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedLog.user?.email}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Entitaet</Label>
                  <p className="font-medium">
                    {getEntityDisplayName(selectedLog.entityType)}
                  </p>
                  {selectedLog.entityId && (
                    <p className="text-xs font-mono text-muted-foreground">
                      ID: {selectedLog.entityId}
                    </p>
                  )}
                </div>
              </div>

              {/* Impersonation Info */}
              {selectedLog.impersonatedBy && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <Label className="text-xs text-orange-700">Impersoniert durch</Label>
                  <p className="font-medium text-orange-900">
                    {formatUserName(selectedLog.impersonatedBy)}
                  </p>
                  <p className="text-xs text-orange-700">
                    {selectedLog.impersonatedBy.email}
                  </p>
                </div>
              )}

              {/* Technical Info */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Technische Details
                </Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">IP-Adresse:</span>{" "}
                    <span className="font-mono">
                      {selectedLog.ipAddress || "Nicht verfügbar"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mandant:</span>{" "}
                    {selectedLog.tenant?.name || "Global"}
                  </div>
                </div>
                {selectedLog.userAgent && (
                  <p className="text-xs text-muted-foreground break-all">
                    User-Agent: {selectedLog.userAgent}
                  </p>
                )}
              </div>

              {/* Old Values */}
              {selectedLog.oldValues && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Vorherige Werte
                  </Label>
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}

              {/* New Values */}
              {selectedLog.newValues && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Neue Werte</Label>
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}

              {/* No data message */}
              {!selectedLog.oldValues && !selectedLog.newValues && (
                <div className="text-center text-muted-foreground py-4">
                  <p>Keine Änderungsdaten verfügbar</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Page wrapper with Suspense for useSearchParams
export default function AuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Audit-Logs</h1>
              <p className="text-muted-foreground">
                Protokoll aller Loesch- und wichtigen Aktionen
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Lade Audit-Logs...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AuditLogsContent />
    </Suspense>
  );
}
