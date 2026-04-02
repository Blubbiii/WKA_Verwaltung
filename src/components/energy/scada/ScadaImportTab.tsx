"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
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
  Upload,
  FileUp,
  Info,
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useParks } from "@/hooks/useParks";
import type {
  ScanResult,
  PreviewResult,
  PlantPreview,
  ImportJob,
  UploadEntry,
  UploadLocGroup,
} from "./types";
import {
  STATUS_BADGE_COLORS,
  STATUS_LABELS,
  DEFAULT_SCAN_PATH_FALLBACK,
  formatDuration,
  formatDateTime,
} from "./types";

const SCADA_EXTENSIONS = [
  ".wsd", ".uid",
  ".avr", ".avw", ".avm", ".avy",
  ".ssm", ".swm",
  ".pes", ".pew", ".pet",
  ".wsr", ".wsw", ".wsm", ".wsy",
];

export default function ScadaImportTab() {
  const { parks, isLoading: parksLoading } = useParks();

  // Scan state
  const [scanPath, setScanPath] = useState(DEFAULT_SCAN_PATH_FALLBACK);
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

  // Upload state
  const [uploadEntries, setUploadEntries] = useState<UploadEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Upload mapping dialog state
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingDialogGroup, setMappingDialogGroup] = useState<UploadLocGroup | null>(null);
  const [uploadPreviewPlants, setUploadPreviewPlants] = useState<PlantPreview[]>([]);
  const [isLoadingUploadPreview, setIsLoadingUploadPreview] = useState(false);
  const [uploadPlantMappings, setUploadPlantMappings] = useState<Record<number, { parkId: string; turbineId: string }>>({});
  const [uploadParkTurbines, setUploadParkTurbines] = useState<Record<string, Array<{ id: string; designation: string }>>>({});
  const [isSavingUploadMappings, setIsSavingUploadMappings] = useState(false);

  // Computed: group upload entries by detected Loc code
  const uploadGroups = useMemo((): UploadLocGroup[] => {
    const byLoc = new Map<string, UploadEntry[]>();
    for (const entry of uploadEntries) {
      const key = entry.locCode ?? "unbekannt";
      if (!byLoc.has(key)) byLoc.set(key, []);
      byLoc.get(key)!.push(entry);
    }
    return Array.from(byLoc.entries()).map(([locCode, entries]) => ({
      locCode,
      entries,
      fileTypes: [...new Set(entries.map((e) => e.fileType))],
      fileCount: entries.length,
    }));
  }, [uploadEntries]);

  // Import history
  const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch configured default scan path from server
  useEffect(() => {
    fetch("/api/energy/scada/scan")
      .then((res) => res.json())
      .then((data) => {
        if (data.defaultPath) setScanPath(data.defaultPath);
      })
      .catch(() => {});
  }, []);

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pollingRefs.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // File Upload (supports individual files, folder drops, and folder picker)
  // ---------------------------------------------------------------------------

  const LOC_PATTERN = /Loc_\d+/i;

  // Extract Loc_XXXX from a path string
  const extractLocCode = useCallback((path: string): string | null => {
    const match = path.match(LOC_PATTERN);
    return match ? match[0] : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create UploadEntry from file + path
  const toUploadEntry = useCallback(
    (file: File, relativePath: string): UploadEntry | null => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SCADA_EXTENSIONS.includes("." + ext)) return null;
      return {
        file,
        relativePath,
        locCode: extractLocCode(relativePath),
        fileType: ext.toUpperCase(),
      };
    },
    [extractLocCode]
  );

  // Recursively read all files from a dropped directory entry (preserves path)
  const readEntriesRecursive = useCallback(
    (entry: FileSystemEntry): Promise<Array<{ file: File; path: string }>> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file(
            (file) => resolve([{ file, path: entry.fullPath }]),
            () => resolve([])
          );
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          const allFiles: Array<{ file: File; path: string }> = [];
          const readBatch = () => {
            reader.readEntries(
              async (entries) => {
                if (entries.length === 0) {
                  resolve(allFiles);
                  return;
                }
                for (const e of entries) {
                  const files = await readEntriesRecursive(e);
                  allFiles.push(...files);
                }
                readBatch(); // readEntries returns batches of ~100
              },
              () => resolve(allFiles)
            );
          };
          readBatch();
        } else {
          resolve([]);
        }
      });
    },
    []
  );

  // Add valid SCADA files to upload entries
  const addUploadEntries = useCallback(
    (filesWithPaths: Array<{ file: File; path: string }>) => {
      const entries: UploadEntry[] = [];
      for (const { file, path } of filesWithPaths) {
        const entry = toUploadEntry(file, path);
        if (entry) entries.push(entry);
      }

      if (entries.length === 0) {
        toast.error("Keine gültigen SCADA-Dateien gefunden", {
          description: `${filesWithPaths.length} Datei(en) geprüft — keine mit unterstützter Endung`,
        });
        return;
      }

      setUploadEntries((prev) => [...prev, ...entries]);

      const locs = [...new Set(entries.map((e) => e.locCode).filter(Boolean))];
      if (locs.length === 1) {
        toast.success(`${entries.length} SCADA-Datei(en) — Standort „${locs[0]}" erkannt`);
      } else if (locs.length > 1) {
        toast.success(`${entries.length} SCADA-Datei(en) — ${locs.length} Standorte erkannt`);
      } else {
        toast.success(`${entries.length} SCADA-Datei(en) hinzugefügt`);
      }

      const skipped = filesWithPaths.length - entries.length;
      if (skipped > 0) {
        toast.warning(`${skipped} Datei(en) ignoriert (nicht unterstützt)`);
      }
    },
    [toUploadEntry]
  );

  // Load turbines for a park in upload dialog (cached)
  const loadUploadTurbinesForPark = useCallback(async (parkId: string) => {
    if (uploadParkTurbines[parkId]) return;
    try {
      const res = await fetch(`/api/turbines?parkId=${parkId}&limit=100`);
      if (!res.ok) throw new Error("Fehler beim Laden der Turbinen");
      const data = await res.json();
      const turbines = data.data ?? [];
      setUploadParkTurbines((prev) => ({
        ...prev,
        [parkId]: Array.isArray(turbines) ? turbines : [],
      }));
    } catch {
      toast.error("Fehler beim Laden der Turbinen");
    }
  }, [uploadParkTurbines]);

  const handleUploadPlantParkChange = (plantNo: number, parkId: string) => {
    setUploadPlantMappings((prev) => ({
      ...prev,
      [plantNo]: { parkId, turbineId: "" },
    }));
    if (parkId) loadUploadTurbinesForPark(parkId);
  };

  const handleUploadPlantTurbineChange = (plantNo: number, turbineId: string) => {
    setUploadPlantMappings((prev) => ({
      ...prev,
      [plantNo]: { ...prev[plantNo], turbineId },
    }));
  };

  // Save upload mappings and then start the actual upload+import
  const handleSaveUploadMappingsAndImport = async () => {
    if (!mappingDialogGroup) return;

    const unmappedWithSelections = uploadPreviewPlants.filter(
      (p) => !p.mapping && uploadPlantMappings[p.plantNo]?.parkId && uploadPlantMappings[p.plantNo]?.turbineId,
    );

    if (unmappedWithSelections.length === 0) {
      toast.error("Bitte mindestens eine Zuordnung auswählen");
      return;
    }

    setIsSavingUploadMappings(true);
    try {
      for (const plant of unmappedWithSelections) {
        const mapping = uploadPlantMappings[plant.plantNo];
        const res = await fetch("/api/energy/scada/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationCode: mappingDialogGroup.locCode,
            parkId: mapping.parkId,
            plantNo: plant.plantNo,
            turbineId: mapping.turbineId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error || `Fehler beim Speichern der Zuordnung für Anlage ${plant.plantNo}`,
          );
        }
      }

      toast.success(`${unmappedWithSelections.length} Zuordnung(en) gespeichert`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern der Zuordnungen");
      setIsSavingUploadMappings(false);
      return;
    }

    setIsSavingUploadMappings(false);
    setMappingDialogOpen(false);

    // Now start the actual upload
    const group = mappingDialogGroup;
    setMappingDialogGroup(null);
    setUploadPreviewPlants([]);
    setUploadPlantMappings({});

    setIsUploading(true);
    setActiveImports([]);
    setIsImporting(true);
    pollingRefs.current.forEach((interval) => clearInterval(interval));
    pollingRefs.current.clear();

    try {
      await uploadLocGroup(group);
      setUploadEntries((prev) => prev.filter((e) => (e.locCode ?? "unbekannt") !== group.locCode));
      toast.success(`Upload gestartet: ${group.locCode}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Upload ${group.locCode} fehlgeschlagen`);
    }
    setIsUploading(false);
  };

  // Check if all unmapped plants in upload dialog have selections
  const allUploadUnmappedHaveMappings =
    uploadPreviewPlants.length > 0 &&
    uploadPreviewPlants
      .filter((p) => !p.mapping)
      .every((p) => uploadPlantMappings[p.plantNo]?.parkId && uploadPlantMappings[p.plantNo]?.turbineId);

  // Handle drop (files or folders via DataTransfer)
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) return;

      // Try webkitGetAsEntry for folder support (preserves paths)
      const fsEntries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) fsEntries.push(entry);
      }

      if (fsEntries.length > 0) {
        const allFiles: Array<{ file: File; path: string }> = [];
        for (const entry of fsEntries) {
          const files = await readEntriesRecursive(entry);
          allFiles.push(...files);
        }
        addUploadEntries(allFiles);
        return;
      }

      // Fallback: plain file list (no path info)
      const files = Array.from(e.dataTransfer.files).map((f) => ({
        file: f,
        path: f.name,
      }));
      addUploadEntries(files);
    },
    [readEntriesRecursive, addUploadEntries]
  );

  // Handle file input (single files — no path info)
  const handleFileInput = useCallback(
    (files: FileList) => {
      addUploadEntries(
        Array.from(files).map((f) => ({ file: f, path: f.name }))
      );
    },
    [addUploadEntries]
  );

  // Handle folder input (webkitdirectory — has webkitRelativePath)
  const handleFolderInput = useCallback(
    (files: FileList) => {
      addUploadEntries(
        Array.from(files).map((f) => ({
          file: f,
          path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        }))
      );
    },
    [addUploadEntries]
  );

  // Upload & import one location group
  const uploadLocGroup = useCallback(
    async (group: UploadLocGroup) => {
      const formData = new FormData();
      formData.append("locationCode", group.locCode);
      for (const entry of group.entries) {
        formData.append("files", entry.file);
      }

      const res = await fetch("/api/energy/scada/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.details
          ? `${err.error}: ${err.details}`
          : err.error || `Upload ${group.locCode} fehlgeschlagen`;
        throw new Error(msg);
      }

      const data = await res.json();

      if (data.invalidFiles?.length > 0) {
        toast.warning(`${group.locCode}: ${data.invalidFiles.length} Datei(en) ignoriert`);
      }

      // Start polling for each import job from this location
      for (const imp of data.imports) {
        const job: ImportJob = {
          id: imp.importId,
          status: "RUNNING",
          fileType: imp.fileType,
          locationCode: group.locCode,
          filesTotal: imp.fileCount,
          filesProcessed: 0,
          recordsImported: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          startedAt: new Date().toISOString(),
          completedAt: null,
          duration: null,
          error: null,
        };

        setActiveImports((prev) => [...prev, job]);

        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/energy/scada/import/${imp.importId}`);
            if (!pollRes.ok) return;
            const pollData = await pollRes.json();
            const updatedJob: ImportJob = pollData.data ?? pollData;

            setActiveImports((prev) =>
              prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
            );

            if (
              updatedJob.status === "SUCCESS" ||
              updatedJob.status === "FAILED" ||
              updatedJob.status === "PARTIAL"
            ) {
              const interval = pollingRefs.current.get(imp.importId);
              if (interval) {
                clearInterval(interval);
                pollingRefs.current.delete(imp.importId);
              }
              if (pollingRefs.current.size === 0) {
                setIsImporting(false);
                loadHistory();
              }
            }
          } catch {
            // Ignore polling errors
          }
        }, 2000);

        pollingRefs.current.set(imp.importId, pollInterval);
      }

      return data;
    },
    [loadHistory]
  );

  // Upload all location groups (or a single one)
  // For single groups: first calls preview to check mappings, opens dialog if needed
  const handleStartUpload = useCallback(
    async (singleGroup?: UploadLocGroup) => {
      const groups = singleGroup ? [singleGroup] : uploadGroups;
      const validGroups = groups.filter((g) => g.locCode !== "unbekannt" && g.locCode.startsWith("Loc_"));

      if (validGroups.length === 0) {
        toast.error("Keine Standorte mit gültigem Loc-Code gefunden");
        return;
      }

      // For a single group: check mappings via upload preview first
      if (singleGroup && validGroups.length === 1) {
        const group = validGroups[0];

        // Find one sample file per file type for preview (to discover all PlantNos)
        const previewFilesByType = new Map<string, UploadEntry>();
        for (const entry of group.entries) {
          if ((entry.fileType === "WSD" || entry.fileType === "UID") && !previewFilesByType.has(entry.fileType)) {
            previewFilesByType.set(entry.fileType, entry);
          }
        }
        if (previewFilesByType.size > 0) {
          setIsLoadingUploadPreview(true);
          try {
            const formData = new FormData();
            formData.append("locationCode", group.locCode);
            for (const entry of previewFilesByType.values()) {
              formData.append("files", entry.file);
            }

            const res = await fetch("/api/energy/scada/upload/preview", {
              method: "POST",
              body: formData,
            });

            if (res.ok) {
              const data = await res.json();

              if (!data.allMapped && data.unmappedCount > 0) {
                // Open mapping dialog
                setUploadPreviewPlants(data.plants);
                setMappingDialogGroup(group);
                setUploadPlantMappings({});
                setUploadParkTurbines({});
                setMappingDialogOpen(true);
                setIsLoadingUploadPreview(false);
                return; // Don't proceed with upload yet
              }
            }
          } catch {
            // Preview failed — proceed with upload anyway
          }
          setIsLoadingUploadPreview(false);
        }
      }

      // All mapped (or multi-group) — proceed directly
      setIsUploading(true);
      setActiveImports([]);
      setIsImporting(true);

      // Clear existing polling
      pollingRefs.current.forEach((interval) => clearInterval(interval));
      pollingRefs.current.clear();

      let successCount = 0;
      let failCount = 0;

      for (const group of validGroups) {
        try {
          await uploadLocGroup(group);
          successCount++;
        } catch (err) {
          failCount++;
          toast.error(err instanceof Error ? err.message : `Upload ${group.locCode} fehlgeschlagen`);
        }
      }

      // Remove uploaded entries from state
      if (singleGroup) {
        setUploadEntries((prev) => prev.filter((e) => e.locCode !== singleGroup.locCode));
      } else {
        setUploadEntries([]);
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Upload gestartet: ${successCount} Standort(e)`);
      } else if (successCount > 0) {
        toast.warning(`${successCount} Standort(e) gestartet, ${failCount} fehlgeschlagen`);
      }

      setIsUploading(false);
    },
    [uploadGroups, uploadLocGroup]
  );

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
            err.error || `Fehler beim Speichern der Zuordnung für Anlage ${plant.plantNo}`
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
  // Start import for ALL file types of a location
  // ---------------------------------------------------------------------------
  const startImportAllTypes = async (locationCode: string, fileTypes: string[]) => {
    const types = fileTypes.length > 0 ? fileTypes : ["WSD"];
    setIsImporting(true);
    setActiveImports([]);

    pollingRefs.current.forEach((interval) => clearInterval(interval));
    pollingRefs.current.clear();

    let startedCount = 0;
    let failedToStart = 0;

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
          const _err = await res.json().catch(() => ({}));
          if (res.status === 409) {
            startedCount++;
          } else {
            failedToStart++;
          }
          continue;
        }

        const data = await res.json();
        const job: ImportJob = data.data ?? data;
        startedCount++;

        setActiveImports((prev) => [...prev, job]);

        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/energy/scada/import/${job.id}`);
            if (!pollRes.ok) return;
            const pollData = await pollRes.json();
            const updatedJob: ImportJob = pollData.data ?? pollData;

            setActiveImports((prev) =>
              prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
            );

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
        `Import gestartet: ${startedCount} Dateityp(en) für ${locationCode}`
      );
    }
  };

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
      {/* === Unified SCADA Import Card === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            SCADA-Daten importieren
          </CardTitle>
          <CardDescription>
            Ordner oder Dateien vom PC auswählen, oder einen Server-Pfad scannen — Duplikate werden automatisch übersprungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-3">
              SCADA-Dateien oder Ordner hier ablegen
            </p>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="h-4 w-4 mr-1" />
                Ordner auswählen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => uploadInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4 mr-1" />
                Dateien auswählen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Unterstützt: {SCADA_EXTENSIONS.join(", ")}
            </p>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              accept={SCADA_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFileInput(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              {...{ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFolderInput(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* Grouped upload summary by location */}
          {uploadGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  {uploadEntries.length} Datei(en) — {uploadGroups.length} Standort(e)
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadEntries([])}
                >
                  Alle entfernen
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Standort</TableHead>
                      <TableHead className="text-right">Dateien</TableHead>
                      <TableHead>Dateitypen</TableHead>
                      <TableHead className="w-[180px]">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadGroups.map((group) => (
                      <TableRow key={group.locCode}>
                        <TableCell className="font-mono font-medium">
                          {group.locCode === "unbekannt" ? (
                            <Input
                              placeholder="Loc_XXXX"
                              className="h-8 w-32 font-mono text-xs"
                              onChange={(e) => {
                                const newLoc = e.target.value.trim();
                                if (newLoc) {
                                  setUploadEntries((prev) =>
                                    prev.map((entry) =>
                                      entry.locCode === null
                                        ? { ...entry, locCode: newLoc }
                                        : entry
                                    )
                                  );
                                }
                              }}
                            />
                          ) : (
                            group.locCode
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {group.fileCount.toLocaleString("de-DE")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {group.fileTypes.map((ft) => (
                              <Badge key={ft} variant="outline" className="text-xs">
                                {ft}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleStartUpload(group)}
                              disabled={
                                group.locCode === "unbekannt" ||
                                !group.locCode.startsWith("Loc_") ||
                                isUploading ||
                                isImporting
                              }
                            >
                              {isUploading ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-1" />
                              )}
                              Import
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setUploadEntries((prev) =>
                                  prev.filter((e) => (e.locCode ?? "unbekannt") !== group.locCode)
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Batch upload all button */}
              {uploadGroups.filter((g) => g.locCode !== "unbekannt" && g.locCode.startsWith("Loc_")).length > 1 && (
                <Button
                  onClick={() => handleStartUpload()}
                  disabled={isUploading || isImporting}
                  className="w-full"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Alle Standorte importieren
                </Button>
              )}

              {/* Info badge */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Der Standort-Code wird automatisch aus dem Ordnernamen erkannt (z.B. Loc_5842).
                  Duplikate werden beim Import automatisch übersprungen.
                </span>
              </div>
            </div>
          )}

          {/* Upload Preview Loading */}
          {isLoadingUploadPreview && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Prüfe Zuordnungen...</span>
            </div>
          )}

          {/* Mapping Dialog for Upload */}
          <Dialog open={mappingDialogOpen} onOpenChange={(open) => {
            if (!open) {
              setMappingDialogOpen(false);
              setMappingDialogGroup(null);
              setUploadPreviewPlants([]);
              setUploadPlantMappings({});
            }
          }}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Anlagen zuordnen — {mappingDialogGroup?.locCode}
                </DialogTitle>
                <DialogDescription>
                  {uploadPreviewPlants.filter((p) => !p.mapping).length} von{" "}
                  {uploadPreviewPlants.length} Anlagen sind noch nicht zugeordnet.
                  Bitte ordnen Sie die Anlagen einem Park und einer Turbine zu.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Nr.</TableHead>
                      <TableHead>Wind (m/s)</TableHead>
                      <TableHead>Leistung (W)</TableHead>
                      <TableHead>Park</TableHead>
                      <TableHead>WKA / Turbine</TableHead>
                      <TableHead className="w-[60px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadPreviewPlants.map((plant) => {
                      const isMapped = plant.mapping != null;
                      const currentMapping = uploadPlantMappings[plant.plantNo];

                      return (
                        <TableRow key={plant.plantNo} className={isMapped ? "bg-green-50/50" : ""}>
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
                              <span className="text-green-700">{plant.mapping!.parkName}</span>
                            ) : (
                              <Select
                                value={currentMapping?.parkId ?? ""}
                                onValueChange={(val) => handleUploadPlantParkChange(plant.plantNo, val)}
                              >
                                <SelectTrigger className="w-[160px] h-8">
                                  <SelectValue placeholder="Park..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {parksLoading ? (
                                    <SelectItem value="__loading" disabled>Laden...</SelectItem>
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
                              <span className="text-green-700">{plant.mapping!.turbineDesignation}</span>
                            ) : (
                              <Select
                                value={currentMapping?.turbineId ?? ""}
                                onValueChange={(val) => handleUploadPlantTurbineChange(plant.plantNo, val)}
                                disabled={!currentMapping?.parkId}
                              >
                                <SelectTrigger className="w-[160px] h-8">
                                  <SelectValue
                                    placeholder={!currentMapping?.parkId ? "Zuerst Park" : "WKA..."}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {currentMapping?.parkId && uploadParkTurbines[currentMapping.parkId] ? (
                                    uploadParkTurbines[currentMapping.parkId].length > 0 ? (
                                      uploadParkTurbines[currentMapping.parkId].map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                          {t.designation}
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem value="__empty" disabled>Keine Turbinen</SelectItem>
                                    )
                                  ) : currentMapping?.parkId ? (
                                    <SelectItem value="__loading" disabled>Laden...</SelectItem>
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
                              <AlertCircle className="h-5 w-5 text-amber-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMappingDialogOpen(false);
                    setMappingDialogGroup(null);
                    setUploadPreviewPlants([]);
                    setUploadPlantMappings({});
                  }}
                  disabled={isSavingUploadMappings}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleSaveUploadMappingsAndImport}
                  disabled={isSavingUploadMappings || !allUploadUnmappedHaveMappings}
                >
                  {isSavingUploadMappings ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Speichern & Importieren
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Server path scan (collapsible secondary option) */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
              <FolderSearch className="h-4 w-4" />
              Server-Ordner scannen (für Dateien auf dem Server)
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="pt-3 space-y-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="scanPath">Server-Pfad</Label>
                  <div className="flex gap-2">
                    <Input
                      id="scanPath"
                      placeholder={DEFAULT_SCAN_PATH_FALLBACK || "/data/scada"}
                      value={scanPath}
                      onChange={(e) => setScanPath(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleOpenBrowser}
                      aria-label="Ordner durchsuchen"
                      title="Server-Ordner durchsuchen"
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
                  Scannen
                </Button>
              </div>

              {/* Folder Browser Dialog */}
              <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Server-Ordner auswählen</DialogTitle>
                    <DialogDescription>
                      Navigieren Sie zum SCADA-Datenverzeichnis auf dem Server
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md break-all">
                      {browsePath || "Laufwerke"}
                    </div>
                    <div className="border rounded-md max-h-[320px] overflow-y-auto">
                      {isBrowsing ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          Laden...
                        </div>
                      ) : (
                        <div className="divide-y">
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
                    <Button variant="outline" onClick={() => setBrowseOpen(false)}>
                      Abbrechen
                    </Button>
                    <Button onClick={handleBrowseSelect} disabled={!browsePath}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Auswählen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Server scan results */}
              {scanResults.length > 0 && !selectedLocation && (
                <div>
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
            </div>
          </details>
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
                Zurück
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
                <p className="text-muted-foreground">Übersprungen</p>
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
                      Noch keine Importe durchgeführt
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
