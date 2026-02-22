"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
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

interface ColumnMapping {
  turbineId: string | null;
  turbineName: string | null;
  year: string | null;
  month: string | null;
  remunerationType: string | null;
  production: string | null;
  revenue: string | null;
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
  { id: "validation", title: "Validierung", description: "Daten pruefen" },
  { id: "import", title: "Import", description: "Daten importieren" },
];

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = [
  "year",
  "month",
  "remunerationType",
  "production",
];

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  turbineId: "WKA-ID",
  turbineName: "WKA-Bezeichnung",
  year: "Jahr",
  month: "Monat",
  remunerationType: "Verguetungsart",
  production: "Produktion (kWh)",
  revenue: "Erloes (EUR)",
};

const REMUNERATION_CODES = ["EEG", "DIRECT", "PPA", "SPOT", "OTHER"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
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

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ""));
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

function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    remunerationType: null,
    production: null,
    revenue: null,
  };

  const lowerHeaders = headers.map((h) => h.toLowerCase());

  // Auto-detect based on common column names
  headers.forEach((header, index) => {
    const lower = lowerHeaders[index];

    if (lower.includes("wka") && (lower.includes("id") || lower.includes("nr"))) {
      mapping.turbineId = header;
    } else if (lower.includes("wka") || lower.includes("anlage") || lower.includes("turbine")) {
      if (!mapping.turbineName) mapping.turbineName = header;
    } else if (lower === "jahr" || lower === "year") {
      mapping.year = header;
    } else if (lower === "monat" || lower === "month") {
      mapping.month = header;
    } else if (lower.includes("vergue") || lower.includes("art") || lower.includes("type") || lower.includes("code")) {
      mapping.remunerationType = header;
    } else if (lower.includes("prod") || lower.includes("kwh") || lower.includes("energie") || lower.includes("energy")) {
      mapping.production = header;
    } else if (lower.includes("erl") || lower.includes("eur") || lower.includes("revenue") || lower.includes("betrag")) {
      mapping.revenue = header;
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
    // Check file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("Datei zu gross. Maximale Groesse: 10MB");
      return;
    }

    // Check file type
    const extension = "." + selectedFile.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      toast.error("Ungueltiges Dateiformat. Erlaubt: CSV, XLSX");
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
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
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
            Laden Sie eine Beispiel-CSV herunter, um das erwartete Format zu sehen.
          </span>
          <Button variant="outline" size="sm" asChild className="ml-4 shrink-0">
            <a href="/api/energy/productions/sample-csv" download="einspeisedaten_beispiel.csv">
              <Download className="h-4 w-4 mr-2" />
              Beispiel-CSV
            </a>
          </Button>
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
              {previewData.rows.length} Zeilen gefunden, {previewData.headers.length} Spalten
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

interface ColumnMappingStepProps {
  headers: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
}

function ColumnMappingStep({ headers, mapping, onMappingChange }: ColumnMappingStepProps) {
  const handleFieldChange = (field: keyof ColumnMapping, value: string) => {
    onMappingChange({
      ...mapping,
      [field]: value === "none" ? null : value,
    });
  };

  const isFieldRequired = (field: keyof ColumnMapping) => {
    // Either turbineId or turbineName is required
    if (field === "turbineId" || field === "turbineName") {
      return !mapping.turbineId && !mapping.turbineName;
    }
    return REQUIRED_FIELDS.includes(field);
  };

  const getMappingStatus = () => {
    const hasTurbineIdentifier = mapping.turbineId || mapping.turbineName;
    const hasRequiredFields = REQUIRED_FIELDS.every((f) => mapping[f]);
    return hasTurbineIdentifier && hasRequiredFields;
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Spalten-Zuordnung</AlertTitle>
        <AlertDescription>
          Ordnen Sie die Spalten aus Ihrer Datei den entsprechenden Feldern zu.
          Pflichtfelder sind mit * gekennzeichnet.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feld-Zuordnung</CardTitle>
          <CardDescription>
            WKA-ID oder WKA-Bezeichnung muss zugeordnet werden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(mapping) as (keyof ColumnMapping)[]).map((field) => {
              const isRequired = isFieldRequired(field);
              const isTurbineField = field === "turbineId" || field === "turbineName";
              const hasTurbineMapping = mapping.turbineId || mapping.turbineName;

              return (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>
                    {FIELD_LABELS[field]}
                    {isRequired && <span className="text-destructive ml-1">*</span>}
                    {isTurbineField && hasTurbineMapping && !mapping[field] && (
                      <span className="text-muted-foreground ml-1">(optional)</span>
                    )}
                  </Label>
                  <Select
                    value={mapping[field] || "none"}
                    onValueChange={(value) => handleFieldChange(field, value)}
                  >
                    <SelectTrigger
                      id={field}
                      className={cn(
                        isRequired && !mapping[field] && "border-destructive"
                      )}
                    >
                      <SelectValue placeholder="Spalte auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Nicht zuordnen --</SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
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
  const successCount = validationResults.filter((r) => r.status === "success").length;
  const warningCount = validationResults.filter((r) => r.status === "warning").length;
  const errorCount = validationResults.filter((r) => r.status === "error").length;

  if (isValidating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Validiere Daten...</p>
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
                <p className="text-2xl font-bold text-green-700">{successCount}</p>
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
                <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
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
                onCheckedChange={(checked) => onSkipErrorsChange(checked as boolean)}
              />
              <Label htmlFor="skipErrors" className="cursor-pointer">
                Fehlerhafte Zeilen beim Import ueberspringen ({errorCount} Zeilen)
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
                    <TableCell className="font-mono">{result.rowIndex + 1}</TableCell>
                    <TableCell>
                      {result.status === "success" && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          OK
                        </Badge>
                      )}
                      {result.status === "warning" && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Warnung
                        </Badge>
                      )}
                      {result.status === "error" && (
                        <Badge variant="outline" className="text-red-600 border-red-300">
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

function ImportStep({ isImporting, importProgress, importResult, onRetry }: ImportStepProps) {
  const router = useRouter();

  if (isImporting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium mb-4">Importiere Daten...</p>
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
      <Card className={hasErrors && !hasImported ? "border-red-200" : "border-green-200"}>
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
              <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
              <p className="text-sm text-green-600">Importiert</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{importResult.skipped}</p>
              <p className="text-sm text-amber-600">Uebersprungen</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{importResult.errors}</p>
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
            <Link href="/energy/settlements">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Zu den Netzbetreiber-Daten
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

export default function ProductionDataImportPage() {
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
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    remunerationType: null,
    production: null,
    revenue: null,
  });

  // Step 3: Validation
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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
          setFileError("Die Datei enthaelt keine gueltigen Daten");
          return;
        }

        setParsedData(parsed);
        // Auto-detect column mapping
        const autoMapping = autoDetectMapping(parsed.headers);
        setColumnMapping(autoMapping);
      } else if (extension === "xlsx" || extension === "xls") {
        // For Excel files, we need to use the backend to parse
        // For now, show a message that we'll handle this via API
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
        // Auto-detect column mapping
        const autoMapping = autoDetectMapping(result.headers);
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
      remunerationType: null,
      production: null,
      revenue: null,
    });
  }, []);

  // Validate data
  const validateData = useCallback(async () => {
    if (!parsedData) return;

    setIsValidating(true);
    setValidationResults([]);

    try {
      // Send to backend for validation
      const response = await fetch("/api/energy/productions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          mapping: columnMapping,
          data: parsedData.rows,
        }),
      });

      if (!response.ok) {
        throw new Error("Fehler bei der Validierung");
      }

      const results = await response.json();
      setValidationResults(results.validationResults);
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
            messages.push("Ungueltiges Jahr");
            status = "error";
          }
        }

        if (columnMapping.month) {
          const month = Number(row[columnMapping.month]);
          if (isNaN(month) || month < 1 || month > 12) {
            messages.push("Ungueltiger Monat (1-12)");
            status = "error";
          }
        }

        if (columnMapping.production) {
          const prod = Number(row[columnMapping.production]);
          if (isNaN(prod) || prod < 0) {
            messages.push("Ungueltige Produktionsmenge");
            status = "error";
          } else if (prod > 50000000) {
            messages.push("Sehr hohe Produktionsmenge - bitte pruefen");
            if (status === "success") status = "warning";
          }
        }

        if (columnMapping.remunerationType) {
          const code = String(row[columnMapping.remunerationType]).toUpperCase();
          if (!REMUNERATION_CODES.includes(code)) {
            messages.push(`Unbekannte Verguetungsart: ${code}`);
            if (status === "success") status = "warning";
          }
        }

        return { rowIndex: index, status, messages, data: row };
      });

      setValidationResults(results);
    } finally {
      setIsValidating(false);
    }
  }, [parsedData, columnMapping]);

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
            .map((r) => r.data)
        : parsedData.rows;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch("/api/energy/productions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          mapping: columnMapping,
          data: rowsToImport,
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
        toast.success(`${result.imported} Datensaetze importiert`);
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
  }, [parsedData, columnMapping, skipErrors, validationResults]);

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
      remunerationType: null,
      production: null,
      revenue: null,
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
        const hasTurbineId = columnMapping.turbineId || columnMapping.turbineName;
        const hasRequired = REQUIRED_FIELDS.every((f) => columnMapping[f]);
        return hasTurbineId && hasRequired;
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
      // Moving from mapping to validation - trigger validation
      setCurrentStep(2);
      await validateData();
    } else if (currentStep === 2) {
      // Moving from validation to import - trigger import
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
          Der CSV-Import ist auch direkt ueber die Netzbetreiber-Daten Seite erreichbar.
          <Link href="/energy/settlements" className="underline ml-1 font-medium">
            Zur Uebersicht
          </Link>
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/energy/settlements">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Netzbetreiber-Daten importieren</h1>
          <p className="text-muted-foreground">
            Importieren Sie Abrechnungsdaten von Netzbetreibern und Direktvermarktern
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
          <ColumnMappingStep
            headers={parsedData.headers}
            mapping={columnMapping}
            onMappingChange={setColumnMapping}
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
            Zurueck
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
