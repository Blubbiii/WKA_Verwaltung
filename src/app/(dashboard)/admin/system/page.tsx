"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Server,
  Database,
  HardDrive,
  Activity,
  RefreshCw,
  Clock,
  FileText,
  Users,
  Building2,
  Wind,
  Landmark,
  FileBarChart,
  ScrollText,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  MemoryStick,
  Timer,
  Info,
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaintenanceModeTab } from "@/components/admin/maintenance-mode-tab";
import { Wrench } from "lucide-react";

// Types
interface ServerStatus {
  status: "online" | "offline" | "degraded";
  uptime: number;
  uptimeFormatted: string;
}

interface DatabaseStatus {
  status: "connected" | "disconnected" | "error";
  responseTimeMs: number;
  type: string;
}

interface StorageStatus {
  status: "connected" | "disconnected" | "error";
  type: string;
  endpoint: string;
}

interface DatabaseStats {
  tenants: number;
  users: number;
  parks: number;
  turbines: number;
  funds: number;
  shareholders: number;
  plots: number;
  leases: number;
  contracts: number;
  documents: number;
  invoices: number;
  auditLogs: number;
  votes: number;
  persons: number;
}

interface StorageStats {
  totalDocuments: number;
  totalFileSizeBytes: number;
  documentsByCategory: Array<{
    category: string;
    count: number;
  }>;
}

interface AuditLogUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface RecentAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  user: AuditLogUser | null;
}

interface SystemInfo {
  nodeVersion: string;
  nextVersion: string;
  prismaVersion: string;
  platform: string;
  arch: string;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  serverTime: string;
}

interface SystemStats {
  serverStatus: ServerStatus;
  databaseStatus: DatabaseStatus;
  storageStatus: StorageStatus;
  databaseStats: DatabaseStats;
  storageStats: StorageStats;
  recentAuditLogs: RecentAuditLog[];
  systemInfo: SystemInfo;
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Helper function to get status color
function getStatusColor(
  status: "online" | "offline" | "connected" | "disconnected" | "error" | "degraded"
): string {
  switch (status) {
    case "online":
    case "connected":
      return "text-green-600";
    case "offline":
    case "disconnected":
      return "text-red-600";
    case "degraded":
    case "error":
      return "text-yellow-600";
    default:
      return "text-gray-600";
  }
}

// Helper function to get status icon
function getStatusIcon(
  status: "online" | "offline" | "connected" | "disconnected" | "error" | "degraded"
) {
  switch (status) {
    case "online":
    case "connected":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "offline":
    case "disconnected":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "degraded":
    case "error":
      return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-600" />;
  }
}

// Helper function to format user name
function formatUserName(user: AuditLogUser | null): string {
  if (!user) return "System";
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.email;
}

// Action display names
const actionDisplayNames: Record<string, string> = {
  CREATE: "Erstellt",
  UPDATE: "Bearbeitet",
  DELETE: "Gelöscht",
  VIEW: "Angesehen",
  EXPORT: "Exportiert",
  LOGIN: "Angemeldet",
  LOGOUT: "Abgemeldet",
  IMPERSONATE: "Impersoniert",
};

// Entity display names
const entityDisplayNames: Record<string, string> = {
  Park: "Windpark",
  Turbine: "Anlage",
  Fund: "Gesellschaft",
  Shareholder: "Gesellschafter",
  Plot: "Flurstueck",
  Lease: "Pachtvertrag",
  Contract: "Vertrag",
  Document: "Dokument",
  Invoice: "Rechnung",
  Vote: "Abstimmung",
  ServiceEvent: "Service-Event",
  News: "Neuigkeit",
  Person: "Person",
  User: "Benutzer",
  Role: "Rolle",
  Tenant: "Mandant",
};

// Category display names
const categoryDisplayNames: Record<string, string> = {
  CONTRACT: "Verträge",
  PROTOCOL: "Protokolle",
  REPORT: "Berichte",
  INVOICE: "Rechnungen",
  PERMIT: "Genehmigungen",
  CORRESPONDENCE: "Korrespondenz",
  OTHER: "Sonstige",
};

// Table icons mapping
const tableIcons: Record<string, React.ReactNode> = {
  tenants: <Building2 className="h-4 w-4 text-muted-foreground" />,
  users: <Users className="h-4 w-4 text-muted-foreground" />,
  parks: <Wind className="h-4 w-4 text-muted-foreground" />,
  turbines: <Wind className="h-4 w-4 text-muted-foreground" />,
  funds: <Landmark className="h-4 w-4 text-muted-foreground" />,
  shareholders: <Users className="h-4 w-4 text-muted-foreground" />,
  plots: <FileBarChart className="h-4 w-4 text-muted-foreground" />,
  leases: <ScrollText className="h-4 w-4 text-muted-foreground" />,
  contracts: <FileText className="h-4 w-4 text-muted-foreground" />,
  documents: <FileText className="h-4 w-4 text-muted-foreground" />,
  invoices: <FileBarChart className="h-4 w-4 text-muted-foreground" />,
  auditLogs: <Shield className="h-4 w-4 text-muted-foreground" />,
  votes: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
  persons: <Users className="h-4 w-4 text-muted-foreground" />,
};

// Table display names
const tableDisplayNames: Record<string, string> = {
  tenants: "Mandanten",
  users: "Benutzer",
  parks: "Windparks",
  turbines: "Windenergieanlagen",
  funds: "Gesellschaften",
  shareholders: "Gesellschafter",
  plots: "Flurstuecke",
  leases: "Pachtverträge",
  contracts: "Verträge",
  documents: "Dokumente",
  invoices: "Rechnungen",
  auditLogs: "Audit-Logs",
  votes: "Abstimmungen",
  persons: "Personen",
};

export default function SystemHealthPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch system stats
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/system/stats");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Laden der System-Statistiken");
      }

      const data = await response.json();
      setStats(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Calculate memory usage percentage
  const memoryUsagePercent = stats
    ? Math.round((stats.systemInfo.memoryUsage.heapUsed / stats.systemInfo.memoryUsage.heapTotal) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System & Wartung</h1>
          <p className="text-muted-foreground">
            Überwachung, Statistiken und Wartungsmodus
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-sm text-muted-foreground">
              Zuletzt aktualisiert: {format(lastRefresh, "HH:mm:ss", { locale: de })}
            </span>
          )}
          <Button variant="outline" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System-Gesundheit
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Wartungsmodus
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-6">

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Fehler beim Laden</p>
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchStats}>
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Server Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Server-Status</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-7 w-20 mb-1" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : stats ? (
              <>
                <div className="flex items-center gap-2">
                  {getStatusIcon(stats.serverStatus.status)}
                  <span className={`text-2xl font-bold ${getStatusColor(stats.serverStatus.status)}`}>
                    {stats.serverStatus.status === "online" ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Laufzeit: {stats.serverStatus.uptimeFormatted}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Datenbank-Status</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-7 w-24 mb-1" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : stats ? (
              <>
                <div className="flex items-center gap-2">
                  {getStatusIcon(stats.databaseStatus.status)}
                  <span className={`text-2xl font-bold ${getStatusColor(stats.databaseStatus.status)}`}>
                    {stats.databaseStatus.status === "connected" ? "Verbunden" : "Getrennt"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Antwortzeit: {stats.databaseStatus.responseTimeMs}ms
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Storage Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speicher-Status</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-7 w-24 mb-1" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : stats ? (
              <>
                <div className="flex items-center gap-2">
                  {getStatusIcon(stats.storageStatus.status)}
                  <span className={`text-2xl font-bold ${getStatusColor(stats.storageStatus.status)}`}>
                    {stats.storageStatus.status === "connected" ? "Verbunden" : "Getrennt"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Typ: {stats.storageStatus.type}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speichernutzung</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-7 w-16 mb-1" />
                <Skeleton className="h-4 w-full" />
              </>
            ) : stats ? (
              <>
                <div className="text-2xl font-bold">{memoryUsagePercent}%</div>
                <Progress value={memoryUsagePercent} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {formatBytes(stats.systemInfo.memoryUsage.heapUsed)} / {formatBytes(stats.systemInfo.memoryUsage.heapTotal)}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Database Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Datenbank-Statistiken
            </CardTitle>
            <CardDescription>Anzahl Datensaetze pro Tabelle</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="space-y-2">
                {Object.entries(stats.databaseStats).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {tableIcons[key]}
                      <span className="text-sm">{tableDisplayNames[key] || key}</span>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {value.toLocaleString("de-DE")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Storage Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Speicher-Übersicht
            </CardTitle>
            <CardDescription>Dokumente und Dateispeicher</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : stats ? (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Dokumente gesamt</p>
                    <p className="text-2xl font-bold">
                      {stats.storageStats.totalDocuments.toLocaleString("de-DE")}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Speicherplatz</p>
                    <p className="text-2xl font-bold">
                      {formatBytes(stats.storageStats.totalFileSizeBytes)}
                    </p>
                  </div>
                </div>

                {/* Documents by Category */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Dokumente nach Kategorie</h4>
                  {stats.storageStats.documentsByCategory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.storageStats.documentsByCategory.map((item) => {
                        const percentage = stats.storageStats.totalDocuments > 0
                          ? (item.count / stats.storageStats.totalDocuments) * 100
                          : 0;
                        return (
                          <div key={item.category} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span>{categoryDisplayNames[item.category] || item.category}</span>
                              <span className="text-muted-foreground">
                                {item.count} ({percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Letzte Aktivitäten
            </CardTitle>
            <CardDescription>Die letzten 10 Audit-Log-Einträge</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : stats && stats.recentAuditLogs.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {stats.recentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 py-2 border-b last:border-0"
                  >
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={log.action === "DELETE" ? "destructive" : log.action === "CREATE" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {actionDisplayNames[log.action] || log.action}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {entityDisplayNames[log.entityType] || log.entityType}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatUserName(log.user)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "HH:mm", { locale: de })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine Aktivitäten vorhanden</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              System-Informationen
            </CardTitle>
            <CardDescription>Versionen und technische Details</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Next.js Version</TableCell>
                    <TableCell className="text-right font-mono">
                      {stats.systemInfo.nextVersion}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Node.js Version</TableCell>
                    <TableCell className="text-right font-mono">
                      {stats.systemInfo.nodeVersion}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Prisma Version</TableCell>
                    <TableCell className="text-right font-mono">
                      {stats.systemInfo.prismaVersion}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Plattform</TableCell>
                    <TableCell className="text-right font-mono">
                      {stats.systemInfo.platform} ({stats.systemInfo.arch})
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Datenbank</TableCell>
                    <TableCell className="text-right font-mono">
                      {stats.databaseStatus.type}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Server-Zeit</TableCell>
                    <TableCell className="text-right font-mono">
                      {format(new Date(stats.systemInfo.serverTime), "dd.MM.yyyy HH:mm:ss", {
                        locale: de,
                      })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">RSS Speicher</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBytes(stats.systemInfo.memoryUsage.rss)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">External Speicher</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBytes(stats.systemInfo.memoryUsage.external)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <MaintenanceModeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
