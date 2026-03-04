"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  Play,
  CheckCircle2,
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
import { toast } from "sonner";
import { useParks } from "@/hooks/useParks";
import type { ScadaMapping, ImportJob, Turbine } from "./types";
import {
  STATUS_BADGE_COLORS,
  STATUS_LABELS,
  DEFAULT_SCAN_PATH_FALLBACK,
} from "./types";

export default function ScadaMappingsTab() {
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
      toast.error("Bitte gültige Anlage-Nr. eingeben");
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
            basePath: DEFAULT_SCAN_PATH_FALLBACK,
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
                basePath: DEFAULT_SCAN_PATH_FALLBACK,
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
        `${started} Import(e) gestartet für ${activeLocations.length} Standort(e). Importe laufen im Hintergrund.`
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

                  {/* Gerätetyp */}
                  <div className="space-y-2">
                    <Label htmlFor="deviceType">Gerätetyp *</Label>
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
                <TableHead>Gerät</TableHead>
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
