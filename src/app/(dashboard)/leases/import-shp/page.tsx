"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  FileUp,
  Check,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Users,
  FileText,
  Download,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { useApiQuery } from "@/hooks/useApiQuery";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedFeature {
  id: number;
  geometry: unknown;
  properties: Record<string, unknown>;
  centroid: { lat: number; lng: number } | null;
  areaSqm: number | null;
}

interface PreviewResponse {
  features: ParsedFeature[];
  fields: string[];
  suggestedPlotMapping: Record<string, string | null>;
  suggestedOwnerMapping: Record<string, string | null>;
  warnings: string[];
}

interface ImportResult {
  personsCreated: number;
  personsReused: number;
  plotsCreated: number;
  leasesCreated: number;
  skipped: Array<{
    plotNumber: string;
    cadastralDistrict: string;
    reason: string;
    ownerNames: string;
  }>;
  errors: string[];
}

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface ParksResponse {
  parks: Park[];
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Feld-Mapping" },
  { id: "preview", label: "Vorschau" },
  { id: "owners", label: "Eigentümer" },
  { id: "options", label: "Optionen" },
  { id: "import", label: "Import" },
];

/** Placeholder names that should be auto-skipped */
function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return ["-", "--", "---", ".", "..", "?", "??", "n/a", "k.a.", "unbekannt", "unknown", "n.n.", "nn"].includes(n);
}

// Plot mapping target fields
const PLOT_TARGET_FIELDS = [
  { key: "cadastralDistrict", label: "Gemarkung", required: true },
  { key: "fieldNumber", label: "Flur", required: false },
  { key: "plotNumber", label: "Flurstück (komplett)", required: false },
  { key: "plotNumerator", label: "Flurstück Zähler", required: false },
  { key: "plotDenominator", label: "Flurstück Nenner", required: false },
  { key: "areaSqm", label: "Fläche (m²)", required: false },
  { key: "county", label: "Landkreis", required: false },
  { key: "municipality", label: "Gemeinde", required: false },
];

// Owner mapping target fields
const OWNER_TARGET_FIELDS = [
  { key: "ownerName", label: "Eigentümer (komplett)", required: false },
  { key: "ownerFirstName", label: "Vorname", required: false },
  { key: "ownerLastName", label: "Nachname", required: false },
  { key: "ownerStreet", label: "Straße", required: false },
  { key: "ownerHouseNumber", label: "Hausnummer", required: false },
  { key: "ownerPostalCode", label: "PLZ", required: false },
  { key: "ownerCity", label: "Ort", required: false },
  { key: "ownerCount", label: "Anzahl Eigentümer", required: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportShpPage() {
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [plotMapping, setPlotMapping] = useState<Record<string, string | null>>(
    {}
  );
  const [ownerMapping, setOwnerMapping] = useState<
    Record<string, string | null>
  >({});
  const [selectedParkId, setSelectedParkId] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(
    new Set()
  );
  const [leaseStartDate, setLeaseStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [leaseStatus, setLeaseStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [ownerEdits, setOwnerEdits] = useState<
    Record<string, { name: string; skip: boolean }>
  >({});

  // Load parks for selection
  const { data: parksData } = useApiQuery<ParksResponse>(
    ["parks-import"],
    "/api/parks?limit=100"
  );
  const parks = parksData?.parks ?? [];

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Get a display value from a feature's properties using a mapping */
  function getMappedValue(
    feature: ParsedFeature,
    mapping: Record<string, string | null>,
    key: string
  ): string {
    const field = mapping[key];
    return field ? String(feature.properties[field] ?? "") : "";
  }

  /** Build a preview row from a feature using the current mappings */
  function getFeaturePreview(feature: ParsedFeature) {
    const ownerCountStr = getMappedValue(feature, ownerMapping, "ownerCount");
    const ownerName =
      getMappedValue(feature, ownerMapping, "ownerName") ||
      [
        getMappedValue(feature, ownerMapping, "ownerFirstName"),
        getMappedValue(feature, ownerMapping, "ownerLastName"),
      ]
        .filter(Boolean)
        .join(" ");

    const ownerCount = ownerCountStr ? parseInt(ownerCountStr) : null;
    const isMultiOwner =
      (ownerCount !== null && ownerCount > 1) ||
      /[;]| und | u\. /.test(ownerName);

    return {
      cadastralDistrict: getMappedValue(feature, plotMapping, "cadastralDistrict"),
      fieldNumber: getMappedValue(feature, plotMapping, "fieldNumber") || "0",
      plotNumber: (() => {
          const num = getMappedValue(feature, plotMapping, "plotNumerator")
            || getMappedValue(feature, plotMapping, "plotNumber");
          const den = getMappedValue(feature, plotMapping, "plotDenominator");
          if (!num) return "";
          return den && den !== "0" ? `${num}/${den}` : num;
        })(),
      areaSqm:
        parseFloat(getMappedValue(feature, plotMapping, "areaSqm")) || null,
      ownerName: ownerName || "Unbekannt",
      isMultiOwner,
    };
  }

  /** Get example value for a SHP field from the first feature */
  function getExampleValue(fieldName: string | null): string {
    if (!fieldName || !preview || preview.features.length === 0) return "-";
    const val = preview.features[0].properties[fieldName];
    if (val === null || val === undefined) return "-";
    const str = String(val);
    return str.length > 50 ? str.substring(0, 47) + "..." : str;
  }

  // Compute preview rows and counts
  const previewRows = useMemo(() => {
    if (!preview) return [];
    return preview.features.map((f) => ({
      feature: f,
      ...getFeaturePreview(f),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, plotMapping, ownerMapping]);

  const selectedCount = selectedFeatures.size;
  const multiOwnerCount = previewRows.filter((r) => r.isMultiOwner).length;

  // Compute owner groups for the review step.
  // Groups with the same normalized editedName are MERGED so that editing
  // "Andreas Böse, Andreas" to "Andreas Böse" automatically combines their plots.
  const ownerGroupsForReview = useMemo(() => {
    if (!preview) return [];

    type PlotInfo = { cadastralDistrict: string; fieldNumber: string; plotNumber: string };

    // Step 1: Build raw groups keyed by normalized original owner name
    const rawGroups = new Map<string, { originalName: string; plots: PlotInfo[] }>();

    for (const row of previewRows) {
      if (!selectedFeatures.has(row.feature.id)) continue;

      const name = row.ownerName || "Unbekannt";
      const key = name.trim().replace(/\s+/g, " ").toLowerCase();

      const existing = rawGroups.get(key);
      if (existing) {
        existing.plots.push({
          cadastralDistrict: row.cadastralDistrict,
          fieldNumber: row.fieldNumber,
          plotNumber: row.plotNumber,
        });
      } else {
        rawGroups.set(key, {
          originalName: name,
          plots: [{
            cadastralDistrict: row.cadastralDistrict,
            fieldNumber: row.fieldNumber,
            plotNumber: row.plotNumber,
          }],
        });
      }
    }

    // Step 2: Apply edits per raw group
    const entries = Array.from(rawGroups.entries()).map(([key, data]) => ({
      key,
      originalName: data.originalName,
      editedName: ownerEdits[key]?.name ?? data.originalName,
      skip: ownerEdits[key]?.skip ?? isPlaceholderName(data.originalName),
      plots: data.plots,
    }));

    // Step 3: Merge entries whose normalized editedName matches
    const merged = new Map<string, {
      keys: string[];         // All original keys that map to this merged group
      originalName: string;
      editedName: string;
      skip: boolean;
      plots: PlotInfo[];
    }>();

    for (const entry of entries) {
      const mergeKey = entry.editedName.trim().replace(/\s+/g, " ").toLowerCase();
      const existing = merged.get(mergeKey);
      if (existing) {
        existing.keys.push(entry.key);
        existing.plots = [...existing.plots, ...entry.plots];
        // If any source group is not skipped, the merged one isn't either
        if (!entry.skip) existing.skip = false;
      } else {
        merged.set(mergeKey, {
          keys: [entry.key],
          originalName: entry.originalName,
          editedName: entry.editedName,
          skip: entry.skip,
          plots: [...entry.plots],
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.plots.length - a.plots.length);
  }, [preview, previewRows, selectedFeatures, ownerEdits]);

  // Unique owner count (non-skipped)
  const uniqueOwnerCount = useMemo(() => {
    return ownerGroupsForReview.filter((g) => !g.skip).length;
  }, [ownerGroupsForReview]);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  function canProceed(): boolean {
    switch (step) {
      case 0: // Upload
        return !!preview;
      case 1: // Mapping
        return (
          !!plotMapping.cadastralDistrict &&
          (!!plotMapping.plotNumber || !!plotMapping.plotNumerator)
        );
      case 2: // Preview
        return selectedFeatures.size > 0;
      case 3: // Owners - always allow (skipped owners just get plots without lease)
        return true;
      case 4: // Options
        return !!leaseStartDate;
      case 5: // Import (final)
        return false;
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // API calls
  // -------------------------------------------------------------------------

  /** Bundle individual shapefile components into a ZIP, or return a single ZIP as-is */
  async function prepareUploadFile(fileList: File[]): Promise<File> {
    // Single ZIP file → use directly
    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith(".zip")) {
      return fileList[0];
    }

    // Multiple files or single non-zip → bundle into ZIP (dynamic import to avoid SSR issues)
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      zip.file(f.name, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    return new File([blob], "shapefile.zip", { type: "application/zip" });
  }

  const handleUpload = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setUploading(true);

    try {
      const uploadFile = await prepareUploadFile(fileList);
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("/api/plots/import-shp", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Analyse fehlgeschlagen" }));
        throw new Error(err.error);
      }

      const data: PreviewResponse = await res.json();
      setPreview(data);

      // Pre-populate mappings from server suggestions
      setPlotMapping(data.suggestedPlotMapping ?? {});
      setOwnerMapping(data.suggestedOwnerMapping ?? {});

      // Auto-select non-multi-owner features
      const autoSelected = new Set<number>();
      data.features.forEach((f) => {
        const ownerCountField = data.suggestedOwnerMapping?.ownerCount;
        const ownerNameField = data.suggestedOwnerMapping?.ownerName;
        const ownerCount = ownerCountField
          ? parseInt(String(f.properties[ownerCountField] ?? "0"))
          : null;
        const ownerName = ownerNameField
          ? String(f.properties[ownerNameField] ?? "")
          : "";
        const isMulti =
          (ownerCount !== null && ownerCount > 1) ||
          /[;]| und | u\. /.test(ownerName);

        if (!isMulti) {
          autoSelected.add(f.id);
        }
      });
      setSelectedFeatures(autoSelected);

      toast.success(
        `${data.features.length} Features gefunden, ${autoSelected.size} vorausgewählt`
      );
      setStep(1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analyse fehlgeschlagen"
      );
    } finally {
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Add files and auto-start upload */
  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    if (arr.length === 0) return;
    setFiles((prev) => {
      const combined = [...prev, ...arr];
      return combined;
    });
  }

  // Auto-upload when files change
  useEffect(() => {
    if (files.length > 0 && !uploading && !preview) {
      handleUpload(files);
    }
  }, [files, uploading, preview, handleUpload]);

  async function handleImport() {
    if (!preview) return;
    setImporting(true);

    try {
      const selectedArray = preview.features.filter((f) =>
        selectedFeatures.has(f.id)
      );

      // Build a lookup from feature ID to owner group key
      const featureOwnerKeyMap = new Map<number, string>();
      for (const row of previewRows) {
        const name = row.ownerName || "Unbekannt";
        const key = name.trim().replace(/\s+/g, " ").toLowerCase();
        featureOwnerKeyMap.set(row.feature.id, key);
      }

      const res = await fetch("/api/plots/import-shp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: selectedParkId,
          plotMapping,
          ownerMapping,
          features: selectedArray.map((f) => ({
            index: f.id,
            geometry: f.geometry,
            properties: f.properties,
            centroid: f.centroid,
            areaSqm: f.areaSqm,
            ownerGroupKey: featureOwnerKeyMap.get(f.id) ?? "__no_owner__",
          })),
          // Send overrides for ALL original keys (including merged groups)
          // so the confirm route can apply the correct name to each feature
          ownerOverrides: Object.fromEntries(
            ownerGroupsForReview.flatMap((g) =>
              g.keys.map((k) => [k, { name: g.editedName, skip: g.skip }])
            )
          ),
          leaseDefaults: {
            startDate: leaseStartDate,
            status: leaseStatus,
          },
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Import fehlgeschlagen" }));
        throw new Error(err.error);
      }

      const result: ImportResult = await res.json();
      setImportResult(result);
      toast.success(
        `Import abgeschlossen: ${result.plotsCreated} Flurstücke, ${result.leasesCreated} Verträge`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Import fehlgeschlagen"
      );
    } finally {
      setImporting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 0: Upload
  // -------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  }, []);

  function renderUploadStep() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Shapefile hochladen
          </CardTitle>
          <CardDescription>
            ZIP-Archiv oder einzelne Dateien (.shp, .shx, .dbf) hochladen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Drop Zone - same pattern as turbine-import (proven working) */}
          <Card
            className={cn(
              "border-2 border-dashed transition-colors cursor-pointer",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25",
              files.length > 0 && !uploading && "border-solid border-green-500 bg-green-50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-12">
              {uploading ? (
                <>
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <p className="text-lg font-medium">Wird analysiert...</p>
                  <p className="text-sm text-muted-foreground">
                    Shapefile wird verarbeitet
                  </p>
                </>
              ) : files.length > 0 ? (
                <>
                  <Check className="h-12 w-12 text-green-600 mb-4" />
                  <p className="text-lg font-medium">
                    {files.length} {files.length === 1 ? "Datei" : "Dateien"} ausgewählt
                  </p>
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <p key={i} className="text-sm text-muted-foreground">
                        {f.name} ({(f.size / 1024).toFixed(1)} KB)
                      </p>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                      setPreview(null);
                    }}
                  >
                    Dateien entfernen
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">
                    Datei hierher ziehen oder klicken zum Auswählen
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ZIP-Archiv oder .shp + .shx + .dbf Dateien (max. 50MB)
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Hidden file input - AFTER the drop zone (same as turbine-import) */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".zip,.shp,.dbf,.shx,.prj,.cpg"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Warnings from preview (shown if user goes back to step 0) */}
          {preview && preview.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Step 1: Feld-Mapping
  // -------------------------------------------------------------------------

  function renderMappingStep() {
    if (!preview) return null;

    const fieldOptions = preview.fields;

    function renderMappingTable(
      title: string,
      description: string,
      icon: React.ReactNode,
      targetFields: Array<{ key: string; label: string; required: boolean }>,
      mapping: Record<string, string | null>,
      setMapping: (m: Record<string, string | null>) => void
    ) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Zielfeld</TableHead>
                  <TableHead className="w-[250px]">SHP-Spalte</TableHead>
                  <TableHead>Beispielwert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targetFields.map((field) => (
                  <TableRow key={field.key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.label}</span>
                        {field.required && (
                          <Badge variant="destructive" className="text-xs">
                            Pflicht
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping[field.key] ?? "__none__"}
                        onValueChange={(v) =>
                          setMapping({
                            ...mapping,
                            [field.key]: v === "__none__" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="- Nicht zuordnen -" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            - Nicht zuordnen -
                          </SelectItem>
                          {fieldOptions.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {getExampleValue(mapping[field.key] ?? null)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {/* Park selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Windpark zuordnen
            </CardTitle>
            <CardDescription>
              Alle importierten Flurstücke werden diesem Windpark zugeordnet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>
                Windpark (optional)
              </Label>
              <Select
                value={selectedParkId}
                onValueChange={setSelectedParkId}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Windpark auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                      {park.shortName ? ` (${park.shortName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Plot field mapping */}
        {renderMappingTable(
          "Flurstück-Felder",
          "Ordnen Sie die Shapefile-Spalten den Flurstück-Datenfeldern zu",
          <MapPin className="h-5 w-5" />,
          PLOT_TARGET_FIELDS,
          plotMapping,
          setPlotMapping
        )}

        {/* Owner field mapping */}
        {renderMappingTable(
          "Eigentümer-Felder",
          "Ordnen Sie die Shapefile-Spalten den Eigentümer-Datenfeldern zu",
          <Users className="h-5 w-5" />,
          OWNER_TARGET_FIELDS,
          ownerMapping,
          setOwnerMapping
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Vorschau & Auswahl
  // -------------------------------------------------------------------------

  function renderPreviewStep() {
    if (!preview) return null;

    function toggleFeature(id: number) {
      setSelectedFeatures((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }

    function selectAll() {
      setSelectedFeatures(
        new Set(preview!.features.map((f) => f.id))
      );
    }

    function selectNone() {
      setSelectedFeatures(new Set());
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Vorschau und Auswahl
              </CardTitle>
              <CardDescription className="mt-1">
                {selectedCount} von {previewRows.length} Flurstücke
                ausgewählt
                {multiOwnerCount > 0 && (
                  <span className="text-orange-600">
                    , {multiOwnerCount} mit mehreren Eigentümern
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Alle auswählen
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                Keine auswählen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]" />
                  <TableHead>Gemarkung</TableHead>
                  <TableHead>Flur</TableHead>
                  <TableHead>Flurstück</TableHead>
                  <TableHead className="text-right">Fläche (ha)</TableHead>
                  <TableHead>Eigentümer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => {
                  const isSelected = selectedFeatures.has(row.feature.id);
                  return (
                    <TableRow
                      key={row.feature.id}
                      className={cn(
                        "cursor-pointer",
                        row.isMultiOwner && "bg-orange-50"
                      )}
                      onClick={() => toggleFeature(row.feature.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() =>
                            toggleFeature(row.feature.id)
                          }
                          aria-label={`Flurstück ${row.plotNumber} auswählen`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.cadastralDistrict || "-"}
                      </TableCell>
                      <TableCell>{row.fieldNumber || "-"}</TableCell>
                      <TableCell>{row.plotNumber || "-"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.areaSqm
                          ? (row.areaSqm / 10000).toFixed(2)
                          : "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {row.ownerName}
                      </TableCell>
                      <TableCell>
                        {row.isMultiOwner ? (
                          <Badge
                            variant="outline"
                            className="border-orange-400 text-orange-700 bg-orange-50"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Mehrere Eigentümer
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-green-400 text-green-700 bg-green-50"
                          >
                            <Check className="mr-1 h-3 w-3" />
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {previewRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Keine Flurstücke gefunden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Eigentümer prüfen
  // -------------------------------------------------------------------------

  function renderOwnersStep() {
    const activeOwners = ownerGroupsForReview.filter((g) => !g.skip);
    const skippedOwners = ownerGroupsForReview.filter((g) => g.skip);
    const totalPlots = activeOwners.reduce((sum, g) => sum + g.plots.length, 0);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Eigentümer prüfen
                </CardTitle>
                <CardDescription className="mt-1">
                  {activeOwners.length} Eigentümer mit {totalPlots} Flurstücken
                  werden importiert
                  {skippedOwners.length > 0 && (
                    <span className="text-orange-600">
                      , {skippedOwners.length} übersprungen
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Import</TableHead>
                    <TableHead className="w-[300px]">Eigentümer</TableHead>
                    <TableHead className="text-center">Flurstücke</TableHead>
                    <TableHead>Zugeordnete Flurstücke</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownerGroupsForReview.map((group) => (
                    <TableRow
                      key={group.keys.join("|")}
                      className={cn(
                        group.skip && "opacity-50 bg-muted/30",
                        group.keys.length > 1 && "bg-blue-50/50",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={!group.skip}
                          onCheckedChange={(checked) =>
                            setOwnerEdits((prev) => {
                              const next = { ...prev };
                              for (const k of group.keys) {
                                next[k] = { name: group.editedName, skip: !checked };
                              }
                              return next;
                            })
                          }
                          aria-label={`${group.originalName} importieren`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={group.editedName}
                          onChange={(e) =>
                            setOwnerEdits((prev) => {
                              const next = { ...prev };
                              for (const k of group.keys) {
                                next[k] = { name: e.target.value, skip: group.skip };
                              }
                              return next;
                            })
                          }
                          disabled={group.skip}
                          className={cn(
                            "h-8 text-sm",
                            group.editedName !== group.originalName &&
                              "border-blue-400 bg-blue-50"
                          )}
                        />
                        {group.keys.length > 1 && (
                          <p className="text-xs text-blue-600 mt-1">
                            Zusammengeführt aus {group.keys.length} Varianten
                          </p>
                        )}
                        {group.editedName !== group.originalName && group.keys.length <= 1 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Original: {group.originalName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {group.plots.length}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {group.plots
                          .slice(0, 4)
                          .map(
                            (p) =>
                              `${p.cadastralDistrict} ${p.fieldNumber}/${p.plotNumber}`
                          )
                          .join(", ")}
                        {group.plots.length > 4 && (
                          <span className="ml-1">
                            +{group.plots.length - 4} weitere
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {ownerGroupsForReview.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Keine Eigentümer erkannt
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {skippedOwners.length > 0 && (
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {skippedOwners.length} Eigentümer{" "}
                  {skippedOwners.length === 1 ? "wird" : "werden"} übersprungen
                  (Platzhalter oder manuell deaktiviert). Die zugehörigen
                  Flurstücke werden ohne Pachtvertrag importiert.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Vertragsoptionen
  // -------------------------------------------------------------------------

  function renderOptionsStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Vertragsoptionen
            </CardTitle>
            <CardDescription>
              Standardwerte für die zu erstellenden Pachtverträge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="lease-start">
                  Vertragsbeginn <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lease-start"
                  type="date"
                  value={leaseStartDate}
                  onChange={(e) => setLeaseStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lease-status">Status</Label>
                <Select
                  value={leaseStatus}
                  onValueChange={(v) =>
                    setLeaseStatus(v as "DRAFT" | "ACTIVE")
                  }
                >
                  <SelectTrigger id="lease-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">
                      Entwurf (empfohlen)
                    </SelectItem>
                    <SelectItem value="ACTIVE">Aktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Flächendetails (WEA-Standort, Pool, Kabel, Ausgleich) können
                anschließend pro Vertrag nachgetragen werden.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{uniqueOwnerCount}</p>
                  <p className="text-sm text-muted-foreground">Eigentümer</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <MapPin className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{selectedCount}</p>
                  <p className="text-sm text-muted-foreground">Flurstücke</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{uniqueOwnerCount}</p>
                  <p className="text-sm text-muted-foreground">
                    Pachtverträge
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Import & Ergebnis
  // -------------------------------------------------------------------------

  function renderImportStep() {
    // Before import started
    if (!importResult && !importing) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Import starten
            </CardTitle>
            <CardDescription>
              {selectedCount} Flurstücke werden importiert und
              Pachtverträge erstellt
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-6">
                Möchten Sie den Import jetzt starten? Dieser Vorgang kann
                nicht rückgängig gemacht werden.
              </p>
              <Button size="lg" onClick={handleImport}>
                <Download className="mr-2 h-5 w-5" />
                Importieren
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    // During import
    if (importing) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Import läuft...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={undefined} className="w-full" />
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Daten werden verarbeitet...</span>
            </div>
          </CardContent>
        </Card>
      );
    }

    // After import
    if (importResult) {
      return (
        <div className="space-y-6">
          {/* Success section */}
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Check className="h-5 w-5" />
                Import abgeschlossen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {importResult.personsCreated}
                  </p>
                  <p className="text-sm text-green-600">
                    Eigentümer erstellt
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {importResult.personsReused}
                  </p>
                  <p className="text-sm text-green-600">
                    Vorhandene genutzt
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {importResult.plotsCreated}
                  </p>
                  <p className="text-sm text-green-600">Flurstücke</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {importResult.leasesCreated}
                  </p>
                  <p className="text-sm text-green-600">Verträge</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skipped section */}
          {importResult.skipped.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="h-5 w-5" />
                  Übersprungen ({importResult.skipped.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-auto max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Flurstück</TableHead>
                        <TableHead>Gemarkung</TableHead>
                        <TableHead>Grund</TableHead>
                        <TableHead>Eigentümer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.skipped.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {s.plotNumber}
                          </TableCell>
                          <TableCell>{s.cadastralDistrict}</TableCell>
                          <TableCell>{s.reason}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {s.ownerNames}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors section */}
          {importResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">
                  Fehler während des Imports:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/leases">
                <FileText className="mr-2 h-4 w-4" />
                Verträge öffnen
              </Link>
            </Button>
            {selectedParkId && (
              <Button variant="outline" asChild>
                <Link href={`/parks/${selectedParkId}`}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Park-Karte ansehen
                </Link>
              </Button>
            )}
          </div>
        </div>
      );
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Step content router
  // -------------------------------------------------------------------------

  function renderStepContent() {
    switch (step) {
      case 0:
        return renderUploadStep();
      case 1:
        return renderMappingStep();
      case 2:
        return renderPreviewStep();
      case 3:
        return renderOwnersStep();
      case 4:
        return renderOptionsStep();
      case 5:
        return renderImportStep();
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Step indicator
  // -------------------------------------------------------------------------

  function renderStepIndicator() {
    return (
      <nav aria-label="Import-Fortschritt" className="flex items-center justify-center gap-2">
        {STEPS.map((s, index) => {
          const isActive = index === step;
          const isCompleted = index < step;
          const isClickable = index < step;

          return (
            <div key={s.id} className="flex items-center">
              {/* Step circle + label */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && setStep(index)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                  isActive &&
                    "bg-primary text-primary-foreground",
                  isCompleted &&
                    "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer",
                  !isActive &&
                    !isCompleted &&
                    "text-muted-foreground cursor-default"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                    isActive && "bg-primary-foreground text-primary",
                    isCompleted &&
                      "bg-primary text-primary-foreground",
                    !isActive &&
                      !isCompleted &&
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-8 h-0.5 mx-1",
                    index < step ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </nav>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shapefile Import"
        description="Flurstücke, Eigentümer und Pachtverträge aus Shapefile importieren"
        actions={
          <Button variant="outline" asChild>
            <Link href="/leases">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Link>
          </Button>
        }
      />

      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Step content */}
      <div className="mt-6">{renderStepContent()}</div>

      {/* Navigation buttons (not shown on final step after import) */}
      {!(step === 5 && importResult) && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>

          {step < STEPS.length - 1 && (
            <Button
              onClick={() => setStep((prev) => prev + 1)}
              disabled={!canProceed()}
            >
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
