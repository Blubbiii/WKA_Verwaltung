"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  Key,
  RefreshCw,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Types for the access report
interface RoleData {
  id: string;
  name: string;
  isSystem: boolean;
  color: string | null;
  resourceType: string;
  resourceIds: string[];
  resourceNames: string[];
}

interface PermissionData {
  name: string;
  displayName: string;
  module: string;
  action: string;
}

interface UserAccessData {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: RoleData[];
  permissions: PermissionData[];
  permissionCount: number;
  roleCount: number;
}

interface AccessReportResponse {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  totalUsers: number;
  totalRoles: number;
  totalPermissions: number;
  users: UserAccessData[];
}

interface RoleOption {
  id: string;
  name: string;
}

// Group permissions by module
function groupPermissionsByModule(
  permissions: PermissionData[]
): Map<string, PermissionData[]> {
  const grouped = new Map<string, PermissionData[]>();
  for (const perm of permissions) {
    const existing = grouped.get(perm.module) || [];
    existing.push(perm);
    grouped.set(perm.module, existing);
  }
  return grouped;
}

// Module display names
const MODULE_LABELS: Record<string, string> = {
  parks: "Windparks",
  turbines: "Turbinen",
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  plots: "Flaechen",
  leases: "Pacht",
  contracts: "Verträge",
  documents: "Dokumente",
  invoices: "Abrechnungen",
  votes: "Abstimmungen",
  "service-events": "Wartungen",
  reports: "Berichte",
  settings: "Einstellungen",
  users: "Benutzer",
  roles: "Rollen",
  admin: "Administration",
};

export default function AccessReportPage() {
  const [reportData, setReportData] = useState<AccessReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);

  // Fetch available roles for filtering
  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/roles");
      if (response.ok) {
        const data = await response.json();
        setAvailableRoles(
          data.roles?.map((r: { id: string; name: string }) => ({
            id: r.id,
            name: r.name,
          })) || []
        );
      }
    } catch {
    }
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedRoleId) {
        params.set("roleId", selectedRoleId);
      }

      const url = `/api/admin/access-report${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Laden des Reports");
      }

      const data: AccessReportResponse = await response.json();
      setReportData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Toggle user expansion
  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    if (reportData) {
      setExpandedUsers(new Set(reportData.users.map((u) => u.id)));
    }
  };

  const collapseAll = () => {
    setExpandedUsers(new Set());
  };

  // Filter users by search query
  const filteredUsers =
    reportData?.users.filter((user) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.roles.some((r) => r.name.toLowerCase().includes(query))
      );
    }) || [];

  // Export handlers
  const handleExport = async (format: "xlsx" | "csv" | "pdf") => {
    if (format === "pdf") {
      // For PDF, open in new tab
      const params = new URLSearchParams();
      params.set("format", "pdf");
      if (selectedRoleId) params.set("roleId", selectedRoleId);
      window.open(`/api/admin/access-report/pdf?${params}`, "_blank");
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (selectedRoleId) params.set("roleId", selectedRoleId);

      const response = await fetch(`/api/admin/access-report?${params}`);

      if (!response.ok) {
        throw new Error("Export fehlgeschlagen");
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Zugriffsreport_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error("Export fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Zugriffsreport
          </h1>
          <p className="text-muted-foreground mt-1">
            Übersicht aller Benutzer und ihrer effektiven Berechtigungen
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchReport()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportieren
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel (XLSX)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      {reportData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Benutzer</p>
                <p className="text-2xl font-bold">{reportData.totalUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktive Rollen</p>
                <p className="text-2xl font-bold">{reportData.totalRoles}</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Key className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Berechtigungen (gesamt)</p>
                <p className="text-2xl font-bold">{reportData.totalPermissions}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Benutzer oder Rolle suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={selectedRoleId}
          onValueChange={(value) => setSelectedRoleId(value === "all" ? "" : value)}
        >
          <SelectTrigger className="w-full sm:w-[250px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Nach Rolle filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Rollen</SelectItem>
            {availableRoles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Alle aufklappen
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Alle zuklappen
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          <p className="font-medium">Fehler</p>
          <p className="text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReport()}
            className="mt-2"
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredUsers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Keine Benutzer gefunden</p>
          <p className="text-sm">
            {searchQuery
              ? "Versuchen Sie eine andere Suchanfrage."
              : "Es gibt keine aktiven Benutzer im System."}
          </p>
        </div>
      )}

      {/* User List */}
      {!loading && !error && filteredUsers.length > 0 && (
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const isExpanded = expandedUsers.has(user.id);
            const groupedPermissions = groupPermissionsByModule(user.permissions);

            return (
              <div
                key={user.id}
                className="bg-card rounded-lg border overflow-hidden"
              >
                {/* User Header Row */}
                <button
                  onClick={() => toggleUserExpanded(user.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  {/* Roles Preview */}
                  <div className="hidden sm:flex flex-wrap gap-1 max-w-[300px]">
                    {user.roles.slice(0, 3).map((role) => (
                      <Badge
                        key={role.id}
                        variant={role.isSystem ? "default" : "secondary"}
                        className="text-xs"
                        style={
                          role.color
                            ? { backgroundColor: role.color, color: "#fff" }
                            : undefined
                        }
                      >
                        {role.name}
                      </Badge>
                    ))}
                    {user.roles.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{user.roles.length - 3}
                      </Badge>
                    )}
                  </div>

                  {/* Permission Count */}
                  <Badge variant="outline" className="shrink-0">
                    {user.permissionCount} Berechtigungen
                  </Badge>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-4 space-y-4">
                    {/* Roles Section */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Rollen ({user.roles.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {user.roles.map((role) => (
                          <div
                            key={role.id}
                            className="bg-background rounded-lg border p-3"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={role.isSystem ? "default" : "secondary"}
                                style={
                                  role.color
                                    ? { backgroundColor: role.color, color: "#fff" }
                                    : undefined
                                }
                              >
                                {role.name}
                              </Badge>
                              {role.isSystem && (
                                <Badge variant="outline" className="text-xs">
                                  System
                                </Badge>
                              )}
                            </div>
                            {role.resourceType !== "__global__" && (
                              <p className="text-xs text-muted-foreground">
                                Eingeschraenkt auf {role.resourceType}:{" "}
                                {role.resourceNames.length > 0
                                  ? role.resourceNames.join(", ")
                                  : role.resourceIds.join(", ")}
                              </p>
                            )}
                            {role.resourceType === "__global__" && (
                              <p className="text-xs text-muted-foreground">
                                Global (alle Ressourcen)
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Permissions Section */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        Effektive Berechtigungen ({user.permissionCount})
                      </h4>
                      <div className="space-y-3">
                        {Array.from(groupedPermissions.entries()).map(
                          ([module, permissions]) => (
                            <div key={module} className="bg-background rounded-lg border p-3">
                              <p className="text-sm font-medium mb-2">
                                {MODULE_LABELS[module] || module}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {permissions.map((perm) => (
                                  <Badge
                                    key={perm.name}
                                    variant="outline"
                                    className="text-xs"
                                    title={perm.name}
                                  >
                                    {perm.displayName}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generated At Footer */}
      {reportData && (
        <p className="text-xs text-muted-foreground text-center">
          Report generiert am{" "}
          {new Date(reportData.generatedAt).toLocaleString("de-DE")} für{" "}
          {reportData.tenantName}
        </p>
      )}
    </div>
  );
}
