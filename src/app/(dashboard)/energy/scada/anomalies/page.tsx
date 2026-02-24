"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  RefreshCw,
  Settings2,
  ChevronDown,
  ChevronUp,
  Eye,
  Check,
  X,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

// =============================================================================
// TYPES
// =============================================================================

interface Park {
  id: string;
  name: string;
}

interface AnomalyTurbine {
  id: string;
  designation: string;
  park: Park;
}

interface AnomalyUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Anomaly {
  id: string;
  tenantId: string;
  turbineId: string;
  type: string;
  severity: string;
  message: string;
  details: Record<string, number>;
  detectedAt: string;
  resolvedAt: string | null;
  acknowledged: boolean;
  acknowledgedById: string | null;
  acknowledgedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  turbine: AnomalyTurbine;
  acknowledgedBy: AnomalyUser | null;
}

interface AnomalyStats {
  openCount: number;
  criticalCount: number;
  todayCount: number;
  avgResponseTimeMinutes: number;
}

interface AnomalyConfig {
  enabled: boolean;
  performanceThreshold: number;
  availabilityThreshold: number;
  downtimeHoursThreshold: number;
  curveDeviationThreshold: number;
  dataQualityThreshold: number;
  notifyByEmail: boolean;
  notifyInApp: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  PERFORMANCE_DROP: "Leistungsabfall",
  LOW_AVAILABILITY: "Niedrige Verfügbarkeit",
  CURVE_DEVIATION: "Kennlinien-Abweichung",
  DATA_QUALITY: "Datenqualitaet",
  EXTENDED_DOWNTIME: "Langzeit-Stillstand",
};

const ANOMALY_TYPE_COLORS: Record<string, string> = {
  PERFORMANCE_DROP: "bg-orange-100 text-orange-800 border-orange-200",
  LOW_AVAILABILITY: "bg-red-100 text-red-800 border-red-200",
  CURVE_DEVIATION: "bg-purple-100 text-purple-800 border-purple-200",
  DATA_QUALITY: "bg-blue-100 text-blue-800 border-blue-200",
  EXTENDED_DOWNTIME: "bg-red-100 text-red-800 border-red-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  WARNING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  WARNING: "Warnung",
  CRITICAL: "Kritisch",
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatResponseTime(minutes: number): string {
  if (minutes === 0) return "---";
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ScadaAnomaliesPage() {
  // State
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats>({
    openCount: 0,
    criticalCount: 0,
    todayCount: 0,
    avgResponseTimeMinutes: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);

  // Filters
  const [filterParkId, setFilterParkId] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("open");

  // Parks for filter
  const [parks, setParks] = useState<Park[]>([]);

  // Detail dialog
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Config section
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<AnomalyConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const LIMIT = 50;

  // ---- Data Fetching ----

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", LIMIT.toString());
      params.set("page", page.toString());

      if (filterParkId !== "all") params.set("parkId", filterParkId);
      if (filterType !== "all") params.set("type", filterType);
      if (filterSeverity !== "all") params.set("severity", filterSeverity);

      if (filterStatus === "open") {
        params.set("acknowledged", "false");
        params.set("resolved", "false");
      } else if (filterStatus === "acknowledged") {
        params.set("acknowledged", "true");
        params.set("resolved", "false");
      } else if (filterStatus === "resolved") {
        params.set("resolved", "true");
      }

      const res = await fetch(`/api/energy/scada/anomalies?${params}`);
      if (!res.ok) throw new Error("Fehler beim Laden");

      const data = await res.json();
      setAnomalies(data.anomalies);
      setTotal(data.total);
      setStats(data.stats);
    } catch (err) {
      console.error("Error fetching anomalies:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterParkId, filterType, filterSeverity, filterStatus]);

  const fetchParks = useCallback(async () => {
    try {
      const res = await fetch("/api/parks?limit=100");
      if (!res.ok) return;
      const data = await res.json();
      setParks(data.parks || data.data || []);
    } catch {
      // Parks filter is optional
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/energy/scada/anomalies/config");
      if (!res.ok) throw new Error("Fehler beim Laden der Konfiguration");
      const data = await res.json();
      setConfig(data.config);
    } catch (err) {
      console.error("Error fetching config:", err);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  useEffect(() => {
    fetchParks();
  }, [fetchParks]);

  // ---- Actions ----

  const handleRunDetection = async () => {
    setRunningDetection(true);
    try {
      const body = filterParkId !== "all" ? { parkId: filterParkId } : {};
      const res = await fetch("/api/energy/scada/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Fehler bei der Erkennung");

      const data = await res.json();
      alert(data.message);
      await fetchAnomalies();
    } catch (err) {
      console.error("Error running detection:", err);
      alert("Fehler bei der Anomalie-Erkennung");
    } finally {
      setRunningDetection(false);
    }
  };

  const handleAcknowledge = async (anomaly: Anomaly) => {
    try {
      const res = await fetch(`/api/energy/scada/anomalies/${anomaly.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      if (!res.ok) throw new Error("Fehler");
      await fetchAnomalies();
    } catch (err) {
      console.error("Error acknowledging:", err);
    }
  };

  const handleResolve = async () => {
    if (!selectedAnomaly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/energy/scada/anomalies/${selectedAnomaly.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolvedAt: new Date().toISOString(),
          acknowledged: true,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Fehler");
      setDetailDialogOpen(false);
      setSelectedAnomaly(null);
      setNotes("");
      await fetchAnomalies();
    } catch (err) {
      console.error("Error resolving:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedAnomaly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/energy/scada/anomalies/${selectedAnomaly.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Fehler");
      await fetchAnomalies();
    } catch (err) {
      console.error("Error saving notes:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setConfigSaving(true);
    try {
      const res = await fetch("/api/energy/scada/anomalies/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Fehler");
      const data = await res.json();
      setConfig(data.config);
    } catch (err) {
      console.error("Error saving config:", err);
    } finally {
      setConfigSaving(false);
    }
  };

  const openDetail = (anomaly: Anomaly) => {
    setSelectedAnomaly(anomaly);
    setNotes(anomaly.notes || "");
    setDetailDialogOpen(true);
  };

  const toggleConfig = () => {
    if (!configOpen && !config) {
      fetchConfig();
    }
    setConfigOpen(!configOpen);
  };

  // ---- Pagination ----
  const totalPages = Math.ceil(total / LIMIT);

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Anomalie-Erkennung"
        description="Automatische Erkennung von Leistungsabfaellen, Verfügbarkeitsproblemen und Datenqualitaet aus SCADA-Messdaten"
        actions={
          <Button
            onClick={handleRunDetection}
            disabled={runningDetection}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${runningDetection ? "animate-spin" : ""}`}
            />
            {runningDetection ? "Analyse läuft..." : "Analyse starten"}
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Anomalien</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.openCount}
            </div>
            <p className="text-xs text-muted-foreground">Nicht bestätigt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kritisch</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.criticalCount}
            </div>
            <p className="text-xs text-muted-foreground">Sofortige Aufmerksamkeit erforderlich</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heute erkannt</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.todayCount}
            </div>
            <p className="text-xs text-muted-foreground">Neue Anomalien heute</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reaktionszeit</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                formatResponseTime(stats.avgResponseTimeMinutes)
              )}
            </div>
            <p className="text-xs text-muted-foreground">Durchschnitt (letzte 30 Tage)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Filter</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Label className="text-xs text-muted-foreground mb-1 block">Park</Label>
              <Select value={filterParkId} onValueChange={(v) => { setFilterParkId(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Parks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Parks</SelectItem>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-52">
              <Label className="text-xs text-muted-foreground mb-1 block">Typ</Label>
              <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Typen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen</SelectItem>
                  {Object.entries(ANOMALY_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <Label className="text-xs text-muted-foreground mb-1 block">Schweregrad</Label>
              <Select value={filterSeverity} onValueChange={(v) => { setFilterSeverity(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="CRITICAL">Kritisch</SelectItem>
                  <SelectItem value="WARNING">Warnung</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-44">
              <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Offen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="acknowledged">Bestätigt</SelectItem>
                  <SelectItem value="resolved">Geloest</SelectItem>
                  <SelectItem value="all">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomalies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Anomalien ({total})</CardTitle>
          <CardDescription>
            Erkannte Anomalien aus der SCADA-Datenanalyse
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : anomalies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
              <p className="text-lg font-medium">Keine Anomalien gefunden</p>
              <p className="text-sm">
                Alle Anlagen arbeiten innerhalb der normalen Parameter.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Datum</TableHead>
                      <TableHead>Anlage</TableHead>
                      <TableHead>Park</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead className="w-[100px]">Schweregrad</TableHead>
                      <TableHead className="max-w-[300px]">Nachricht</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[100px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map((anomaly) => (
                      <TableRow
                        key={anomaly.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(anomaly)}
                      >
                        <TableCell className="text-sm">
                          {format(new Date(anomaly.detectedAt), "dd.MM.yyyy HH:mm", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {anomaly.turbine.designation}
                        </TableCell>
                        <TableCell>{anomaly.turbine.park.name}</TableCell>
                        <TableCell>
                          <Badge
                            className={ANOMALY_TYPE_COLORS[anomaly.type] || ""}
                            variant="outline"
                          >
                            {ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={SEVERITY_COLORS[anomaly.severity] || ""}
                            variant="outline"
                          >
                            {SEVERITY_LABELS[anomaly.severity] || anomaly.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                          {anomaly.message}
                        </TableCell>
                        <TableCell>
                          {anomaly.resolvedAt ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              Geloest
                            </Badge>
                          ) : anomaly.acknowledged ? (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                              Bestätigt
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              Offen
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Details anzeigen"
                              onClick={() => openDetail(anomaly)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!anomaly.acknowledged && !anomaly.resolvedAt && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Bestätigen"
                                onClick={() => handleAcknowledge(anomaly)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Seite {page} von {totalPages} ({total} Ergebnisse)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Settings Section (collapsible) */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={toggleConfig}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              <CardTitle className="text-base">Erkennungs-Einstellungen</CardTitle>
            </div>
            {configOpen ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <CardDescription>
            Schwellwerte und Benachrichtigungen für die automatische Anomalie-Erkennung
          </CardDescription>
        </CardHeader>

        {configOpen && (
          <CardContent className="space-y-6">
            {configLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : config ? (
              <>
                {/* Enable/Disable */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Anomalie-Erkennung aktiv</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktiviert oder deaktiviert die automatische Erkennung
                    </p>
                  </div>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, enabled: checked })
                    }
                  />
                </div>

                {/* Thresholds */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Leistungsabfall-Schwellwert (%)</Label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.performanceThreshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          performanceThreshold: Number(e.target.value),
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Warnung wenn der 7-Tage-Kapazitaetsfaktor mehr als X% unter dem 30-Tage-Durchschnitt liegt
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Verfügbarkeits-Schwellwert (%)</Label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.availabilityThreshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          availabilityThreshold: Number(e.target.value),
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Warnung wenn die Tagesverfügbarkeit unter X% faellt
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Max. Stillstand (Stunden)</Label>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={config.downtimeHoursThreshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          downtimeHoursThreshold: Number(e.target.value),
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Kritische Meldung bei zusammenhaengendem Stillstand über X Stunden
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Kennlinien-Abweichung (%)</Label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.curveDeviationThreshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          curveDeviationThreshold: Number(e.target.value),
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Warnung wenn die aktuelle Leistungskurve mehr als X% von der historischen abweicht
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Datenabdeckung-Schwellwert (%)</Label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.dataQualityThreshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          dataQualityThreshold: Number(e.target.value),
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Warnung wenn weniger als X% der erwarteten Messpunkte pro Tag vorhanden sind
                    </p>
                  </div>
                </div>

                {/* Notification settings */}
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium">Benachrichtigungen</h4>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>In-App-Benachrichtigungen</Label>
                      <p className="text-sm text-muted-foreground">
                        Benachrichtigungen im System anzeigen
                      </p>
                    </div>
                    <Switch
                      checked={config.notifyInApp}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, notifyInApp: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>E-Mail-Benachrichtigungen</Label>
                      <p className="text-sm text-muted-foreground">
                        Administratoren per E-Mail benachrichtigen
                      </p>
                    </div>
                    <Switch
                      checked={config.notifyByEmail}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, notifyByEmail: checked })
                      }
                    />
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={configSaving}
                  >
                    {configSaving ? "Speichern..." : "Einstellungen speichern"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                Konfiguration konnte nicht geladen werden.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          {selectedAnomaly && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge
                    className={SEVERITY_COLORS[selectedAnomaly.severity] || ""}
                    variant="outline"
                  >
                    {SEVERITY_LABELS[selectedAnomaly.severity]}
                  </Badge>
                  <Badge
                    className={ANOMALY_TYPE_COLORS[selectedAnomaly.type] || ""}
                    variant="outline"
                  >
                    {ANOMALY_TYPE_LABELS[selectedAnomaly.type]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {selectedAnomaly.turbine.designation} - {selectedAnomaly.turbine.park.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Message */}
                <div>
                  <Label className="text-xs text-muted-foreground">Beschreibung</Label>
                  <p className="text-sm mt-1">{selectedAnomaly.message}</p>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Erkannt am</Label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedAnomaly.detectedAt), "dd.MM.yyyy HH:mm:ss", {
                        locale: de,
                      })}
                    </p>
                  </div>
                  {selectedAnomaly.acknowledgedAt && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Bestätigt am</Label>
                      <p className="text-sm mt-1">
                        {format(
                          new Date(selectedAnomaly.acknowledgedAt),
                          "dd.MM.yyyy HH:mm",
                          { locale: de }
                        )}
                        {selectedAnomaly.acknowledgedBy && (
                          <span className="text-muted-foreground">
                            {" "}
                            von {selectedAnomaly.acknowledgedBy.firstName}{" "}
                            {selectedAnomaly.acknowledgedBy.lastName}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {selectedAnomaly.resolvedAt && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Geloest am</Label>
                      <p className="text-sm mt-1">
                        {format(new Date(selectedAnomaly.resolvedAt), "dd.MM.yyyy HH:mm", {
                          locale: de,
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Metric Details */}
                <div>
                  <Label className="text-xs text-muted-foreground">Metriken</Label>
                  <div className="mt-1 rounded-md border p-3 bg-muted/30">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(selectedAnomaly.details).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="font-mono">{typeof value === "number" ? value.toLocaleString("de-DE") : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs text-muted-foreground">Notizen</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notizen zur Anomalie..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter className="flex gap-2">
                {notes !== (selectedAnomaly.notes || "") && (
                  <Button
                    variant="outline"
                    onClick={handleSaveNotes}
                    disabled={saving}
                  >
                    Notizen speichern
                  </Button>
                )}

                {!selectedAnomaly.acknowledged && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleAcknowledge(selectedAnomaly);
                      setDetailDialogOpen(false);
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Bestätigen
                  </Button>
                )}

                {!selectedAnomaly.resolvedAt && (
                  <Button onClick={handleResolve} disabled={saving}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {saving ? "Wird geloest..." : "Als geloest markieren"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
