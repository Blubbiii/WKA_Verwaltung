"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Database,
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  Clock,
  FileText,
  FolderArchive,
  Search,
  Eraser,
  FileDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Settings,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Types
interface Backup {
  id: string;
  createdAt: string;
  type: "manual" | "automatic";
  sizeBytes: number;
  status: "success" | "failed" | "in_progress";
  fileName: string;
}

interface StorageStats {
  totalUsedBytes: number;
  totalCapacityBytes: number;
  documentCount: number;
  averageFileSizeBytes: number;
}

interface StorageByCategory {
  category: string;
  categoryDisplay: string;
  count: number;
  sizeBytes: number;
}

interface BackupSettings {
  autoBackupEnabled: boolean;
  backupInterval: "daily" | "weekly" | "monthly";
  retentionDays: number;
  backupTime: string;
}

interface BackupData {
  backups: Backup[];
  storageStats: StorageStats;
  storageByCategory: StorageByCategory[];
  settings: BackupSettings;
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Export tables for GDPR
const exportTables = [
  { id: "users", label: "Benutzer" },
  { id: "parks", label: "Windparks" },
  { id: "turbines", label: "Windenergieanlagen" },
  { id: "funds", label: "Gesellschaften" },
  { id: "shareholders", label: "Gesellschafter" },
  { id: "persons", label: "Personen" },
  { id: "plots", label: "Flurstuecke" },
  { id: "leases", label: "Pachtverträge" },
  { id: "contracts", label: "Verträge" },
  { id: "documents", label: "Dokumente" },
  { id: "invoices", label: "Rechnungen" },
  { id: "votes", label: "Abstimmungen" },
];

export default function BackupStoragePage() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Backup actions state
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: true,
    backupInterval: "daily",
    retentionDays: 30,
    backupTime: "02:00",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Storage actions state
  const [searchingOrphans, setSearchingOrphans] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [deletingTemp, setDeletingTemp] = useState(false);

  // Export state
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Fetch backup data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/backup");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Laden der Backup-Daten");
      }

      const result = await response.json();
      setData(result);
      setSettings(result.settings);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create backup
  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Erstellen des Backups");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Erstellen des Backups");
    } finally {
      setCreatingBackup(false);
    }
  };

  // Delete backup
  const handleDeleteBackup = async (backupId: string) => {
    try {
      setDeletingBackup(backupId);
      const response = await fetch(`/api/admin/backup?id=${backupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Fehler beim Löschen des Backups");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen des Backups");
    } finally {
      setDeletingBackup(null);
    }
  };

  // Save settings
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateSettings", settings }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern der Einstellungen");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern der Einstellungen");
    } finally {
      setSavingSettings(false);
    }
  };

  // Storage cleanup actions
  const handleSearchOrphans = async () => {
    try {
      setSearchingOrphans(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "searchOrphans" }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Suchen verwaister Dateien");
      }

      const result = await response.json();
      toast.info(`Gefundene verwaiste Dateien: ${result.orphanedCount || 0}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Suchen verwaister Dateien");
    } finally {
      setSearchingOrphans(false);
    }
  };

  const handleClearCache = async () => {
    try {
      setClearingCache(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearCache" }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Leeren des Caches");
      }

      toast.success("Cache erfolgreich geleert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Leeren des Caches");
    } finally {
      setClearingCache(false);
    }
  };

  const handleDeleteTemp = async () => {
    try {
      setDeletingTemp(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteTemp" }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Löschen temporaerer Dateien");
      }

      const result = await response.json();
      toast.info(`Gelöschte temporaere Dateien: ${result.deletedCount || 0}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen temporaerer Dateien");
    } finally {
      setDeletingTemp(false);
    }
  };

  // Export data
  const handleExport = async () => {
    if (selectedTables.length === 0) {
      toast.error("Bitte waehlen Sie mindestens eine Tabelle aus");
      return;
    }

    try {
      setExporting(true);
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          format: exportFormat,
          tables: selectedTables,
        }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Exportieren der Daten");
      }

      const result = await response.json();
      toast.success(`Export gestartet. Download-Link: ${result.downloadUrl || "wird per E-Mail gesendet"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Exportieren der Daten");
    } finally {
      setExporting(false);
    }
  };

  // Toggle table selection
  const toggleTableSelection = (tableId: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    );
  };

  // Select all tables
  const selectAllTables = () => {
    if (selectedTables.length === exportTables.length) {
      setSelectedTables([]);
    } else {
      setSelectedTables(exportTables.map((t) => t.id));
    }
  };

  // Get status badge
  const getStatusBadge = (status: Backup["status"]) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Erfolgreich
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Fehlgeschlagen
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="secondary">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            In Bearbeitung
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Unbekannt
          </Badge>
        );
    }
  };

  // Calculate storage usage percentage
  const storageUsagePercent = data?.storageStats
    ? Math.round(
        (data.storageStats.totalUsedBytes / data.storageStats.totalCapacityBytes) * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Backup & Speicher</h1>
          <p className="text-muted-foreground">
            Datensicherung und Speicherverwaltung
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-sm text-muted-foreground">
              Zuletzt aktualisiert: {format(lastRefresh, "HH:mm:ss", { locale: de })}
            </span>
          )}
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Fehler</p>
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setError(null)}>
            Schliessen
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="backups" className="space-y-6">
        <TabsList>
          <TabsTrigger value="backups" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Backups
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Speicher-Verwaltung
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            Datenexport
          </TabsTrigger>
        </TabsList>

        {/* Backups Tab */}
        <TabsContent value="backups" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Database Backups */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Datenbank-Backups
                    </CardTitle>
                    <CardDescription>Erstellen und verwalten Sie Datenbank-Sicherungen</CardDescription>
                  </div>
                  <Button onClick={handleCreateBackup} disabled={creatingBackup}>
                    {creatingBackup ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Backup erstellen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : data?.backups && data.backups.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum/Zeit</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Größe</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.backups.map((backup) => (
                        <TableRow key={backup.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(backup.createdAt), "dd.MM.yyyy HH:mm", {
                                locale: de,
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={backup.type === "manual" ? "secondary" : "outline"}>
                              {backup.type === "manual" ? "Manuell" : "Automatisch"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                          <TableCell>{getStatusBadge(backup.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={backup.status !== "success"}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteBackup(backup.id)}
                                disabled={deletingBackup === backup.id}
                              >
                                {deletingBackup === backup.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderArchive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Backups vorhanden</p>
                    <p className="text-sm">Erstellen Sie Ihr erstes Backup</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Backup Settings */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Backup-Einstellungen
                </CardTitle>
                <CardDescription>Konfigurieren Sie automatische Backups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Auto Backup Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-backup">Automatische Backups</Label>
                      <p className="text-sm text-muted-foreground">
                        Erstellt regelmaessig automatische Sicherungen
                      </p>
                    </div>
                    <Switch
                      id="auto-backup"
                      checked={settings.autoBackupEnabled}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({ ...prev, autoBackupEnabled: checked }))
                      }
                    />
                  </div>

                  {/* Backup Interval */}
                  <div className="space-y-2">
                    <Label htmlFor="backup-interval">Backup-Intervall</Label>
                    <Select
                      value={settings.backupInterval}
                      onValueChange={(value: "daily" | "weekly" | "monthly") =>
                        setSettings((prev) => ({ ...prev, backupInterval: value }))
                      }
                      disabled={!settings.autoBackupEnabled}
                    >
                      <SelectTrigger id="backup-interval">
                        <SelectValue placeholder="Intervall waehlen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Taeglich</SelectItem>
                        <SelectItem value="weekly">Woechentlich</SelectItem>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Retention Period */}
                  <div className="space-y-2">
                    <Label htmlFor="retention">Aufbewahrungsdauer</Label>
                    <Select
                      value={String(settings.retentionDays)}
                      onValueChange={(value) =>
                        setSettings((prev) => ({ ...prev, retentionDays: Number(value) }))
                      }
                      disabled={!settings.autoBackupEnabled}
                    >
                      <SelectTrigger id="retention">
                        <SelectValue placeholder="Dauer waehlen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 Tage</SelectItem>
                        <SelectItem value="30">30 Tage</SelectItem>
                        <SelectItem value="90">90 Tage</SelectItem>
                        <SelectItem value="365">1 Jahr</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Backup Time */}
                  <div className="space-y-2">
                    <Label htmlFor="backup-time">Backup-Zeit</Label>
                    <Input
                      id="backup-time"
                      type="time"
                      value={settings.backupTime}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, backupTime: e.target.value }))
                      }
                      disabled={!settings.autoBackupEnabled}
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={savingSettings}>
                    {savingSettings ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Einstellungen speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Storage Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Speicher-Statistiken
                </CardTitle>
                <CardDescription>MinIO/S3 Speichernutzung</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : data?.storageStats ? (
                  <div className="space-y-6">
                    {/* Storage Overview */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Speicherplatz verwendet</span>
                        <span className="font-medium">
                          {formatBytes(data.storageStats.totalUsedBytes)} / {formatBytes(data.storageStats.totalCapacityBytes)}
                        </span>
                      </div>
                      <Progress value={storageUsagePercent} className="h-3" />
                      <p className="text-xs text-muted-foreground text-right">
                        {storageUsagePercent}% belegt
                      </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Dokumente gesamt</p>
                        <p className="text-2xl font-bold">
                          {data.storageStats.documentCount.toLocaleString("de-DE")}
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Durchschnittliche Größe</p>
                        <p className="text-2xl font-bold">
                          {formatBytes(data.storageStats.averageFileSizeBytes)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Daten verfügbar</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Storage by Category */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Speicher nach Kategorie
                </CardTitle>
                <CardDescription>Verteilung der Dokumente</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : data?.storageByCategory && data.storageByCategory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kategorie</TableHead>
                        <TableHead className="text-right">Anzahl</TableHead>
                        <TableHead className="text-right">Größe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.storageByCategory.map((category) => (
                        <TableRow key={category.category}>
                          <TableCell>{category.categoryDisplay}</TableCell>
                          <TableCell className="text-right">
                            {category.count.toLocaleString("de-DE")}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatBytes(category.sizeBytes)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Kategorien vorhanden</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cleanup Actions */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eraser className="h-5 w-5" />
                  Aufraeumen-Aktionen
                </CardTitle>
                <CardDescription>Speicher bereinigen und optimieren</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <Search className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium">Verwaiste Dateien suchen</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Findet Dateien ohne Datenbank-Referenz
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSearchOrphans}
                          disabled={searchingOrphans}
                        >
                          {searchingOrphans ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="mr-2 h-4 w-4" />
                          )}
                          Suchen
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <Eraser className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium">Cache leeren</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Loescht den Anwendungs-Cache
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearCache}
                          disabled={clearingCache}
                        >
                          {clearingCache ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Eraser className="mr-2 h-4 w-4" />
                          )}
                          Leeren
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <Trash2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium">Temporaere Dateien löschen</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Entfernt temporaere Uploads
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDeleteTemp}
                          disabled={deletingTemp}
                        >
                          {deletingTemp ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Löschen
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" />
                Datenexport
              </CardTitle>
              <CardDescription>
                Exportieren Sie Ihre Daten für DSGVO-Compliance oder Backup-Zwecke
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Export Format */}
                <div className="space-y-3">
                  <Label>Export-Format</Label>
                  <div className="flex gap-4">
                    <div
                      className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                        exportFormat === "json"
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setExportFormat("json")}
                    >
                      <FileJson className="h-8 w-8 text-yellow-600" />
                      <div>
                        <p className="font-medium">JSON</p>
                        <p className="text-sm text-muted-foreground">
                          Strukturiertes Format, ideal für Entwickler
                        </p>
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                        exportFormat === "csv"
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setExportFormat("csv")}
                    >
                      <FileSpreadsheet className="h-8 w-8 text-green-600" />
                      <div>
                        <p className="font-medium">CSV</p>
                        <p className="text-sm text-muted-foreground">
                          Tabellenformat, ideal für Excel
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tabellen auswaehlen</Label>
                    <Button variant="ghost" size="sm" onClick={selectAllTables}>
                      {selectedTables.length === exportTables.length
                        ? "Keine auswaehlen"
                        : "Alle auswaehlen"}
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {exportTables.map((table) => (
                      <div
                        key={table.id}
                        className="flex items-center space-x-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleTableSelection(table.id)}
                      >
                        <Checkbox
                          id={table.id}
                          checked={selectedTables.includes(table.id)}
                          onCheckedChange={() => toggleTableSelection(table.id)}
                        />
                        <Label htmlFor={table.id} className="cursor-pointer">
                          {table.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Export Button */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {selectedTables.length} Tabelle(n) ausgewaehlt
                  </p>
                  <Button
                    onClick={handleExport}
                    disabled={exporting || selectedTables.length === 0}
                  >
                    {exporting ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="mr-2 h-4 w-4" />
                    )}
                    Alle Daten exportieren
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
