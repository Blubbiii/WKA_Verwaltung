"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Radio,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Loader2,
  FolderSearch,
  FolderOpen,
  Folder,
  ChevronRight,
  Play,
  CheckCircle2,
  ArrowLeft,
  Save,
  Clock,
  Power,
  PowerOff,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useParks } from "@/hooks/useParks";

// =============================================================================
// Types
// =============================================================================

interface ScadaMapping {
  id: string;
  locationCode: string;
  plantNo: number;
  parkId: string;
  turbineId: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  park?: { id: string; name: string };
  turbine?: { id: string; designation: string; deviceType?: string };
  createdAt: string;
}

interface ScanResult {
  locationCode: string;
  plantNumbers: number[];
  fileCount: number;
  dateRange: { from: string; to: string } | null;
  fileTypes: string[];
}

interface PreviewResult {
  locationCode: string;
  fileCount: number;
  fileTypes: string[];
  dateRange: { from: string; to: string } | null;
  plants: PlantPreview[];
  allMapped: boolean;
  unmappedCount: number;
  totalPlants: number;
}

interface PlantPreview {
  plantNo: number;
  sampleCount: number;
  sampleWindSpeed: number | null;
  samplePower: number | null;
  mapping: {
    id: string;
    turbineId: string;
    turbineDesignation: string;
    parkId: string;
    parkName: string;
  } | null;
}

interface ImportJob {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
  locationCode: string;
  fileType: string;
  filesTotal: number;
  filesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  error: string | null;
}

interface Turbine {
  id: string;
  designation: string;
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_BADGE_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-800 border-blue-200",
  SUCCESS: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  PARTIAL: "bg-amber-100 text-amber-800 border-amber-200",
  PENDING: "bg-gray-100 text-gray-800 border-gray-200",
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "Laufend",
  SUCCESS: "Erfolgreich",
  FAILED: "Fehlgeschlagen",
  PARTIAL: "Teilweise",
  PENDING: "Wartend",
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
};

const DEFAULT_SCAN_PATH = "C:\\Enercon";

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: de });
  } catch {
    return "-";
  }
}

// =============================================================================
// Tab: Zuordnungen (Mappings)
// =============================================================================

function MappingsTab() {
  const { parks, isLoading: parksLoading } = useParks();
  const [mappings, setMappings] = useState<ScadaMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingAll, setIsImportingAll] = useState(false);

  // Import progress tracking per locationCode
  const [importProgress, setImportProgress] = useState<Record<string, ImportJob>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [formLocationCode, setFormLocationCode] = useState("");
  const [formParkId, setFormParkId] = useState("");
  const [formPlantNo, setFormPlantNo] = useState("");
  const [formTurbineId, setFormTurbineId] = useState("");
  const [formDeviceType, setFormDeviceType] = useState<"WEA" | "PARKRECHNER" | "NVP">("WEA");
  const [formDescription, setFormDescription] = useState("");
  const [parkTurbines, setParkTurbines] = useState<Turbine[]>([]);
  const [turbinesLoading, setTurbinesLoading] = useState(false);

  // Load mappings
  const loadMappings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/mappings");
      if (!res.ok) throw new Error("Fehler beim Laden der Zuordnungen");
      const data = await res.json();
      setMappings(data.data ?? data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden der Zuordnungen"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Poll for active import progress
  const pollImportProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/energy/scada/import?limit=50");
      if (!res.ok) return;
      const data = await res.json();
      const logs: ImportJob[] = data.data ?? data;

      // Build a map: locationCode -> latest import job
      const progressMap: Record<string, ImportJob> = {};
      for (const log of logs) {
        const loc = log.locationCode;
        if (!loc) continue;
        // Keep only the most recent job per location (logs are sorted by startedAt desc)
        if (!progressMap[loc]) {
          progressMap[loc] = log;
        }
      }
      setImportProgress(progressMap);

      // Stop polling if no RUNNING imports
      const hasRunning = logs.some((l) => l.status === "RUNNING");
      if (!hasRunning && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch {
      // Polling error - ignore
    }
  }, []);

  // Start polling when imports are triggered
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already polling
    pollImportProgress(); // immediate first poll
    pollingRef.current = setInterval(pollImportProgress, 2000);
  }, [pollImportProgress]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Check for running imports on mount
  useEffect(() => {
    pollImportProgress().then(() => {
      // If there are running imports, start polling
      setImportProgress((prev) => {
        const hasRunning = Object.values(prev).some((j) => j.status === "RUNNING");
        if (hasRunning) {
          startPolling();
        }
        return prev;
      });
    });
  }, [pollImportProgress, startPolling]);

  // Load turbines when park changes
  useEffect(() => {
    if (!formParkId) {
      setParkTurbines([]);
      setFormTurbineId("");
      return;
    }

    async function loadTurbines() {
      setTurbinesLoading(true);
      try {
        const res = await fetch(`/api/turbines?parkId=${formParkId}&limit=100`);
        if (!res.ok) throw new Error("Fehler beim Laden der Turbinen");
        const data = await res.json();
        setParkTurbines(data.data ?? []);
      } catch {
        toast.error("Fehler beim Laden der Turbinen");
        setParkTurbines([]);
      } finally {
        setTurbinesLoading(false);
      }
    }

    loadTurbines();
  }, [formParkId]);

  // Reset form
  const resetForm = () => {
    setFormLocationCode("");
    setFormParkId("");
    setFormPlantNo("");
    setFormTurbineId("");
    setFormDeviceType("WEA");
    setFormDescription("");
    setParkTurbines([]);
  };

  // Save mapping
  const handleSave = async () => {
    if (!formLocationCode.trim()) {
      toast.error("Bitte Standort-Code eingeben");
      return;
    }
    if (!formParkId) {
      toast.error("Bitte Park auswaehlen");
      return;
    }
    if (!formPlantNo || Number(formPlantNo) < 1) {
      toast.error("Bitte gueltige Anlage-Nr. eingeben");
      return;
    }
    if (formDeviceType === "WEA" && !formTurbineId) {
      toast.error("Bitte WKA auswaehlen");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/energy/scada/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationCode: formLocationCode.trim(),
          parkId: formParkId,
          plantNo: Number(formPlantNo),
          turbineId: formDeviceType === "WEA" ? formTurbineId : undefined,
          deviceType: formDeviceType,
          description: formDescription.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success("Zuordnung erfolgreich erstellt");
      setDialogOpen(false);
      resetForm();
      loadMappings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Deactivate mapping
  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/energy/scada/mappings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Deaktivieren");
      }

      toast.success("Zuordnung deaktiviert");
      loadMappings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Deaktivieren"
      );
    }
  };

  // Start imports for all unique active location codes - ALL file types
  const handleImportAll = async () => {
    const activeLocations = [
      ...new Set(
        mappings
          .filter((m) => m.status === "ACTIVE")
          .map((m) => m.locationCode)
      ),
    ];

    if (activeLocations.length === 0) {
      toast.error("Keine aktiven Zuordnungen vorhanden");
      return;
    }

    setIsImportingAll(true);
    let started = 0;
    let failed = 0;

    for (const locationCode of activeLocations) {
      try {
        // First: scan for available file types at this location
        const scanRes = await fetch("/api/energy/scada/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basePath: DEFAULT_SCAN_PATH,
            locationCode,
          }),
        });

        let fileTypes = ["WSD"];
        if (scanRes.ok) {
          const scanData = await scanRes.json();
          if (scanData.fileTypes && Array.isArray(scanData.fileTypes)) {
            const detectedTypes = scanData.fileTypes
              .filter((ft: { fileType: string; fileCount: number }) => ft.fileCount > 0)
              .map((ft: { fileType: string }) => ft.fileType);
            if (detectedTypes.length > 0) {
              fileTypes = detectedTypes;
            }
          }
        }

        // Start imports for all detected file types
        for (const fileType of fileTypes) {
          try {
            const res = await fetch("/api/energy/scada/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                locationCode,
                fileType,
                basePath: DEFAULT_SCAN_PATH,
              }),
            });

            if (res.ok) {
              started++;
            } else {
              const err = await res.json().catch(() => ({}));
              if (res.status === 409) {
                // Import already running - not an error
                started++;
              } else {
                failed++;
              }
            }
          } catch {
            failed++;
          }
        }
      } catch {
        failed++;
      }
    }

    setIsImportingAll(false);

    if (failed === 0) {
      toast.success(
        `${started} Import(e) gestartet fuer ${activeLocations.length} Standort(e). Importe laufen im Hintergrund.`
      );
    } else {
      toast.warning(
        `${started} gestartet, ${failed} fehlgeschlagen von ${activeLocations.length} Standort(en)`
      );
    }

    // Start polling for progress
    if (started > 0) {
      startPolling();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>SCADA-Zuordnungen</CardTitle>
            <CardDescription>
              Zuordnung von SCADA-Standorten zu Windpark-Anlagen
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleImportAll}
              disabled={isLoading || isImportingAll || mappings.filter((m) => m.status === "ACTIVE").length === 0}
            >
              {isImportingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Alle Importe starten
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadMappings}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Zuordnung
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue SCADA-Zuordnung</DialogTitle>
                  <DialogDescription>
                    Ordnen Sie einen SCADA-Standort einer Windkraftanlage zu.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Standort-Code */}
                  <div className="space-y-2">
                    <Label htmlFor="locationCode">Standort-Code *</Label>
                    <Input
                      id="locationCode"
                      placeholder="z.B. Loc_5842"
                      value={formLocationCode}
                      onChange={(e) => setFormLocationCode(e.target.value)}
                    />
                  </div>

                  {/* Park */}
                  <div className="space-y-2">
                    <Label htmlFor="park">Park *</Label>
                    <Select value={formParkId} onValueChange={setFormParkId}>
                      <SelectTrigger id="park">
                        <SelectValue placeholder="Park auswaehlen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {parksLoading ? (
                          <SelectItem value="__loading" disabled>
                            Laden...
                          </SelectItem>
                        ) : (
                          parks?.map((park) => (
                            <SelectItem key={park.id} value={park.id}>
                              {park.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Anlage-Nr. */}
                  <div className="space-y-2">
                    <Label htmlFor="plantNo">Anlage-Nr. (PlantNo) *</Label>
                    <Input
                      id="plantNo"
                      type="number"
                      min={1}
                      max={99}
                      placeholder="z.B. 1"
                      value={formPlantNo}
                      onChange={(e) => setFormPlantNo(e.target.value)}
                    />
                  </div>

                  {/* Geraetetyp */}
                  <div className="space-y-2">
                    <Label htmlFor="deviceType">Geraetetyp *</Label>
                    <Select
                      value={formDeviceType}
                      onValueChange={(val) => {
                        setFormDeviceType(val as "WEA" | "PARKRECHNER" | "NVP");
                        if (val !== "WEA") setFormTurbineId("");
                      }}
                    >
                      <SelectTrigger id="deviceType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEA">WEA (Windkraftanlage)</SelectItem>
                        <SelectItem value="PARKRECHNER">Parkrechner (Summenwerte)</SelectItem>
                        <SelectItem value="NVP">NVP (Netzverknuepfungspunkt)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Turbine - only for WEA */}
                  {formDeviceType === "WEA" && (
                    <div className="space-y-2">
                      <Label htmlFor="turbine">WKA / Turbine *</Label>
                      <Select
                        value={formTurbineId}
                        onValueChange={setFormTurbineId}
                        disabled={!formParkId || turbinesLoading}
                      >
                        <SelectTrigger id="turbine">
                          <SelectValue
                            placeholder={
                              !formParkId
                                ? "Zuerst Park auswaehlen"
                                : turbinesLoading
                                  ? "Laden..."
                                  : "WKA auswaehlen..."
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {parkTurbines.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.designation}
                            </SelectItem>
                          ))}
                          {parkTurbines.length === 0 && !turbinesLoading && formParkId && (
                            <SelectItem value="__empty" disabled>
                              Keine Turbinen gefunden
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Info for Parkrechner/NVP */}
                  {formDeviceType !== "WEA" && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      {formDeviceType === "PARKRECHNER"
                        ? "Ein Parkrechner-Eintrag wird automatisch im Park erstellt. Dieser sammelt aggregierte Daten aller Anlagen."
                        : "Ein NVP-Eintrag (Netzverknuepfungspunkt) wird automatisch im Park erstellt. Dieser misst die Netzeinspeisung."}
                    </div>
                  )}

                  {/* Beschreibung */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Beschreibung (optional)</Label>
                    <Input
                      id="description"
                      placeholder="Optionale Beschreibung"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                    disabled={isSaving}
                  >
                    Abbrechen
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Speichern
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Standort-Code</TableHead>
                <TableHead>Anlage-Nr.</TableHead>
                <TableHead>Park</TableHead>
                <TableHead>Geraet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]">Import</TableHead>
                <TableHead className="w-[100px]">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Keine Zuordnungen vorhanden. Erstellen Sie eine neue
                    Zuordnung.
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-mono font-medium">
                      {mapping.locationCode}
                    </TableCell>
                    <TableCell className="font-mono">
                      {mapping.plantNo}
                    </TableCell>
                    <TableCell>{mapping.park?.name ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{mapping.turbine?.designation ?? "-"}</span>
                        {mapping.turbine?.deviceType && mapping.turbine.deviceType !== "WEA" && (
                          <Badge variant="outline" className="text-xs">
                            {mapping.turbine.deviceType === "PARKRECHNER" ? "PR" : "NVP"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_COLORS[mapping.status] || ""}
                      >
                        {STATUS_LABELS[mapping.status] || mapping.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const job = importProgress[mapping.locationCode];
                        if (!job) return <span className="text-muted-foreground text-xs">--</span>;

                        if (job.status === "RUNNING") {
                          const pct = (job.filesTotal ?? 0) > 0
                            ? Math.round(((job.filesProcessed ?? 0) / job.filesTotal) * 100)
                            : 0;
                          return (
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs font-mono w-8 text-right">{pct}%</span>
                            </div>
                          );
                        }

                        if (job.status === "SUCCESS") {
                          return (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">{(job.recordsImported ?? 0).toLocaleString("de-DE")}</span>
                            </div>
                          );
                        }

                        if (job.status === "PARTIAL") {
                          return (
                            <div className="flex items-center gap-1 text-amber-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">{(job.recordsImported ?? 0).toLocaleString("de-DE")}</span>
                            </div>
                          );
                        }

                        if (job.status === "FAILED") {
                          return (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                              Fehler
                            </Badge>
                          );
                        }

                        return <span className="text-muted-foreground text-xs">--</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      {mapping.status === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeactivate(mapping.id)}
                          aria-label="Zuordnung deaktivieren"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Tab: Import
// =============================================================================

function ImportTab() {
  const { parks, isLoading: parksLoading } = useParks();

  // Scan state
  const [scanPath, setScanPath] = useState(DEFAULT_SCAN_PATH);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);

  // Preview state
  const [selectedLocation, setSelectedLocation] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Mapping state for unmapped plants
  const [plantMappings, setPlantMappings] = useState<Record<number, { parkId: string; turbineId: string }>>({});
  const [parkTurbines, setParkTurbines] = useState<Record<string, Array<{ id: string; designation: string }>>>({});
  const [isSavingMappings, setIsSavingMappings] = useState(false);

  // Browse dialog state
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [browseDirectories, setBrowseDirectories] = useState<Array<{ name: string; path: string }>>([]);
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Import state - supports multiple concurrent imports (one per file type)
  const [activeImports, setActiveImports] = useState<ImportJob[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Import history
  const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Load import history
  // ---------------------------------------------------------------------------
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/energy/scada/import?limit=20");
      if (!res.ok) throw new Error("Fehler beim Laden der Import-Historie");
      const data = await res.json();
      setImportHistory(data.data ?? data);
    } catch {
      toast.error("Fehler beim Laden der Import-Historie");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRefs.current.forEach((interval) => clearInterval(interval));
      pollingRefs.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Folder Browser
  // ---------------------------------------------------------------------------
  const browseTo = async (targetPath?: string) => {
    setIsBrowsing(true);
    try {
      const res = await fetch("/api/energy/scada/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPath: targetPath || null }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Laden der Verzeichnisse");
      }

      const data = await res.json();
      setBrowsePath(data.currentPath || "");
      setBrowseDirectories(data.directories || []);
      setBrowseParentPath(data.parentPath || null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden der Verzeichnisse"
      );
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleOpenBrowser = () => {
    setBrowseOpen(true);
    browseTo(scanPath.trim() || undefined);
  };

  const handleBrowseSelect = () => {
    if (browsePath) {
      setScanPath(browsePath);
    }
    setBrowseOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Step 1: Scan folder
  // ---------------------------------------------------------------------------
  const handleScan = async () => {
    if (!scanPath.trim()) {
      toast.error("Bitte Pfad eingeben");
      return;
    }

    setIsScanning(true);
    setScanResults([]);
    setSelectedLocation(null);
    setPreview(null);
    setPlantMappings({});

    try {
      const res = await fetch("/api/energy/scada/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePath: scanPath.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Scannen");
      }

      const data = await res.json();
      const results = data.data ?? data;
      setScanResults(Array.isArray(results) ? results : []);

      if (Array.isArray(results) && results.length === 0) {
        toast.info("Keine SCADA-Daten im angegebenen Pfad gefunden");
      } else {
        toast.success(
          `${Array.isArray(results) ? results.length : 0} Standort(e) gefunden`
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Scannen"
      );
    } finally {
      setIsScanning(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2: Load preview for a location
  // ---------------------------------------------------------------------------
  const handleSelectLocation = async (location: ScanResult) => {
    setSelectedLocation(location);
    setPreview(null);
    setPlantMappings({});
    setIsLoadingPreview(true);

    try {
      const res = await fetch("/api/energy/scada/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basePath: scanPath.trim(),
          locationCode: location.locationCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Laden der Vorschau");
      }

      const data = await res.json();
      const result: PreviewResult = data.data ?? data;
      setPreview(result);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden der Vorschau"
      );
      setSelectedLocation(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Load turbines for a park (cached per parkId)
  // ---------------------------------------------------------------------------
  const loadTurbinesForPark = useCallback(async (parkId: string) => {
    if (parkTurbines[parkId]) return; // already cached
    try {
      const res = await fetch(`/api/turbines?parkId=${parkId}&limit=100`);
      if (!res.ok) throw new Error("Fehler beim Laden der Turbinen");
      const data = await res.json();
      const turbines = data.data ?? [];
      setParkTurbines((prev) => ({
        ...prev,
        [parkId]: Array.isArray(turbines) ? turbines : [],
      }));
    } catch {
      toast.error("Fehler beim Laden der Turbinen");
    }
  }, [parkTurbines]);

  // ---------------------------------------------------------------------------
  // Handle park selection for a plant mapping
  // ---------------------------------------------------------------------------
  const handlePlantParkChange = (plantNo: number, parkId: string) => {
    setPlantMappings((prev) => ({
      ...prev,
      [plantNo]: { parkId, turbineId: "" },
    }));
    if (parkId) {
      loadTurbinesForPark(parkId);
    }
  };

  // ---------------------------------------------------------------------------
  // Handle turbine selection for a plant mapping
  // ---------------------------------------------------------------------------
  const handlePlantTurbineChange = (plantNo: number, turbineId: string) => {
    setPlantMappings((prev) => ({
      ...prev,
      [plantNo]: { ...prev[plantNo], turbineId },
    }));
  };

  // ---------------------------------------------------------------------------
  // Navigate back from preview to scan results
  // ---------------------------------------------------------------------------
  const handleBackToScan = () => {
    setSelectedLocation(null);
    setPreview(null);
    setPlantMappings({});
  };

  // ---------------------------------------------------------------------------
  // Step 3: Save mappings (used by both buttons)
  // ---------------------------------------------------------------------------
  const saveMappings = async (): Promise<boolean> => {
    if (!preview || !selectedLocation) return false;

    const unmappedWithSelections = preview.plants.filter(
      (p) => !p.mapping && plantMappings[p.plantNo]?.parkId && plantMappings[p.plantNo]?.turbineId
    );

    if (unmappedWithSelections.length === 0) {
      toast.error("Bitte mindestens eine Zuordnung auswaehlen");
      return false;
    }

    setIsSavingMappings(true);
    try {
      for (const plant of unmappedWithSelections) {
        const mapping = plantMappings[plant.plantNo];
        const res = await fetch("/api/energy/scada/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationCode: selectedLocation.locationCode,
            parkId: mapping.parkId,
            plantNo: plant.plantNo,
            turbineId: mapping.turbineId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error || `Fehler beim Speichern der Zuordnung fuer Anlage ${plant.plantNo}`
          );
        }
      }

      toast.success(
        `${unmappedWithSelections.length} Zuordnung(en) erfolgreich gespeichert`
      );
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern der Zuordnungen"
      );
      return false;
    } finally {
      setIsSavingMappings(false);
    }
  };

  // ---------------------------------------------------------------------------
  // "Nur Zuordnungen speichern" button
  // ---------------------------------------------------------------------------
  const handleSaveMappingsOnly = async () => {
    const success = await saveMappings();
    if (success && selectedLocation) {
      // Reload preview to reflect newly saved mappings
      await handleSelectLocation(selectedLocation);
    }
  };

  // ---------------------------------------------------------------------------
  // Start import for ALL file types of a location (sequentially fires off
  // one import per file type, then polls each one independently)
  // ---------------------------------------------------------------------------
  const startImportAllTypes = async (locationCode: string, fileTypes: string[]) => {
    // If no file types provided, fall back to WSD
    const types = fileTypes.length > 0 ? fileTypes : ["WSD"];
    setIsImporting(true);
    setActiveImports([]);

    // Clear any existing polling intervals
    pollingRefs.current.forEach((interval) => clearInterval(interval));
    pollingRefs.current.clear();

    let startedCount = 0;
    let failedToStart = 0;
    const completedTypes = new Set<string>();

    for (const fileType of types) {
      try {
        const res = await fetch("/api/energy/scada/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationCode,
            fileType,
            basePath: scanPath.trim(),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 409) {
            // Already running - still count as started
            startedCount++;
          } else {
            failedToStart++;
          }
          continue;
        }

        const data = await res.json();
        const job: ImportJob = data.data ?? data;
        startedCount++;

        // Add to active imports
        setActiveImports((prev) => [...prev, job]);

        // Start polling for this specific job
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/energy/scada/import/${job.id}`);
            if (!pollRes.ok) return;
            const pollData = await pollRes.json();
            const updatedJob: ImportJob = pollData.data ?? pollData;

            // Update this job in the list
            setActiveImports((prev) =>
              prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
            );

            // Stop polling when this import is done
            if (
              updatedJob.status === "SUCCESS" ||
              updatedJob.status === "FAILED" ||
              updatedJob.status === "PARTIAL"
            ) {
              const interval = pollingRefs.current.get(job.id);
              if (interval) {
                clearInterval(interval);
                pollingRefs.current.delete(job.id);
              }

              completedTypes.add(fileType);

              // Check if ALL imports are done
              if (pollingRefs.current.size === 0) {
                setIsImporting(false);
                loadHistory();
              }
            }
          } catch {
            // Polling error - ignore
          }
        }, 2000);

        pollingRefs.current.set(job.id, pollInterval);
      } catch {
        failedToStart++;
      }
    }

    if (startedCount === 0) {
      toast.error("Kein Import konnte gestartet werden");
      setIsImporting(false);
    } else if (failedToStart > 0) {
      toast.warning(
        `${startedCount} von ${types.length} Dateitypen gestartet (${failedToStart} fehlgeschlagen)`
      );
    } else {
      toast.success(
        `Import gestartet: ${startedCount} Dateityp(en) fuer ${locationCode}`
      );
    }
  };

  // ---------------------------------------------------------------------------
  // "Import starten" (all mapped) or direct import - imports ALL file types
  // ---------------------------------------------------------------------------
  const handleDirectImport = async (location: ScanResult) => {
    await startImportAllTypes(location.locationCode, location.fileTypes);
  };

  const handleStartImport = async () => {
    if (!selectedLocation) return;
    await startImportAllTypes(
      selectedLocation.locationCode,
      preview?.fileTypes ?? selectedLocation.fileTypes
    );
  };

  // ---------------------------------------------------------------------------
  // "Zuordnungen speichern und importieren"
  // ---------------------------------------------------------------------------
  const handleSaveMappingsAndImport = async () => {
    const success = await saveMappings();
    if (success && selectedLocation) {
      await startImportAllTypes(
        selectedLocation.locationCode,
        preview?.fileTypes ?? selectedLocation.fileTypes
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const totalFilesProcessed = activeImports.reduce((sum, j) => sum + (j.filesProcessed ?? 0), 0);
  const totalFilesTotal = activeImports.reduce((sum, j) => sum + (j.filesTotal ?? 0), 0);
  const overallProgress = totalFilesTotal > 0
    ? Math.round((totalFilesProcessed / totalFilesTotal) * 100)
    : 0;

  // Check if all unmapped plants have complete mappings selected
  const allUnmappedHaveMappings =
    preview != null &&
    preview.plants
      .filter((p) => !p.mapping)
      .every((p) => plantMappings[p.plantNo]?.parkId && plantMappings[p.plantNo]?.turbineId);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Scan Section */}
      <Card>
        <CardHeader>
          <CardTitle>Ordner scannen</CardTitle>
          <CardDescription>
            Durchsuchen Sie einen Ordner nach Enercon SCADA-Dateien
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="scanPath">Pfad zum SCADA-Ordner</Label>
              <div className="flex gap-2">
                <Input
                  id="scanPath"
                  placeholder={DEFAULT_SCAN_PATH}
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBrowser}
                  aria-label="Ordner durchsuchen"
                  title="Ordner durchsuchen"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button onClick={handleScan} disabled={isScanning || isImporting}>
              {isScanning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderSearch className="h-4 w-4 mr-2" />
              )}
              Ordner scannen
            </Button>
          </div>

          {/* Folder Browser Dialog */}
          <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Ordner auswaehlen</DialogTitle>
                <DialogDescription>
                  Navigieren Sie zum SCADA-Datenverzeichnis
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {/* Current path display */}
                <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md break-all">
                  {browsePath || "Laufwerke"}
                </div>

                {/* Directory listing */}
                <div className="border rounded-md max-h-[320px] overflow-y-auto">
                  {isBrowsing ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Laden...
                    </div>
                  ) : (
                    <div className="divide-y">
                      {/* Parent directory */}
                      {browseParentPath && (
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                          onClick={() => browseTo(browseParentPath)}
                        >
                          <ArrowLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">..</span>
                        </button>
                      )}

                      {browseDirectories.length === 0 && !browseParentPath && (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Keine Verzeichnisse gefunden
                        </div>
                      )}

                      {browseDirectories.map((dir) => (
                        <button
                          key={dir.path}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors group"
                          onClick={() => browseTo(dir.path)}
                        >
                          <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <span className="flex-1 truncate">{dir.name}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBrowseOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleBrowseSelect}
                  disabled={!browsePath}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Auswaehlen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Scan Results List */}
          {scanResults.length > 0 && !selectedLocation && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">
                Gefundene Standorte ({scanResults.length})
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Standort</TableHead>
                      <TableHead className="text-right">Dateien</TableHead>
                      <TableHead>Dateitypen</TableHead>
                      <TableHead>Zeitraum</TableHead>
                      <TableHead className="w-[200px]">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanResults.map((result) => (
                      <TableRow key={result.locationCode}>
                        <TableCell className="font-mono font-medium">
                          {result.locationCode}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {result.fileCount.toLocaleString("de-DE")}
                        </TableCell>
                        <TableCell>
                          {result.fileTypes.length > 0
                            ? result.fileTypes.join(", ")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {result.dateRange
                            ? `${result.dateRange.from} - ${result.dateRange.to}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSelectLocation(result)}
                              disabled={isImporting}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Vorschau
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleDirectImport(result)}
                              disabled={isImporting}
                            >
                              {isImporting ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-2" />
                              )}
                              Import
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Loading */}
      {isLoadingPreview && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Vorschau wird geladen...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2/3: Preview + Mapping */}
      {preview && selectedLocation && !isLoadingPreview && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Standort: {preview.locationCode}
                </CardTitle>
                <CardDescription>
                  {preview.fileCount.toLocaleString("de-DE")} Dateien |{" "}
                  {preview.fileTypes.join(", ")} |{" "}
                  {preview.dateRange
                    ? `${preview.dateRange.from} - ${preview.dateRange.to}`
                    : "Kein Zeitraum"}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleBackToScan}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurueck
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 3a: All Mapped - Confirmation */}
            {preview.allMapped && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md p-4">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm font-medium">
                    Alle {preview.totalPlants} Anlagen sind zugeordnet. Import kann gestartet werden.
                  </p>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr.</TableHead>
                        <TableHead>Wind (m/s)</TableHead>
                        <TableHead>Leistung (W)</TableHead>
                        <TableHead>Park</TableHead>
                        <TableHead>WKA</TableHead>
                        <TableHead className="w-[80px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.plants.map((plant) => (
                        <TableRow key={plant.plantNo}>
                          <TableCell className="font-mono font-medium">
                            {plant.plantNo}
                          </TableCell>
                          <TableCell className="font-mono">
                            {plant.sampleWindSpeed != null
                              ? plant.sampleWindSpeed.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              : "-"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {plant.samplePower != null
                              ? plant.samplePower.toLocaleString("de-DE")
                              : "-"}
                          </TableCell>
                          <TableCell>{plant.mapping?.parkName ?? "-"}</TableCell>
                          <TableCell>{plant.mapping?.turbineDesignation ?? "-"}</TableCell>
                          <TableCell>
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleStartImport}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Import starten
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3b: Not All Mapped - Mapping Section */}
            {!preview.allMapped && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-4">
                  <p className="text-sm font-medium">
                    {preview.unmappedCount} von {preview.totalPlants} Anlagen
                    sind noch nicht zugeordnet
                  </p>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr.</TableHead>
                        <TableHead>Wind (m/s)</TableHead>
                        <TableHead>Leistung (W)</TableHead>
                        <TableHead>Park</TableHead>
                        <TableHead>WKA / Turbine</TableHead>
                        <TableHead className="w-[80px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.plants.map((plant) => {
                        const isMapped = plant.mapping != null;
                        const currentMapping = plantMappings[plant.plantNo];

                        return (
                          <TableRow key={plant.plantNo}>
                            <TableCell className="font-mono font-medium">
                              {plant.plantNo}
                            </TableCell>
                            <TableCell className="font-mono">
                              {plant.sampleWindSpeed != null
                                ? plant.sampleWindSpeed.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                : "-"}
                            </TableCell>
                            <TableCell className="font-mono">
                              {plant.samplePower != null
                                ? plant.samplePower.toLocaleString("de-DE")
                                : "-"}
                            </TableCell>

                            {/* Park column */}
                            <TableCell>
                              {isMapped ? (
                                <span>{plant.mapping!.parkName}</span>
                              ) : (
                                <Select
                                  value={currentMapping?.parkId ?? ""}
                                  onValueChange={(val) =>
                                    handlePlantParkChange(plant.plantNo, val)
                                  }
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Park auswaehlen..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {parksLoading ? (
                                      <SelectItem value="__loading" disabled>
                                        Laden...
                                      </SelectItem>
                                    ) : (
                                      parks?.map((park) => (
                                        <SelectItem key={park.id} value={park.id}>
                                          {park.name}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>

                            {/* Turbine column */}
                            <TableCell>
                              {isMapped ? (
                                <span>{plant.mapping!.turbineDesignation}</span>
                              ) : (
                                <Select
                                  value={currentMapping?.turbineId ?? ""}
                                  onValueChange={(val) =>
                                    handlePlantTurbineChange(plant.plantNo, val)
                                  }
                                  disabled={!currentMapping?.parkId}
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue
                                      placeholder={
                                        !currentMapping?.parkId
                                          ? "Zuerst Park"
                                          : "WKA auswaehlen..."
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {currentMapping?.parkId &&
                                    parkTurbines[currentMapping.parkId] ? (
                                      parkTurbines[currentMapping.parkId].length > 0 ? (
                                        parkTurbines[currentMapping.parkId].map((t) => (
                                          <SelectItem key={t.id} value={t.id}>
                                            {t.designation}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <SelectItem value="__empty" disabled>
                                          Keine Turbinen gefunden
                                        </SelectItem>
                                      )
                                    ) : currentMapping?.parkId ? (
                                      <SelectItem value="__loading" disabled>
                                        Laden...
                                      </SelectItem>
                                    ) : null}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>

                            {/* Status column */}
                            <TableCell>
                              {isMapped ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              ) : currentMapping?.parkId && currentMapping?.turbineId ? (
                                <CheckCircle2 className="h-5 w-5 text-blue-500" />
                              ) : (
                                <span className="text-muted-foreground text-sm">--</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleSaveMappingsOnly}
                    disabled={isSavingMappings || isImporting || !allUnmappedHaveMappings}
                  >
                    {isSavingMappings ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Nur Zuordnungen speichern
                  </Button>
                  <Button
                    onClick={handleSaveMappingsAndImport}
                    disabled={isSavingMappings || isImporting || !allUnmappedHaveMappings}
                  >
                    {isSavingMappings || isImporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Zuordnungen speichern und importieren
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Import Progress */}
      {activeImports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isImporting && (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              )}
              Import-Fortschritt
            </CardTitle>
            <CardDescription>
              Standort: {activeImports[0]?.locationCode} |{" "}
              {activeImports.length} Dateityp(en): {activeImports.map((j) => j.fileType).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overall progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  Gesamt: {totalFilesProcessed.toLocaleString("de-DE")} /{" "}
                  {totalFilesTotal.toLocaleString("de-DE")} Dateien verarbeitet
                </span>
                <span className="font-mono">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-3" />
            </div>

            {/* Per file-type breakdown */}
            <div className="rounded-md border divide-y">
              {activeImports.map((job) => {
                const jobProgress =
                  (job.filesTotal ?? 0) > 0
                    ? Math.round(((job.filesProcessed ?? 0) / job.filesTotal) * 100)
                    : 0;
                return (
                  <div key={job.id} className="flex items-center gap-4 px-4 py-2 text-sm">
                    <span className="font-mono font-medium w-10">{job.fileType}</span>
                    <div className="flex-1">
                      <Progress value={jobProgress} className="h-2" />
                    </div>
                    <span className="font-mono text-xs w-10 text-right">{jobProgress}%</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_BADGE_COLORS[job.status] || ""}`}
                    >
                      {STATUS_LABELS[job.status] || job.status}
                    </Badge>
                    <span className="font-mono text-xs w-20 text-right">
                      {(job.recordsImported ?? 0).toLocaleString("de-DE")} Stz.
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Dateitypen</p>
                <p className="font-mono font-medium">{activeImports.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Importiert (gesamt)</p>
                <p className="font-mono font-medium">
                  {activeImports.reduce((s, j) => s + (j.recordsImported ?? 0), 0).toLocaleString("de-DE")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Uebersprungen</p>
                <p className="font-mono font-medium">
                  {activeImports.reduce((s, j) => s + (j.recordsSkipped ?? 0), 0).toLocaleString("de-DE")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Fehlerhaft</p>
                <p className="font-mono font-medium text-destructive">
                  {activeImports.reduce((s, j) => s + (j.recordsFailed ?? 0), 0).toLocaleString("de-DE")}
                </p>
              </div>
            </div>

            {/* Show errors if any */}
            {activeImports
              .filter((j) => j.error)
              .map((j) => (
                <div
                  key={j.id}
                  className="text-sm text-destructive bg-destructive/10 p-3 rounded-md"
                >
                  <span className="font-mono font-medium">{j.fileType}:</span>{" "}
                  {j.error}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Import-Historie</CardTitle>
              <CardDescription>Die letzten 20 Importe</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${historyLoading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Dateien</TableHead>
                  <TableHead className="text-right">Datensaetze</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dauer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    </TableRow>
                  ))
                ) : importHistory.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Noch keine Importe durchgefuehrt
                    </TableCell>
                  </TableRow>
                ) : (
                  importHistory.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(job.startedAt)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {job.locationCode}
                      </TableCell>
                      <TableCell className="font-mono">{job.fileType}</TableCell>
                      <TableCell className="text-right font-mono">
                        {job.filesProcessed}/{job.filesTotal}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(job.recordsImported ?? 0).toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_COLORS[job.status] || ""}
                        >
                          {STATUS_LABELS[job.status] || job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDuration(job.duration)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Tab: Protokolle (Logs)
// =============================================================================

function LogsTab() {
  const [logs, setLogs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/import?limit=100");
      if (!res.ok) throw new Error("Fehler beim Laden der Protokolle");
      const data = await res.json();
      setLogs(data.data ?? data);
    } catch {
      toast.error("Fehler beim Laden der Protokolle");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Import-Protokolle</CardTitle>
            <CardDescription>
              Detaillierte Protokolle aller SCADA-Importe
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Startzeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Standort</TableHead>
                <TableHead>Dateityp</TableHead>
                <TableHead className="text-right">Dateien</TableHead>
                <TableHead className="text-right">Importiert</TableHead>
                <TableHead className="text-right">Uebersprungen</TableHead>
                <TableHead className="text-right">Fehlerhaft</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Keine Protokolle vorhanden
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(log.startedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_COLORS[log.status] || ""}
                      >
                        {STATUS_LABELS[log.status] || log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {log.locationCode}
                    </TableCell>
                    <TableCell className="font-mono">{log.fileType}</TableCell>
                    <TableCell className="text-right font-mono">
                      {log.filesProcessed}/{log.filesTotal}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.recordsImported}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.recordsSkipped}
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {log.recordsFailed}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Types for Auto-Import
// =============================================================================

interface AutoImportStatusItem {
  mappingId: string;
  locationCode: string;
  autoImportEnabled: boolean;
  autoImportInterval: string;
  autoImportPath: string | null;
  lastAutoImport: string | null;
  lastDataTimestamp: string | null;
  parkName: string;
}

interface AutoImportLogEntry {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  locationId: string | null;
  filesFound: number;
  filesImported: number;
  filesSkipped: number;
  errors: string[] | null;
  summary: string | null;
}

// =============================================================================
// Tab: Auto-Import
// =============================================================================

const INTERVAL_LABELS: Record<string, string> = {
  HOURLY: "Stuendlich",
  DAILY: "Taeglich",
  WEEKLY: "Woechentlich",
};

function AutoImportTab() {
  const [statusItems, setStatusItems] = useState<AutoImportStatusItem[]>([]);
  const [logs, setLogs] = useState<AutoImportLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [togglingLocation, setTogglingLocation] = useState<string | null>(null);

  // Load auto-import status
  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import");
      if (!res.ok) throw new Error("Fehler beim Laden des Auto-Import Status");
      const data = await res.json();
      setStatusItems(data.data ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden des Auto-Import Status",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load auto-import logs
  const loadLogs = useCallback(async () => {
    setIsLogsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import/logs?limit=10");
      if (!res.ok) throw new Error("Fehler beim Laden der Auto-Import Logs");
      const data = await res.json();
      setLogs(data.data ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden der Auto-Import Logs",
      );
    } finally {
      setIsLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, [loadStatus, loadLogs]);

  // Toggle auto-import for a location
  const handleToggle = async (locationCode: string, currentlyEnabled: boolean) => {
    setTogglingLocation(locationCode);
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: currentlyEnabled ? "disable" : "enable",
          locationCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Umschalten");
      }

      toast.success(
        currentlyEnabled
          ? `Auto-Import deaktiviert fuer ${locationCode}`
          : `Auto-Import aktiviert fuer ${locationCode}`,
      );
      loadStatus();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Umschalten",
      );
    } finally {
      setTogglingLocation(null);
    }
  };

  // Change interval for a location
  const handleIntervalChange = async (locationCode: string, interval: string) => {
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          locationCode,
          interval,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Konfigurieren");
      }

      toast.success(`Intervall auf ${INTERVAL_LABELS[interval] || interval} gesetzt`);
      loadStatus();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Konfigurieren",
      );
    }
  };

  // Trigger immediate auto-import
  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-now" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Starten");
      }

      toast.success("Auto-Import wird im Hintergrund gestartet");

      // Reload logs after a delay to show new entry
      setTimeout(() => {
        loadLogs();
        loadStatus();
      }, 3000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Starten",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const enabledCount = statusItems.filter((s) => s.autoImportEnabled).length;

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Auto-Import Konfiguration
              </CardTitle>
              <CardDescription>
                Automatischer Import neuer SCADA-Daten nach Zeitplan.{" "}
                {enabledCount > 0
                  ? `${enabledCount} Standort(e) aktiviert`
                  : "Noch keine Standorte aktiviert"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadStatus();
                  loadLogs();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Aktualisieren
              </Button>
              <Button
                size="sm"
                onClick={handleRunNow}
                disabled={isRunning || enabledCount === 0}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Jetzt importieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statusItems.length === 0 && !isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Keine SCADA-Zuordnungen vorhanden.</p>
              <p className="text-sm mt-1">
                Erstellen Sie zuerst Zuordnungen im Tab &quot;Zuordnungen&quot;.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Standort</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Auto-Import</TableHead>
                    <TableHead>Intervall</TableHead>
                    <TableHead>Letzter Import</TableHead>
                    <TableHead>Letzter Datensatz</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    statusItems.map((item) => (
                      <TableRow key={item.locationCode}>
                        <TableCell className="font-mono font-medium">
                          {item.locationCode}
                        </TableCell>
                        <TableCell>{item.parkName}</TableCell>
                        <TableCell>
                          <Switch
                            checked={item.autoImportEnabled}
                            onCheckedChange={() =>
                              handleToggle(item.locationCode, item.autoImportEnabled)
                            }
                            disabled={togglingLocation === item.locationCode}
                          />
                        </TableCell>
                        <TableCell>
                          {item.autoImportEnabled ? (
                            <Select
                              value={item.autoImportInterval}
                              onValueChange={(val) =>
                                handleIntervalChange(item.locationCode, val)
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="HOURLY">Stuendlich</SelectItem>
                                <SelectItem value="DAILY">Taeglich</SelectItem>
                                <SelectItem value="WEEKLY">Woechentlich</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.lastAutoImport
                            ? formatDateTime(item.lastAutoImport)
                            : "--"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.lastDataTimestamp
                            ? formatDateTime(item.lastDataTimestamp)
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {item.autoImportEnabled ? (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-800 border-green-200"
                            >
                              <Power className="h-3 w-3 mr-1" />
                              Aktiv
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-100 text-gray-600 border-gray-200"
                            >
                              <PowerOff className="h-3 w-3 mr-1" />
                              Inaktiv
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Import Log History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Auto-Import Protokoll</CardTitle>
              <CardDescription>
                Die letzten 10 automatischen Import-Laeufe
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLogs}
              disabled={isLogsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLogsLoading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Startzeit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gefunden</TableHead>
                  <TableHead className="text-right">Importiert</TableHead>
                  <TableHead className="text-right">Uebersprungen</TableHead>
                  <TableHead>Zusammenfassung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLogsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Noch keine automatischen Importe ausgefuehrt
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(log.startedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_COLORS[log.status] || ""}
                        >
                          {STATUS_LABELS[log.status] || log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.filesFound}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.filesImported}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.filesSkipped}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate" title={log.summary || ""}>
                        {log.summary || "--"}
                        {log.errors && Array.isArray(log.errors) && log.errors.length > 0 && (
                          <span className="ml-2 text-destructive">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            {log.errors.length} Fehler
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function ScadaPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="h-6 w-6" />
            SCADA-Import & Verwaltung
          </h1>
          <p className="text-muted-foreground">
            Import und Zuordnung der Enercon SCADA-Messdaten (DBF/WSD/UID)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="mappings">
        <TabsList>
          <TabsTrigger value="mappings">Zuordnungen</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="auto-import">Auto-Import</TabsTrigger>
          <TabsTrigger value="logs">Protokolle</TabsTrigger>
        </TabsList>
        <TabsContent value="mappings" className="mt-4">
          <MappingsTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>
        <TabsContent value="auto-import" className="mt-4">
          <AutoImportTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
