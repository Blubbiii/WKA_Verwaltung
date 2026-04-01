"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload, Check, AlertTriangle, ArrowLeft, ArrowRight,
  Loader2, MapPin, Users, FileText, Layers, Settings2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
import { IMPORT_LAYER_TYPES, type ImportLayerType } from "@/lib/shapefile/type-detector";

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

interface ParsedLayer {
  name: string;
  geometryType: string;
  featureCount: number;
  fields: string[];
  suggestedType: ImportLayerType;
  features: ParsedFeature[];
  suggestedPlotMapping: Record<string, string | null>;
  suggestedOwnerMapping: Record<string, string | null>;
  warnings: string[];
}

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

// Plot mapping target fields (from existing import wizard)
const PLOT_TARGET_FIELDS = [
  { key: "cadastralDistrict", label: "Gemarkung", required: true },
  { key: "fieldNumber", label: "Flur", required: false },
  { key: "plotNumber", label: "Flurstück (komplett)", required: false },
  { key: "plotNumerator", label: "Flurstück Zähler", required: false },
  { key: "plotDenominator", label: "Flurstück Nenner", required: false },
  { key: "areaSqm", label: "Fläche (m²)", required: false },
];

const OWNER_TARGET_FIELDS = [
  { key: "ownerName", label: "Eigentümer (komplett)", required: false },
  { key: "ownerFirstName", label: "Vorname", required: false },
  { key: "ownerLastName", label: "Nachname", required: false },
  { key: "ownerStreet", label: "Straße", required: false },
  { key: "ownerPostalCode", label: "PLZ", required: false },
  { key: "ownerCity", label: "Ort", required: false },
];

const STEPS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "layers", label: "Layer-Zuordnung", icon: Layers },
  { id: "mapping", label: "Feld-Mapping", icon: Settings2 },
  { id: "preview", label: "Vorschau", icon: MapPin },
  { id: "owners", label: "Eigentümer", icon: Users },
  { id: "options", label: "Optionen", icon: FileText },
  { id: "import", label: "Import", icon: Check },
];

const AREA_TYPE_OPTIONS = [
  { value: "", label: "Kein Flächentyp" },
  { value: "WEA_STANDORT", label: "WEA-Standort" },
  { value: "POOL", label: "Pool" },
  { value: "WEG", label: "Zuwegung" },
  { value: "AUSGLEICH", label: "Ausgleichsfläche" },
  { value: "KABEL", label: "Kabeltrasse" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GisImportPage() {
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Parsed data
  const [layers, setLayers] = useState<ParsedLayer[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Layer type assignments
  const [layerTypes, setLayerTypes] = useState<Record<string, ImportLayerType>>({});
  const [layerAreaTypes, setLayerAreaTypes] = useState<Record<string, string>>({});

  // Field mapping (per plot-type layer)
  const [plotMappings, setPlotMappings] = useState<Record<string, Record<string, string | null>>>({});
  const [ownerMappings, setOwnerMappings] = useState<Record<string, Record<string, string | null>>>({});

  // Options
  const [selectedParkId, setSelectedParkId] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [leaseStatus, setLeaseStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [createLeases, setCreateLeases] = useState(true);

  // Import result
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    plotsCreated: number;
    annotationsCreated: number;
    personsCreated: number;
    personsReused: number;
    leasesCreated: number;
    skipped: { name: string; reason: string }[];
    errors: string[];
  } | null>(null);

  // Load parks
  const { data: parksData } = useApiQuery<{ data: Park[] }>(["parks-gis-import"], "/api/parks?limit=100");
  const parks = parksData?.data ?? [];

  // Plot layers for mapping
  const plotLayers = useMemo(() =>
    layers.filter((l) => {
      const type = layerTypes[l.name] ?? l.suggestedType;
      return type === "PLOT" || type === "WEA_STANDORT";
    }),
  [layers, layerTypes]);

  // -------------------------------------------------------------------------
  // Step 1: Upload
  // -------------------------------------------------------------------------

  const handleUpload = async (fileList: FileList) => {
    const file = fileList[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gis/import/preview", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload fehlgeschlagen");
      }

      const data = await res.json();
      setLayers(data.layers);
      setWarnings(data.warnings || []);
      setFiles([file]);

      // Initialize layer types from suggestions
      const types: Record<string, ImportLayerType> = {};
      const mappings: Record<string, Record<string, string | null>> = {};
      const ownerMaps: Record<string, Record<string, string | null>> = {};
      for (const layer of data.layers) {
        types[layer.name] = layer.suggestedType;
        mappings[layer.name] = layer.suggestedPlotMapping || {};
        ownerMaps[layer.name] = layer.suggestedOwnerMapping || {};
      }
      setLayerTypes(types);
      setPlotMappings(mappings);
      setOwnerMappings(ownerMaps);

      setStep(1);
      toast.success(`${data.layers.length} Layer erkannt`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Hochladen");
    } finally {
      setUploading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 7: Import
  // -------------------------------------------------------------------------

  const handleImport = async () => {
    if (!selectedParkId) {
      toast.error("Bitte einen Park auswählen");
      return;
    }

    setImporting(true);
    try {
      const importLayers = layers.map((l) => {
        const type = layerTypes[l.name] ?? l.suggestedType;
        return {
          name: l.name,
          type,
          features: l.features,
          plotMapping: plotMappings[l.name] || {},
          ownerMapping: ownerMappings[l.name] || {},
          areaType: layerAreaTypes[l.name] || undefined,
        };
      });

      const res = await fetch("/api/gis/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: selectedParkId,
          layers: importLayers,
          leaseStartDate: createLeases ? leaseStartDate : undefined,
          leaseStatus: createLeases ? leaseStatus : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import fehlgeschlagen");
      }

      const result = await res.json();
      setImportResult(result);
      setStep(6);
      toast.success("Import abgeschlossen!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Import");
    } finally {
      setImporting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const totalFeatures = layers.reduce((s, l) => s + l.featureCount, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="QGIS-Projekt importieren"
        description="Shapefiles oder ZIP mit mehreren Layern importieren"
        actions={
          <Button variant="outline" asChild>
            <Link href="/gis"><ArrowLeft className="h-4 w-4 mr-2" />Zurück zur Karte</Link>
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.id} className="flex items-center gap-1">
              {i > 0 && <div className={`w-6 h-px ${isDone ? "bg-primary" : "bg-border"}`} />}
              <button
                onClick={() => isDone && setStep(i)}
                disabled={!isDone}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isDone ? "bg-primary/10 text-primary cursor-pointer" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6">

          {/* ---- Step 0: Upload ---- */}
          {step === 0 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20"
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium">Datei wird analysiert...</p>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Shapefile oder ZIP hierher ziehen</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        .shp, .zip (Multi-Layer), .geojson — max. 50 MB
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2">Datei auswählen</Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".shp,.zip,.geojson,.json"
                      onChange={(e) => e.target.files?.length && handleUpload(e.target.files)}
                    />
                  </label>
                )}
              </div>
              <Alert>
                <Download className="h-4 w-4" />
                <AlertDescription>
                  <strong>Tipp:</strong> In QGIS können Sie Layer als Shapefile exportieren (Rechtsklick → Exportieren → Features speichern als...).
                  Für mehrere Layer: Alle SHP-Dateien in ein ZIP packen.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* ---- Step 1: Layer-Zuordnung ---- */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Layer-Zuordnung ({layers.length} Layer erkannt)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Layer</TableHead>
                    <TableHead>Geometrie</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Flächentyp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {layers.map((l) => {
                    const currentType = layerTypes[l.name] ?? l.suggestedType;
                    const typeInfo = IMPORT_LAYER_TYPES[currentType];
                    const isPlot = typeInfo.isPlot;
                    return (
                      <TableRow key={l.name}>
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{l.geometryType}</Badge>
                        </TableCell>
                        <TableCell>{l.featureCount}</TableCell>
                        <TableCell>
                          <Select
                            value={currentType}
                            onValueChange={(v) => setLayerTypes((prev) => ({ ...prev, [l.name]: v as ImportLayerType }))}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(IMPORT_LAYER_TYPES).map(([key, info]) => (
                                <SelectItem key={key} value={key}>
                                  <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color }} />
                                    {info.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {isPlot && (
                            <Select
                              value={layerAreaTypes[l.name] || ""}
                              onValueChange={(v) => setLayerAreaTypes((prev) => ({ ...prev, [l.name]: v }))}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Optional" />
                              </SelectTrigger>
                              <SelectContent>
                                {AREA_TYPE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {warnings.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{warnings.join(". ")}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ---- Step 2: Feld-Mapping ---- */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="font-semibold">Feld-Mapping für Flurstücke</h3>
              {plotLayers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Flurstück-Layer vorhanden. Weiter zum nächsten Schritt.</p>
              ) : (
                plotLayers.map((l) => (
                  <div key={l.name} className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Layer: {l.name}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {PLOT_TARGET_FIELDS.map((tf) => (
                        <div key={tf.key} className="space-y-1">
                          <Label className="text-xs">{tf.label} {tf.required && "*"}</Label>
                          <Select
                            value={plotMappings[l.name]?.[tf.key] || "__none__"}
                            onValueChange={(v) => setPlotMappings((prev) => ({
                              ...prev,
                              [l.name]: { ...prev[l.name], [tf.key]: v === "__none__" ? null : v },
                            }))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Nicht zuordnen —</SelectItem>
                              {l.fields.map((f) => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <h4 className="text-sm font-medium text-muted-foreground mt-4">Eigentümer-Felder</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {OWNER_TARGET_FIELDS.map((tf) => (
                        <div key={tf.key} className="space-y-1">
                          <Label className="text-xs">{tf.label}</Label>
                          <Select
                            value={ownerMappings[l.name]?.[tf.key] || "__none__"}
                            onValueChange={(v) => setOwnerMappings((prev) => ({
                              ...prev,
                              [l.name]: { ...prev[l.name], [tf.key]: v === "__none__" ? null : v },
                            }))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Nicht zuordnen —</SelectItem>
                              {l.fields.map((f) => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ---- Step 3: Vorschau ---- */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Vorschau — {totalFeatures} Features in {layers.length} Layern</h3>
              {layers.map((l) => {
                const type = layerTypes[l.name] ?? l.suggestedType;
                const typeInfo = IMPORT_LAYER_TYPES[type];
                return (
                  <div key={l.name} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: typeInfo.color }} />
                      <span className="text-sm font-medium">{l.name}</span>
                      <Badge variant="outline">{typeInfo.label}</Badge>
                      <span className="text-xs text-muted-foreground">{l.featureCount} Features</span>
                    </div>
                    {l.features.length > 0 && (
                      <div className="max-h-40 overflow-auto border rounded">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              {l.fields.slice(0, 5).map((f) => (
                                <TableHead key={f} className="text-xs">{f}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {l.features.slice(0, 10).map((f) => (
                              <TableRow key={f.id}>
                                <TableCell className="text-xs">{f.id + 1}</TableCell>
                                {l.fields.slice(0, 5).map((field) => (
                                  <TableCell key={field} className="text-xs truncate max-w-[150px]">
                                    {String(f.properties[field] ?? "")}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {l.features.length > 10 && (
                          <p className="text-xs text-muted-foreground p-2">...und {l.features.length - 10} weitere</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Step 4: Eigentümer (Placeholder) ---- */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Eigentümer-Zuordnung</h3>
              <p className="text-sm text-muted-foreground">
                Eigentümer werden beim Import automatisch per Fuzzy-Matching gegen bestehende Personen geprüft.
                Neue Eigentümer werden automatisch angelegt.
              </p>
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  Die Eigentümer-Zuordnung basiert auf den Feld-Mappings aus Schritt 3.
                  Bestehende Personen werden wiederverwendet, neue werden erstellt.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* ---- Step 5: Optionen ---- */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Import-Optionen</h3>
              <div className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <Label>Park *</Label>
                  <Select value={selectedParkId} onValueChange={setSelectedParkId}>
                    <SelectTrigger><SelectValue placeholder="Park auswählen" /></SelectTrigger>
                    <SelectContent>
                      {parks.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.shortName || p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-leases"
                    checked={createLeases}
                    onCheckedChange={(v) => setCreateLeases(!!v)}
                  />
                  <label htmlFor="create-leases" className="text-sm">Pachtverträge erstellen</label>
                </div>

                {createLeases && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Startdatum</Label>
                      <Input
                        type="date"
                        value={leaseStartDate}
                        onChange={(e) => setLeaseStartDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Status</Label>
                      <Select value={leaseStatus} onValueChange={(v) => setLeaseStatus(v as "DRAFT" | "ACTIVE")}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DRAFT">Entwurf</SelectItem>
                          <SelectItem value="ACTIVE">Aktiv</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <h4 className="text-sm font-semibold mb-2">Zusammenfassung</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {layers.map((l) => {
                      const type = layerTypes[l.name] ?? l.suggestedType;
                      const typeInfo = IMPORT_LAYER_TYPES[type];
                      return (
                        <div key={l.name} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: typeInfo.color }} />
                          <span>{l.featureCount}× {typeInfo.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ---- Step 6: Import Result ---- */}
          {step === 6 && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-full bg-green-500/15 p-3">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Import abgeschlossen</h3>
                  <p className="text-sm text-muted-foreground">Alle Daten wurden erfolgreich importiert.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Flurstücke</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{importResult.plotsCreated}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Zeichnungen</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{importResult.annotationsCreated}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Eigentümer (neu)</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{importResult.personsCreated}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Verträge</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{importResult.leasesCreated}</p></CardContent>
                </Card>
              </div>

              {importResult.skipped.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {importResult.skipped.length} Features übersprungen:
                    <ul className="mt-1 text-xs list-disc pl-4">
                      {importResult.skipped.slice(0, 5).map((s, i) => (
                        <li key={i}>{s.name}: {s.reason}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={() => router.push("/gis")} className="w-full">
                <MapPin className="h-4 w-4 mr-2" />
                Zur GIS-Karte
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      {step < 6 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />Zurück
          </Button>

          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && layers.length === 0}>
              Weiter<ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || !selectedParkId}
              className="gap-2"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {importing ? "Importiert..." : `${totalFeatures} Features importieren`}
            </Button>
          )}
        </div>
      )}

      {/* Import progress */}
      {importing && (
        <Progress value={undefined} className="animate-pulse" />
      )}
    </div>
  );
}
