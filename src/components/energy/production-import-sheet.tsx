'use client'

import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Trash2,
} from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Stepper } from '@/components/ui/stepper'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductionImportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface ColumnMapping {
  turbineId: string | null
  turbineName: string | null
  year: string | null
  month: string | null
  production: string | null
  operatingHours: string | null
  availability: string | null
}

interface ParsedRow {
  [key: string]: string | number | null | undefined
}

interface ValidationResult {
  rowIndex: number
  status: 'success' | 'warning' | 'error'
  messages: string[]
  data: Record<string, unknown>
}

interface ImportResult {
  imported: number
  skipped: number
  errors: number
  details: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIZARD_STEPS = [
  { id: 'upload', title: 'Hochladen', description: 'CSV/Excel-Datei' },
  { id: 'mapping', title: 'Zuordnung', description: 'Spalten zuordnen' },
  { id: 'preview', title: 'Vorschau', description: 'Daten prüfen' },
  { id: 'import', title: 'Import', description: 'Daten importieren' },
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, maerz: 3, march: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  jan: 1, feb: 2, mrz: 3, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
}

/**
 * Common column name patterns for auto-detection.
 */
const COLUMN_PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  turbineId: /^(wka[_-]?id|turbine[_-]?id|anlagen?[_-]?id|id)$/i,
  turbineName: /^(wka[_-]?(name|bez)|turbine[_-]?(name|bez)|anlagen?[_-]?(name|bez)|bezeichnung|name|anlage|wka|wea)$/i,
  year: /^(jahr|year|j)$/i,
  month: /^(monat|month|m)$/i,
  production: /^(produktion[_-]?kwh|production[_-]?kwh|produktion|production|kwh|erzeugung|strom[_-]?kwh|einspeisung[_-]?kwh)$/i,
  operatingHours: /^(betriebsstunden|betriebs[_-]?std|operating[_-]?hours|bh|laufstunden|std)$/i,
  availability: /^(verfügbarkeit[_-]?pct|verfügbarkeit|availability|verf[_-]?%|verf|avail)$/i,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a number that might use German format (1.234,56) */
function parseGermanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return isNaN(value) ? null : value
  const str = String(value).trim()
  if (str === '') return null

  // German format with dots as thousands separators and comma as decimal
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    const cleaned = str.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
  }

  // Comma-only decimal: "1234,56"
  if (/^\d+(,\d+)?$/.test(str)) {
    const cleaned = str.replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
  }

  // Standard number
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

/** Try to parse a month value (number 1-12, or German month name) */
function parseMonth(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!isNaN(num) && num >= 1 && num <= 12) return Math.floor(num)
  const str = String(value).toLowerCase().trim()
  return GERMAN_MONTHS[str] ?? null
}

/** Try to auto-detect column mappings from header names */
function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    production: null,
    operatingHours: null,
    availability: null,
  }

  for (const header of headers) {
    const trimmed = header.trim()
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(trimmed) && mapping[field as keyof ColumnMapping] === null) {
        mapping[field as keyof ColumnMapping] = header
        break
      }
    }
  }

  return mapping
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionImportSheet({
  open,
  onOpenChange,
  onSuccess,
}: ProductionImportSheetProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(0)

  // Step 1: Upload
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawData, setRawData] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2: Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    turbineId: null,
    turbineName: null,
    year: null,
    month: null,
    production: null,
    operatingHours: null,
    availability: null,
  })

  // Step 3: Preview / Validation
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isValidating, setIsValidating] = useState(false)

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importProgress, setImportProgress] = useState(0)

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  const resetAll = useCallback(() => {
    setCurrentStep(0)
    setFile(null)
    setHeaders([])
    setRawData([])
    setParseError(null)
    setIsParsing(false)
    setMapping({
      turbineId: null,
      turbineName: null,
      year: null,
      month: null,
      production: null,
      operatingHours: null,
      availability: null,
    })
    setValidationResults([])
    setIsValidating(false)
    setIsImporting(false)
    setImportResult(null)
    setImportProgress(0)
  }, [])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetAll()
      }
      onOpenChange(newOpen)
    },
    [onOpenChange, resetAll]
  )

  // -------------------------------------------------------------------------
  // Step 1: File parsing
  // -------------------------------------------------------------------------
  const parseFile = useCallback(async (selectedFile: File) => {
    setIsParsing(true)
    setParseError(null)

    try {
      if (selectedFile.size > MAX_FILE_SIZE) {
        throw new Error('Datei ist größer als 10 MB. Bitte eine kleinere Datei verwenden.')
      }

      const data = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })

      if (workbook.SheetNames.length === 0) {
        throw new Error('Die Datei enthaelt keine Tabellenblaetter.')
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
        defval: '',
        raw: false,
      })

      if (jsonData.length === 0) {
        throw new Error('Die Datei enthaelt keine Daten.')
      }

      if (jsonData.length > 5000) {
        throw new Error(
          `Die Datei enthaelt ${jsonData.length} Zeilen. Maximal 5.000 Zeilen sind erlaubt.`
        )
      }

      const detectedHeaders = Object.keys(jsonData[0])
      setHeaders(detectedHeaders)
      setRawData(jsonData)
      setFile(selectedFile)

      // Auto-detect column mappings
      const detectedMapping = autoDetectMapping(detectedHeaders)
      setMapping(detectedMapping)

      // Advance to mapping step
      setCurrentStep(1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Lesen der Datei'
      setParseError(message)
      toast.error('Fehler beim Lesen der Datei', { description: message })
    } finally {
      setIsParsing(false)
    }
  }, [])

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        parseFile(droppedFile)
      }
    },
    [parseFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        parseFile(selectedFile)
      }
    },
    [parseFile]
  )

  // -------------------------------------------------------------------------
  // Step 2: Mapping helpers
  // -------------------------------------------------------------------------
  const updateMapping = useCallback(
    (field: keyof ColumnMapping, value: string) => {
      setMapping((prev) => ({
        ...prev,
        [field]: value === '__none__' ? null : value,
      }))
    },
    []
  )

  const isMappingValid =
    (mapping.turbineId !== null || mapping.turbineName !== null) &&
    mapping.year !== null &&
    mapping.month !== null &&
    mapping.production !== null

  // -------------------------------------------------------------------------
  // Step 3: Validation
  // -------------------------------------------------------------------------
  const runValidation = useCallback(() => {
    setIsValidating(true)
    setValidationResults([])

    try {
      const results: ValidationResult[] = rawData.map((row, idx) => {
        const messages: string[] = []
        let status: 'success' | 'warning' | 'error' = 'success'

        // Turbine identifier
        const turbineId = mapping.turbineId ? String(row[mapping.turbineId] ?? '').trim() : ''
        const turbineName = mapping.turbineName
          ? String(row[mapping.turbineName] ?? '').trim()
          : ''
        if (!turbineId && !turbineName) {
          messages.push('Keine Anlagenkennung vorhanden')
          status = 'error'
        }

        // Year
        const year = mapping.year ? Number(row[mapping.year]) : NaN
        if (isNaN(year) || year < 2000 || year > 2100) {
          messages.push(`Ungültiges Jahr: ${mapping.year ? row[mapping.year] : '(leer)'}`)
          status = 'error'
        }

        // Month
        const month = mapping.month ? parseMonth(row[mapping.month]) : null
        if (month === null) {
          messages.push(`Ungültiger Monat: ${mapping.month ? row[mapping.month] : '(leer)'}`)
          status = 'error'
        }

        // Production
        const production = mapping.production
          ? parseGermanNumber(row[mapping.production])
          : null
        if (production === null || production < 0) {
          messages.push(
            `Ungültige Produktion: ${mapping.production ? row[mapping.production] : '(leer)'}`
          )
          status = 'error'
        } else if (production > 50_000_000) {
          messages.push('Sehr hohe Produktionsmenge - bitte prüfen')
          if (status === 'success') status = 'warning'
        }

        // Operating hours (optional)
        if (mapping.operatingHours) {
          const hours = parseGermanNumber(row[mapping.operatingHours])
          if (hours !== null && (hours < 0 || hours > 744)) {
            messages.push(
              `Betriebsstunden ausserhalb 0-744: ${row[mapping.operatingHours]}`
            )
            if (status === 'success') status = 'warning'
          }
        }

        // Availability (optional)
        if (mapping.availability) {
          const avail = parseGermanNumber(row[mapping.availability])
          if (avail !== null && (avail < 0 || avail > 100)) {
            messages.push(
              `Verfügbarkeit ausserhalb 0-100: ${row[mapping.availability]}`
            )
            if (status === 'success') status = 'warning'
          }
        }

        if (status === 'success') {
          messages.push('OK')
        }

        return { rowIndex: idx, status, messages, data: row as Record<string, unknown> }
      })

      setValidationResults(results)
    } catch {
      toast.error('Fehler bei der Validierung')
    } finally {
      setIsValidating(false)
    }
  }, [rawData, mapping])

  const validCount = validationResults.filter((r) => r.status === 'success').length
  const warningCount = validationResults.filter((r) => r.status === 'warning').length
  const errorCount = validationResults.filter((r) => r.status === 'error').length

  // -------------------------------------------------------------------------
  // Step 4: Import execution
  // -------------------------------------------------------------------------
  const executeImport = useCallback(async () => {
    setIsImporting(true)
    setImportProgress(10)

    try {
      // The existing API endpoint supports a wizard format:
      // { action: "import", mapping: {...}, data: [...] }
      // However it expects remunerationType in the mapping.
      // For pure production import we pass null for revenue fields.
      const importMapping = {
        turbineId: mapping.turbineId,
        turbineName: mapping.turbineName,
        year: mapping.year,
        month: mapping.month,
        remunerationType: null,
        production: mapping.production,
        revenue: null,
      }

      // Prepare data: convert German numbers on client side
      const preparedData = rawData.map((row) => {
        const prepared: Record<string, unknown> = { ...row }

        if (mapping.production && row[mapping.production] !== undefined) {
          const val = parseGermanNumber(row[mapping.production])
          if (val !== null) prepared[mapping.production] = val
        }

        if (mapping.month && row[mapping.month] !== undefined) {
          const monthVal = parseMonth(row[mapping.month])
          if (monthVal !== null) prepared[mapping.month] = monthVal
        }

        if (mapping.operatingHours && row[mapping.operatingHours] !== undefined) {
          const val = parseGermanNumber(row[mapping.operatingHours])
          if (val !== null) prepared[mapping.operatingHours] = val
        }

        if (mapping.availability && row[mapping.availability] !== undefined) {
          const val = parseGermanNumber(row[mapping.availability])
          if (val !== null) prepared[mapping.availability] = val
        }

        return prepared
      })

      setImportProgress(30)

      const response = await fetch('/api/energy/productions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          mapping: importMapping,
          data: preparedData,
        }),
      })

      setImportProgress(80)

      const result = await response.json()

      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || 'Import fehlgeschlagen')
      }

      setImportResult({
        imported: result.imported ?? 0,
        skipped: result.skipped ?? 0,
        errors: result.errors ?? 0,
        details: result.details ?? [],
      })

      setImportProgress(100)

      if ((result.imported ?? 0) > 0) {
        toast.success('Import erfolgreich', {
          description: `${result.imported} Datensaetze importiert`,
        })
        onSuccess()
      } else if ((result.errors ?? 0) > 0) {
        toast.warning('Import mit Fehlern abgeschlossen', {
          description: `${result.errors} Fehler aufgetreten`,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error('Import fehlgeschlagen', { description: message })
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: rawData.length,
        details: [message],
      })
    } finally {
      setIsImporting(false)
    }
  }, [rawData, mapping, onSuccess])

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return file !== null && rawData.length > 0
      case 1:
        return isMappingValid
      case 2:
        return validationResults.length > 0 && validCount + warningCount > 0
      default:
        return false
    }
  }

  const handleNext = () => {
    if (currentStep === 1) {
      setCurrentStep(2)
      setTimeout(() => runValidation(), 0)
    } else if (currentStep === 2) {
      setCurrentStep(3)
      setTimeout(() => executeImport(), 0)
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1))
    }
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  // -------------------------------------------------------------------------
  // Render: Step 1 - Upload
  // -------------------------------------------------------------------------
  const renderUploadStep = () => (
    <div className="flex-1 flex flex-col items-center justify-center py-8">
      {!file ? (
        <div
          className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          aria-label="Datei hochladen per Klick oder Drag and Drop"
        >
          {isParsing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Datei wird gelesen...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-base font-medium">
                  CSV- oder Excel-Datei hierher ziehen
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  oder klicken zum Auswaehlen (max. 10 MB)
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">.csv</Badge>
                <Badge variant="secondary">.xlsx</Badge>
                <Badge variant="secondary">.xls</Badge>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
            aria-label="Datei auswaehlen"
          />
        </div>
      ) : (
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
            <FileSpreadsheet className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {rawData.length} Zeilen, {headers.length} Spalten
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                resetAll()
              }}
              aria-label="Datei entfernen"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">Erkannte Spalten:</p>
            <div className="flex flex-wrap gap-1">
              {headers.map((h) => (
                <Badge key={h} variant="outline" className="text-xs">
                  {h}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {parseError && (
        <div className="mt-4 w-full rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{parseError}</p>
          </div>
        </div>
      )}
    </div>
  )

  // -------------------------------------------------------------------------
  // Render: Step 2 - Mapping
  // -------------------------------------------------------------------------
  const renderMappingStep = () => {
    const fields: Array<{
      key: keyof ColumnMapping
      label: string
      required: boolean
      description: string
    }> = [
      {
        key: 'turbineId',
        label: 'WKA-ID',
        required: false,
        description: 'UUID oder Kennung der Anlage',
      },
      {
        key: 'turbineName',
        label: 'WKA-Name/Bezeichnung',
        required: false,
        description: 'Name oder Bezeichnung der Anlage',
      },
      {
        key: 'year',
        label: 'Jahr',
        required: true,
        description: 'Produktionsjahr (z.B. 2024)',
      },
      {
        key: 'month',
        label: 'Monat',
        required: true,
        description: 'Produktionsmonat (1-12 oder Name)',
      },
      {
        key: 'production',
        label: 'Produktion kWh',
        required: true,
        description: 'Produzierte Energie in kWh',
      },
      {
        key: 'operatingHours',
        label: 'Betriebsstunden',
        required: false,
        description: 'Betriebsstunden im Monat (optional)',
      },
      {
        key: 'availability',
        label: 'Verfügbarkeit %',
        required: false,
        description: 'Technische Verfügbarkeit 0-100 (optional)',
      },
    ]

    return (
      <div className="flex-1 overflow-y-auto py-4">
        <p className="text-sm text-muted-foreground mb-4">
          Ordnen Sie die Spalten Ihrer Datei den entsprechenden Feldern zu. Mindestens
          WKA-ID oder WKA-Name, Jahr, Monat und Produktion muessen zugeordnet werden.
        </p>

        <div className="space-y-4">
          {fields.map(({ key, label, required, description }) => (
            <div key={key} className="grid grid-cols-[1fr,1fr] gap-4 items-center">
              <div>
                <Label className="flex items-center gap-1">
                  {label}
                  {required && <span className="text-destructive">*</span>}
                </Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Select
                value={mapping[key] ?? '__none__'}
                onValueChange={(v) => updateMapping(key, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Spalte waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {!isMappingValid && (
          <div className="mt-4 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Bitte ordnen Sie mindestens WKA-ID oder WKA-Name, Jahr, Monat und
                Produktion zu.
              </p>
            </div>
          </div>
        )}

        {/* Quick preview */}
        {rawData.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium mb-2">Vorschau der ersten 3 Zeilen:</p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawData.slice(0, 3).map((row, idx) => (
                    <TableRow key={idx}>
                      {headers.map((h) => (
                        <TableCell key={h} className="text-xs py-2 whitespace-nowrap">
                          {String(row[h] ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Step 3 - Preview / Validation
  // -------------------------------------------------------------------------
  const renderPreviewStep = () => {
    if (isValidating) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Daten werden validiert...</p>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-hidden flex flex-col py-4">
        {/* Summary */}
        <div className="flex gap-3 mb-4 flex-shrink-0 flex-wrap">
          <Badge variant="default" className="bg-green-600 hover:bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {validCount} gültig
          </Badge>
          {warningCount > 0 && (
            <Badge variant="secondary" className="bg-yellow-500 text-white hover:bg-yellow-500">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {warningCount} Warnungen
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {errorCount} Fehler
            </Badge>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {rawData.length} Zeilen gesamt
          </span>
        </div>

        {/* Validation table */}
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead className="w-16 text-xs">Status</TableHead>
                <TableHead className="text-xs">Anlage</TableHead>
                <TableHead className="text-xs">Zeitraum</TableHead>
                <TableHead className="text-xs text-right">Produktion kWh</TableHead>
                <TableHead className="text-xs">Hinweise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationResults.slice(0, 100).map((result) => {
                const row = result.data
                const turbineVal =
                  (mapping.turbineName && row[mapping.turbineName]) ||
                  (mapping.turbineId && row[mapping.turbineId]) ||
                  '-'
                const yearVal = mapping.year ? row[mapping.year] : '-'
                const monthVal = mapping.month ? row[mapping.month] : '-'
                const prodVal = mapping.production ? row[mapping.production] : '-'

                return (
                  <TableRow
                    key={result.rowIndex}
                    className={
                      result.status === 'error'
                        ? 'bg-destructive/5'
                        : result.status === 'warning'
                          ? 'bg-yellow-50 dark:bg-yellow-950/10'
                          : ''
                    }
                  >
                    <TableCell className="text-xs text-muted-foreground py-2">
                      {result.rowIndex + 1}
                    </TableCell>
                    <TableCell className="py-2">
                      {result.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {result.status === 'warning' && (
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      )}
                      {result.status === 'error' && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs py-2 max-w-[120px] truncate">
                      {String(turbineVal)}
                    </TableCell>
                    <TableCell className="text-xs py-2 whitespace-nowrap">
                      {String(monthVal)}/{String(yearVal)}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-right font-mono">
                      {String(prodVal)}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground max-w-[200px] truncate">
                      {result.messages.join('; ')}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {validationResults.length > 100 && (
          <p className="text-xs text-muted-foreground mt-2 flex-shrink-0">
            Zeige 100 von {validationResults.length} Zeilen. Fehlerhafte Zeilen werden
            beim Import übersprungen.
          </p>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Step 4 - Import result
  // -------------------------------------------------------------------------
  const renderImportStep = () => {
    if (isImporting) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">Daten werden importiert...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bitte warten Sie, bis der Import abgeschlossen ist.
            </p>
          </div>
          <Progress value={importProgress} className="w-64" />
        </div>
      )
    }

    if (!importResult) return null

    const hasErrors = importResult.errors > 0
    const hasImported = importResult.imported > 0

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
        {hasImported ? (
          <CheckCircle2 className="h-16 w-16 text-green-600" />
        ) : (
          <XCircle className="h-16 w-16 text-destructive" />
        )}

        <div className="text-center">
          <h3 className="text-lg font-semibold">
            {hasImported ? 'Import abgeschlossen' : 'Import fehlgeschlagen'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {hasImported
              ? `${importResult.imported} Datensaetze wurden erfolgreich importiert.`
              : 'Es konnten keine Datensaetze importiert werden.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
            <p className="text-xs text-muted-foreground">Importiert</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
            <p className="text-xs text-muted-foreground">Übersprungen</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-destructive">{importResult.errors}</p>
            <p className="text-xs text-muted-foreground">Fehler</p>
          </div>
        </div>

        {hasErrors && importResult.details.length > 0 && (
          <div className="w-full max-w-md">
            <p className="text-sm font-medium mb-2">Fehlerdetails:</p>
            <div className="rounded-md border p-3 bg-muted/30 max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {importResult.details.slice(0, 20).map((detail, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-muted-foreground flex items-start gap-1"
                  >
                    <XCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                    {detail}
                  </li>
                ))}
                {importResult.details.length > 20 && (
                  <li className="text-xs text-muted-foreground italic">
                    ... und {importResult.details.length - 20} weitere Fehler
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[600px] sm:w-[800px] sm:max-w-none flex flex-col"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Produktionsdaten importieren</SheetTitle>
          <SheetDescription>
            CSV- oder Excel-Datei mit Turbinen-Produktionsdaten hochladen und importieren
          </SheetDescription>
        </SheetHeader>

        {/* Stepper */}
        <div className="flex-shrink-0 py-4">
          <Stepper steps={WIZARD_STEPS} currentStep={currentStep} />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {currentStep === 0 && renderUploadStep()}
          {currentStep === 1 && renderMappingStep()}
          {currentStep === 2 && renderPreviewStep()}
          {currentStep === 3 && renderImportStep()}
        </div>

        {/* Footer navigation */}
        <SheetFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <div className="flex w-full items-center justify-between">
            <div>
              {currentStep > 0 && currentStep < 3 && (
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {currentStep === 3 && importResult && (
                <Button onClick={() => handleOpenChange(false)}>Schliessen</Button>
              )}
              {currentStep < 3 && (
                <Button onClick={handleNext} disabled={!canGoNext()}>
                  {currentStep === 2 ? (
                    <>
                      Importieren
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Weiter
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
