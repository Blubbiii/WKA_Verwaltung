"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface ParsedRow {
  [key: string]: string | number | null;
}

/**
 * Column mapping for turbine data CSV.
 * Unlike the Netzbetreiber import, this has no remunerationType or revenue
 * columns. Instead it has operatingHours, availability, and notes.
 */
interface TurbineColumnMapping {
  turbineId: string | null;
  turbineName: string | null;
  year: string | null;
  month: string | null;
  production: string | null;
  operatingHours: string | null;
  availability: string | null;
  notes: string | null;
}

interface ValidationResult {
  rowIndex: number;
  status: "success" | "warning" | "error";
  messages: string[];
  data: ParsedRow;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
}

// ============================================================================
// Constants
// ============================================================================

const STEPS = [
  { id: "upload", title: "Datei-Upload", description: "CSV/Excel hochladen" },
  { id: "mapping", title: "Spalten-Mapping", description: "Spalten zuordnen" },
  { id: "validation", title: "Validierung", description: "Daten prüfen" },
  { id: "import", title: "Import", description: "Daten importieren" },
];

const REQUIRED_TURBINE_FIELDS: (keyof TurbineColumnMapping)[] = [
  "year",
  "month",
  "production",
];

const TURBINE_FIELD_LABELS: Record<keyof TurbineColumnMapping, string> = {
  turbineId: "WKA-Nr / ID",
  turbineName: "Anlagenbezeichnung",
  year: "Jahr",
  month: "Monat",
  production: "Produktion (kWh)",
  operatingHours: "Betriebsstunden",
  availability: "Verfügbarkeit (%)",
  notes: "Bemerkungen",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter (comma, semicolon, or tab)
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes(";")) delimiter = ";";
  else if (firstLine.includes("\t")) delimiter = "\t";

  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line
      .split(delimiter)
      .map((v) => v.trim().replace(/^["']|["']$/g, ""));
    if (values.length === headers.length) {
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Try to parse as number
        const numValue = parseFloat(value.replace(",", "."));
        row[header] = isNaN(numValue) ? value : numValue;
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function autoDetectTurbineMapping(headers: string[]): TurbineColumnMapping {
  const mapping: TurbineColumnMapping = {
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    production: null,
    operatingHours: null,
    availability: null,
    notes: null,
  };

  const lowerHeaders = headers.map((h) => h.toLowerCase());

  headers.forEach((header, index) => {
    const lower = lowerHeaders[index];

    if (
      lower.includes("wka") &&
      (lower.includes("id") || lower.includes("nr"))
    ) {
      mapping.turbineId = header;
    } else if (
      lower.includes("anlage") ||
      lower.includes("turbine") ||
      (lower.includes("wka") && !mapping.turbineId)
    ) {
      if (!mapping.turbineName) mapping.turbineName = header;
    } else if (lower === "jahr" || lower === "year") {
      mapping.year = header;
    } else if (lower === "monat" || lower === "month") {
      mapping.month = header;
    } else if (
      lower.includes("prod") ||
      lower.includes("kwh") ||
      lower.includes("energie") ||
      lower.includes("energy")
    ) {
      mapping.production = header;
    } else if (
      lower.includes("betriebsstunden") ||
      lower.includes("stunden") ||
      lower.includes("hours")
    ) {
      mapping.operatingHours = header;
    } else if (
      lower.includes("verfueg") ||
      lower.includes("availability") ||
      lower.includes("pct")
    ) {
      mapping.availability = header;
    } else if (
      lower.includes("bemerk") ||
      lower.includes("notes") ||
      lower.includes("kommentar") ||
      lower.includes("comment")
    ) {
      mapping.notes = header;
    }
  });

  return mapping;
}

// ============================================================================
// Step Components
// ============================================================================

interface FileUploadStepProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  previewData: { headers: string[]; rows: ParsedRow[] } | null;
  error: string | null;
}

function FileUploadStep({
  file,
  onFileSelect,
  onFileRemove,
  previewData,
  error,
}: FileUploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        validateAndSelectFile(droppedFile);
      }
    },
    [onFileSelect]
  );

  const validateAndSelectFile = (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("Datei zu gross. Maximale Größe: 10MB");
      return;
    }

    const extension =
      "." + selectedFile.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      toast.error("Ungültiges Dateiformat. Erlaubt: CSV, XLSX");
      return;
    }

    onFileSelect(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSelectFile(selectedFile);
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25",
          file && "border-solid border-green-500 bg-green-50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          {file ? (
            <>
              <FileSpreadsheet className="h-12 w-12 text-green-600 mb-4" />
              <p className="text-lg font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove();
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Datei entfernen
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                Datei hierher ziehen oder klicken zum Auswaehlen
              </p>
              <p className="text-sm text-muted-foreground">
                Unterstuetzte Formate: CSV, XLSX (max. 10MB)
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Sample CSV Download */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Beispiel-Datei</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            Laden Sie eine Beispiel-CSV herunter, um das erwartete Format für
            Turbinendaten zu sehen.
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="ml-4 shrink-0"
          >
            <a
              href="/api/energy/productions/sample-turbine-csv"
              download="turbinendaten_beispiel.csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Beispiel-CSV
            </a>
          </Button>
        </AlertDescription>
      </Alert>

      {/* Info about difference to Netzbetreiber import */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Hinweis</AlertTitle>
        <AlertDescription>
          Dieser Import ist für Produktionsdaten direkt von den
          Windenergieanlagen (z.B. aus Betreiber-Reports oder SCADA-Exporten).
          Für Abrechnungsdaten von Netzbetreibern nutzen Sie bitte den{" "}
          <Link
            href="/energy/import"
            className="font-medium underline hover:text-primary"
          >
            Netzbetreiber-Import
          </Link>
          .
        </AlertDescription>
      </Alert>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Fehler beim Lesen der Datei</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Preview */}
      {previewData && previewData.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vorschau (erste 5 Zeilen)</CardTitle>
            <CardDescription>
              {previewData.rows.length} Zeilen gefunden,{" "}
              {previewData.headers.length} Spalten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewData.headers.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.rows.slice(0, 5).map((row, index) => (
                    <TableRow key={index}>
                      {previewData.headers.map((header) => (
                        <TableCell key={header} className="whitespace-nowrap">
                          {String(row[header] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface TurbineColumnMappingStepProps {
  headers: string[];
  mapping: TurbineColumnMapping;
  onMappingChange: (mapping: TurbineColumnMapping) => void;
  defaultRevenueType: string;
  onDefaultRevenueTypeChange: (code: string) => void;
  availableRevenueTypes: Array<{ code: string; name: string }>;
}

function TurbineColumnMappingStep({
  headers,
  mapping,
  onMappingChange,
  defaultRevenueType,
  onDefaultRevenueTypeChange,
  availableRevenueTypes,
}: TurbineColumnMappingStepProps) {
  const handleFieldChange = (
    field: keyof TurbineColumnMapping,
    value: string
  ) => {
    onMappingChange({
      ...mapping,
      [field]: value === "none" ? null : value,
    });
  };

  const isFieldRequired = (field: keyof TurbineColumnMapping) => {
    if (field === "turbineId" || field === "turbineName") {
      return !mapping.turbineId && !mapping.turbineName;
    }
    return REQUIRED_TURBINE_FIELDS.includes(field);
  };

  const getMappingStatus = () => {
    const hasTurbineIdentifier = mapping.turbineId || mapping.turbineName;
    const hasRequiredFields = REQUIRED_TURBINE_FIELDS.every((f) => mapping[f]);
    return hasTurbineIdentifier && hasRequiredFields;
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Spalten-Zuordnung (Turbinendaten)</AlertTitle>
        <AlertDescription>
          Ordnen Sie die Spalten aus Ihrer Datei den entsprechenden Feldern zu.
          Pflichtfelder sind mit * gekennzeichnet. Betriebsstunden,
          Verfügbarkeit und Bemerkungen sind optional.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feld-Zuordnung</CardTitle>
          <CardDescription>
            WKA-Nr oder Anlagenbezeichnung muss zugeordnet werden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(mapping) as (keyof TurbineColumnMapping)[]).map(
              (field) => {
                const isRequired = isFieldRequired(field);
                const isTurbineField =
                  field === "turbineId" || field === "turbineName";
                const hasTurbineMapping =
                  mapping.turbineId || mapping.turbineName;

                return (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>
                      {TURBINE_FIELD_LABELS[field]}
                      {isRequired && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                      {isTurbineField &&
                        hasTurbineMapping &&
                        !mapping[field] && (
                          <span className="text-muted-foreground ml-1">
                            (optional)
                          </span>
                        )}
                    </Label>
                    <Select
                      value={mapping[field] || "none"}
                      onValueChange={(value) => handleFieldChange(field, value)}
                    >
                      <SelectTrigger
                        id={field}
                        className={cn(
                          isRequired &&
                            !mapping[field] &&
                            "border-destructive"
                        )}
                      >
                        <SelectValue placeholder="Spalte auswaehlen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          -- Nicht zuordnen --
                        </SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>

      {/* Default Revenue Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vergütungsart</CardTitle>
          <CardDescription>
            Da Turbinendaten keine Vergütungsart enthalten, wird eine
            Standard-Vergütungsart für alle importierten Datensaetze
            verwendet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="defaultRevenueType">
              Standard-Vergütungsart
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select
              value={defaultRevenueType}
              onValueChange={onDefaultRevenueTypeChange}
            >
              <SelectTrigger id="defaultRevenueType">
                <SelectValue placeholder="Vergütungsart waehlen..." />
              </SelectTrigger>
              <SelectContent>
                {availableRevenueTypes.map((rt) => (
                  <SelectItem key={rt.code} value={rt.code}>
                    {rt.name} ({rt.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Mapping Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            {getMappingStatus() ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-green-600 font-medium">
                  Alle Pflichtfelder zugeordnet
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-amber-600 font-medium">
                  Bitte ordnen Sie alle Pflichtfelder zu
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ValidationStepProps {
  validationResults: ValidationResult[];
  skipErrors: boolean;
  onSkipErrorsChange: (skip: boolean) => void;
  isValidating: boolean;
}

function ValidationStep({
  validationResults,
  skipErrors,
  onSkipErrorsChange,
  isValidating,
}: ValidationStepProps) {
  const successCount = validationResults.filter(
    (r) => r.status === "success"
  ).length;
  const warningCount = validationResults.filter(
    (r) => r.status === "warning"
  ).length;
  const errorCount = validationResults.filter(
    (r) => r.status === "error"
  ).length;

  if (isValidating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Validiere Turbinendaten...</p>
          <p className="text-sm text-muted-foreground">
            Dies kann einen Moment dauern
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-700">
                  {successCount}
                </p>
                <p className="text-sm text-green-600">Erfolgreich validiert</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold text-amber-700">
                  {warningCount}
                </p>
                <p className="text-sm text-amber-600">Warnungen</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-700">{errorCount}</p>
                <p className="text-sm text-red-600">Fehler</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skip Errors Option */}
      {errorCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="skipErrors"
                checked={skipErrors}
                onCheckedChange={(checked) =>
                  onSkipErrorsChange(checked as boolean)
                }
              />
              <Label htmlFor="skipErrors" className="cursor-pointer">
                Fehlerhafte Zeilen beim Import überspringen ({errorCount}{" "}
                Zeilen)
              </Label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Validierungsergebnisse</CardTitle>
          <CardDescription>
            Details zu allen {validationResults.length} Zeilen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Zeile</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validationResults.map((result) => (
                  <TableRow
                    key={result.rowIndex}
                    className={cn(
                      result.status === "error" && "bg-red-50",
                      result.status === "warning" && "bg-amber-50"
                    )}
                  >
                    <TableCell className="font-mono">
                      {result.rowIndex + 1}
                    </TableCell>
                    <TableCell>
                      {result.status === "success" && (
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-300"
                        >
                          OK
                        </Badge>
                      )}
                      {result.status === "warning" && (
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300"
                        >
                          Warnung
                        </Badge>
                      )}
                      {result.status === "error" && (
                        <Badge
                          variant="outline"
                          className="text-red-600 border-red-300"
                        >
                          Fehler
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {result.messages.length > 0 ? (
                        <ul className="list-disc list-inside text-sm">
                          {result.messages.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ImportStepProps {
  isImporting: boolean;
  importProgress: number;
  importResult: ImportResult | null;
  onRetry: () => void;
}

function ImportStep({
  isImporting,
  importProgress,
  importResult,
  onRetry,
}: ImportStepProps) {
  const router = useRouter();

  if (isImporting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium mb-4">
            Importiere Turbinendaten...
          </p>
          <div className="w-full max-w-md">
            <Progress value={importProgress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center mt-2">
              {importProgress}% abgeschlossen
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!importResult) {
    return null;
  }

  const hasErrors = importResult.errors > 0;
  const hasImported = importResult.imported > 0;

  return (
    <div className="space-y-6">
      {/* Result Summary */}
      <Card
        className={
          hasErrors && !hasImported ? "border-red-200" : "border-green-200"
        }
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            {hasImported ? (
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            ) : (
              <XCircle className="h-12 w-12 text-red-600" />
            )}
            <div>
              <h3 className="text-xl font-semibold">
                {hasImported ? "Import abgeschlossen" : "Import fehlgeschlagen"}
              </h3>
              <p className="text-muted-foreground">
                {hasImported
                  ? `${importResult.imported} Datensaetze erfolgreich importiert`
                  : "Es konnten keine Daten importiert werden"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">
                {importResult.imported}
              </p>
              <p className="text-sm text-green-600">Importiert</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">
                {importResult.skipped}
              </p>
              <p className="text-sm text-amber-600">Übersprungen</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-700">
                {importResult.errors}
              </p>
              <p className="text-sm text-red-600">Fehler</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      {importResult.details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import-Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {importResult.details.map((detail, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                  {detail}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {hasImported && (
          <Button asChild>
            <Link href="/energy/productions">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Zu den Produktionsdaten
            </Link>
          </Button>
        )}
        <Button variant="outline" onClick={onRetry}>
          <Upload className="h-4 w-4 mr-2" />
          Neuer Import
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function TurbineDataImportPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: File Upload
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    rows: ParsedRow[];
  } | null>(null);

  // Step 2: Column Mapping
  const [columnMapping, setColumnMapping] = useState<TurbineColumnMapping>({
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    production: null,
    operatingHours: null,
    availability: null,
    notes: null,
  });
  const [defaultRevenueType, setDefaultRevenueType] = useState<string>("");
  const [availableRevenueTypes, setAvailableRevenueTypes] = useState<
    Array<{ code: string; name: string }>
  >([]);

  // Step 3: Validation
  const [validationResults, setValidationResults] = useState<
    ValidationResult[]
  >([]);
  const [isValidating, setIsValidating] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Load revenue types on mount
  useEffect(() => {
    async function loadRevenueTypes() {
      try {
        const response = await fetch("/api/admin/revenue-types");
        if (response.ok) {
          const data = await response.json();
          const types = (data.revenueTypes || data || []).map(
            (rt: { code: string; name: string }) => ({
              code: rt.code,
              name: rt.name,
            })
          );
          setAvailableRevenueTypes(types);
          // Auto-select the first one as default if available
          if (types.length > 0 && !defaultRevenueType) {
            setDefaultRevenueType(types[0].code);
          }
        }
      } catch {
        // Fallback defaults
        setAvailableRevenueTypes([
          { code: "EEG", name: "EEG-Vergütung" },
          { code: "DIRECT", name: "Direktvermarktung" },
          { code: "PPA", name: "PPA" },
          { code: "SPOT", name: "Spotmarkt" },
          { code: "OTHER", name: "Sonstige" },
        ]);
        if (!defaultRevenueType) {
          setDefaultRevenueType("EEG");
        }
      }
    }

    loadRevenueTypes();
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setFileError(null);
    setParsedData(null);

    try {
      const extension = selectedFile.name.split(".").pop()?.toLowerCase();

      if (extension === "csv") {
        const text = await selectedFile.text();
        const parsed = parseCSV(text);

        if (parsed.headers.length === 0) {
          setFileError("Die Datei enthaelt keine gültigen Daten");
          return;
        }

        setParsedData(parsed);
        const autoMapping = autoDetectTurbineMapping(parsed.headers);
        setColumnMapping(autoMapping);
      } else if (extension === "xlsx" || extension === "xls") {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("action", "parse");

        const response = await fetch("/api/energy/productions/import", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Fehler beim Parsen der Datei");
        }

        const result = await response.json();
        setParsedData({
          headers: result.headers,
          rows: result.rows,
        });
        const autoMapping = autoDetectTurbineMapping(result.headers);
        setColumnMapping(autoMapping);
      }
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Fehler beim Lesen der Datei"
      );
    }
  }, []);

  const handleFileRemove = useCallback(() => {
    setFile(null);
    setFileError(null);
    setParsedData(null);
    setColumnMapping({
      turbineId: null,
      turbineName: null,
      year: null,
      month: null,
      production: null,
      operatingHours: null,
      availability: null,
      notes: null,
    });
  }, []);

  /**
   * Build the API-compatible column mapping from the turbine-specific mapping.
   * The API expects { turbineId, turbineName, year, month, remunerationType, production, revenue }.
   * Since turbine data has no revenue type column, we set it to null and pass
   * the default revenue type code as a virtual column value injected into each row.
   */
  const buildApiMapping = useCallback(() => {
    return {
      turbineId: columnMapping.turbineId,
      turbineName: columnMapping.turbineName,
      year: columnMapping.year,
      month: columnMapping.month,
      remunerationType: "__default_revenue_type__",
      production: columnMapping.production,
      revenue: null,
    };
  }, [columnMapping]);

  /**
   * Inject the default revenue type code as a virtual column into each data row.
   * This allows the existing API to resolve it correctly.
   */
  const buildApiRows = useCallback(
    (rows: ParsedRow[]): ParsedRow[] => {
      return rows.map((row) => ({
        ...row,
        __default_revenue_type__: defaultRevenueType,
      }));
    },
    [defaultRevenueType]
  );

  // Build notes from optional turbine fields
  const buildNotesForRow = useCallback(
    (row: ParsedRow): string => {
      const parts: string[] = ["[Turbinendaten-Import]"];

      if (columnMapping.operatingHours && row[columnMapping.operatingHours] != null) {
        parts.push(
          `Betriebsstunden: ${row[columnMapping.operatingHours]}`
        );
      }
      if (columnMapping.availability && row[columnMapping.availability] != null) {
        parts.push(
          `Verfügbarkeit: ${row[columnMapping.availability]}%`
        );
      }
      if (columnMapping.notes && row[columnMapping.notes]) {
        parts.push(`${row[columnMapping.notes]}`);
      }

      return parts.join(" | ");
    },
    [columnMapping]
  );

  // Validate data (client-side for turbine-specific fields, plus API validation)
  const validateData = useCallback(async () => {
    if (!parsedData) return;

    setIsValidating(true);
    setValidationResults([]);

    try {
      const apiMapping = buildApiMapping();
      const apiRows = buildApiRows(parsedData.rows);

      const response = await fetch("/api/energy/productions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          mapping: apiMapping,
          data: apiRows,
        }),
      });

      if (!response.ok) {
        throw new Error("Fehler bei der Validierung");
      }

      const results = await response.json();

      // Enrich with turbine-specific validation
      const enrichedResults: ValidationResult[] = (
        results.validationResults as ValidationResult[]
      ).map((result, index) => {
        const row = parsedData.rows[index];
        const additionalMessages: string[] = [];

        // Validate operating hours (optional but if present, should be reasonable)
        if (columnMapping.operatingHours && row[columnMapping.operatingHours] != null) {
          const hours = Number(
            typeof row[columnMapping.operatingHours] === "string"
              ? (row[columnMapping.operatingHours] as string).replace(",", ".")
              : row[columnMapping.operatingHours]
          );
          if (isNaN(hours) || hours < 0) {
            additionalMessages.push("Ungültige Betriebsstunden");
          } else if (hours > 744) {
            additionalMessages.push(
              "Betriebsstunden > 744h (max. pro Monat) - bitte prüfen"
            );
          }
        }

        // Validate availability (optional but if present, should be 0-100)
        if (columnMapping.availability && row[columnMapping.availability] != null) {
          const avail = Number(
            typeof row[columnMapping.availability] === "string"
              ? (row[columnMapping.availability] as string).replace(",", ".")
              : row[columnMapping.availability]
          );
          if (isNaN(avail) || avail < 0 || avail > 100) {
            additionalMessages.push(
              "Ungültige Verfügbarkeit (muss 0-100% sein)"
            );
          }
        }

        if (additionalMessages.length > 0) {
          return {
            ...result,
            status:
              result.status === "error"
                ? "error"
                : ("warning" as const),
            messages: [...result.messages, ...additionalMessages],
          };
        }

        return result;
      });

      setValidationResults(enrichedResults);
    } catch (error) {
      toast.error("Fehler bei der Validierung");
      // Fallback: client-side validation
      const results: ValidationResult[] = parsedData.rows.map((row, index) => {
        const messages: string[] = [];
        let status: "success" | "warning" | "error" = "success";

        // Check required fields
        if (columnMapping.turbineId && !row[columnMapping.turbineId]) {
          if (columnMapping.turbineName && !row[columnMapping.turbineName]) {
            messages.push("WKA-Identifikation fehlt");
            status = "error";
          }
        }

        if (columnMapping.year) {
          const year = Number(row[columnMapping.year]);
          if (isNaN(year) || year < 2000 || year > 2100) {
            messages.push("Ungültiges Jahr");
            status = "error";
          }
        }

        if (columnMapping.month) {
          const month = Number(row[columnMapping.month]);
          if (isNaN(month) || month < 1 || month > 12) {
            messages.push("Ungültiger Monat (1-12)");
            status = "error";
          }
        }

        if (columnMapping.production) {
          const prod = Number(row[columnMapping.production]);
          if (isNaN(prod) || prod < 0) {
            messages.push("Ungültige Produktionsmenge");
            status = "error";
          } else if (prod > 50000000) {
            messages.push("Sehr hohe Produktionsmenge - bitte prüfen");
            if (status === "success") status = "warning";
          }
        }

        if (columnMapping.operatingHours && row[columnMapping.operatingHours] != null) {
          const hours = Number(row[columnMapping.operatingHours]);
          if (isNaN(hours) || hours < 0) {
            messages.push("Ungültige Betriebsstunden");
            if (status === "success") status = "warning";
          } else if (hours > 744) {
            messages.push(
              "Betriebsstunden > 744h (max. pro Monat) - bitte prüfen"
            );
            if (status === "success") status = "warning";
          }
        }

        if (columnMapping.availability && row[columnMapping.availability] != null) {
          const avail = Number(row[columnMapping.availability]);
          if (isNaN(avail) || avail < 0 || avail > 100) {
            messages.push("Ungültige Verfügbarkeit (muss 0-100% sein)");
            if (status === "success") status = "warning";
          }
        }

        return { rowIndex: index, status, messages, data: row };
      });

      setValidationResults(results);
    } finally {
      setIsValidating(false);
    }
  }, [parsedData, columnMapping, buildApiMapping, buildApiRows]);

  // Import data
  const importData = useCallback(async () => {
    if (!parsedData) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      // Filter out error rows if skipErrors is enabled
      const rowsToImport = skipErrors
        ? validationResults
            .filter((r) => r.status !== "error")
            .map((r) => parsedData.rows[r.rowIndex])
        : parsedData.rows;

      const apiMapping = buildApiMapping();
      const apiRows = buildApiRows(rowsToImport);

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch("/api/energy/productions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          mapping: apiMapping,
          data: apiRows,
        }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import fehlgeschlagen");
      }

      const result = await response.json();
      setImportResult(result);

      if (result.imported > 0) {
        toast.success(`${result.imported} Turbinendatensaetze importiert`);
      } else {
        toast.error("Keine Daten importiert");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Import fehlgeschlagen"
      );
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: parsedData.rows.length,
        details: [
          error instanceof Error ? error.message : "Unbekannter Fehler",
        ],
      });
    } finally {
      setIsImporting(false);
    }
  }, [
    parsedData,
    columnMapping,
    skipErrors,
    validationResults,
    buildApiMapping,
    buildApiRows,
  ]);

  // Reset for new import
  const handleRetry = useCallback(() => {
    setCurrentStep(0);
    setFile(null);
    setFileError(null);
    setParsedData(null);
    setColumnMapping({
      turbineId: null,
      turbineName: null,
      year: null,
      month: null,
      production: null,
      operatingHours: null,
      availability: null,
      notes: null,
    });
    setValidationResults([]);
    setSkipErrors(false);
    setImportResult(null);
  }, []);

  // Step navigation
  const canProceed = () => {
    switch (currentStep) {
      case 0: // Upload
        return parsedData !== null && parsedData.rows.length > 0;
      case 1: // Mapping
        const hasTurbineId =
          columnMapping.turbineId || columnMapping.turbineName;
        const hasRequired = REQUIRED_TURBINE_FIELDS.every(
          (f) => columnMapping[f]
        );
        const hasRevenueType = defaultRevenueType.length > 0;
        return hasTurbineId && hasRequired && hasRevenueType;
      case 2: // Validation
        const successCount = validationResults.filter(
          (r) => r.status !== "error"
        ).length;
        return successCount > 0 || skipErrors;
      case 3: // Import
        return importResult !== null;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      setCurrentStep(2);
      await validateData();
    } else if (currentStep === 2) {
      setCurrentStep(3);
      await importData();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  return (
    <div className="space-y-6">
      {/* Notice banner */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          Der CSV-Import ist auch direkt über die Produktionsdaten-Seite erreichbar.
          <Link href="/energy/productions" className="underline ml-1 font-medium">
            Zur Übersicht
          </Link>
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/energy/productions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Produktionsdaten importieren</h1>
          <p className="text-muted-foreground">
            Importieren Sie Produktionsdaten direkt von den Windenergieanlagen
            (z.B. aus Betreiber-Reports)
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={(step) => {
          if (step < currentStep) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Step Content */}
      <StepContent>
        {currentStep === 0 && (
          <FileUploadStep
            file={file}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            previewData={parsedData}
            error={fileError}
          />
        )}

        {currentStep === 1 && parsedData && (
          <TurbineColumnMappingStep
            headers={parsedData.headers}
            mapping={columnMapping}
            onMappingChange={setColumnMapping}
            defaultRevenueType={defaultRevenueType}
            onDefaultRevenueTypeChange={setDefaultRevenueType}
            availableRevenueTypes={availableRevenueTypes}
          />
        )}

        {currentStep === 2 && (
          <ValidationStep
            validationResults={validationResults}
            skipErrors={skipErrors}
            onSkipErrorsChange={setSkipErrors}
            isValidating={isValidating}
          />
        )}

        {currentStep === 3 && (
          <ImportStep
            isImporting={isImporting}
            importProgress={importProgress}
            importResult={importResult}
            onRetry={handleRetry}
          />
        )}
      </StepContent>

      {/* Step Actions */}
      {currentStep < 3 && (
        <StepActions>
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isValidating || isImporting}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || isValidating || isImporting}
          >
            {currentStep === 2 ? (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import starten
              </>
            ) : (
              <>
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </StepActions>
      )}
    </div>
  );
}
