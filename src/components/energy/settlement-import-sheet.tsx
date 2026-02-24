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

interface SettlementImportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface ColumnMapping {
  park: string | null
  year: string | null
  month: string | null
  productionKwh: string | null
  revenueEur: string | null
  reference: string | null
  notes: string | null
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

interface ImportRowResult {
  row: number
  success: boolean
  parkName?: string
  year?: number
  month?: number | null
  error?: string
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

const MAX_FILE_SIZE = 10 * 1024 * 1024

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, maerz: 3, march: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  jan: 1, feb: 2, mrz: 3, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
}

const COLUMN_PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  park: /^(park[_-]?(name|id)?|windpark|wp|standort)$/i,
  year: /^(jahr|year|j|abrechnungsjahr)$/i,
  month: /^(monat|month|m|abrechnungsmonat)$/i,
  productionKwh: /^(produktion[_-]?kwh|production[_-]?kwh|einspeisung[_-]?kwh|einspeisung|kwh|menge)$/i,
  revenueEur: /^(erlös[_-]?eur|revenue[_-]?eur|erlös|revenue|betrag|netto|vergütung|eur)$/i,
  reference: /^(referenz|reference|ref|beleg[_-]?nr|belegnummer|rechnungs?[_-]?nr)$/i,
  notes: /^(bemerkungen|notes|notizen|kommentar|anmerkung)$/i,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseGermanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return isNaN(value) ? null : value
  const str = String(value).trim()
  if (str === '') return null

  // Remove currency symbols and whitespace
  const cleaned = str.replace(/[€\s]/g, '')

  // German format: 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(normalized)
    return isNaN(num) ? null : num
  }

  // Comma decimal only: 1234,56
  if (/^\d+(,\d+)?$/.test(cleaned)) {
    const normalized = cleaned.replace(',', '.')
    const num = parseFloat(normalized)
    return isNaN(num) ? null : num
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseMonth(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!isNaN(num) && num >= 1 && num <= 12) return Math.floor(num)
  const str = String(value).toLowerCase().trim()
  return GERMAN_MONTHS[str] ?? null
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    park: null,
    year: null,
    month: null,
    productionKwh: null,
    revenueEur: null,
    reference: null,
    notes: null,
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

export function SettlementImportSheet({
  open,
  onOpenChange,
  onSuccess,
}: SettlementImportSheetProps) {
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
    park: null,
    year: null,
    month: null,
    productionKwh: null,
    revenueEur: null,
    reference: null,
    notes: null,
  })

  // Parks for resolving names to IDs
  const [parks, setParks] = useState<Array<{ id: string; name: string }>>([])
  const [parksLoaded, setParksLoaded] = useState(false)

  // Step 3: Validation
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isValidating, setIsValidating] = useState(false)

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false)
  const [importResults, setImportResults] = useState<{
    imported: number
    skipped: number
    errors: number
    details: ImportRowResult[]
  } | null>(null)
  const [importProgress, setImportProgress] = useState(0)

  // -------------------------------------------------------------------------
  // Load parks
  // -------------------------------------------------------------------------
  const loadParks = useCallback(async () => {
    if (parksLoaded) return
    try {
      const res = await fetch('/api/parks?limit=100')
      if (!res.ok) throw new Error('Fehler beim Laden der Parks')
      const json = await res.json()
      const parkList = (json.data ?? json) as Array<{ id: string; name: string }>
      setParks(parkList)
      setParksLoaded(true)
    } catch {
      toast.error('Parks konnten nicht geladen werden')
    }
  }, [parksLoaded])

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
      park: null,
      year: null,
      month: null,
      productionKwh: null,
      revenueEur: null,
      reference: null,
      notes: null,
    })
    setValidationResults([])
    setIsValidating(false)
    setIsImporting(false)
    setImportResults(null)
    setImportProgress(0)
  }, [])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetAll()
      } else {
        loadParks()
      }
      onOpenChange(newOpen)
    },
    [onOpenChange, resetAll, loadParks]
  )

  // -------------------------------------------------------------------------
  // Step 1: File parsing
  // -------------------------------------------------------------------------
  const parseFile = useCallback(
    async (selectedFile: File) => {
      setIsParsing(true)
      setParseError(null)

      try {
        if (selectedFile.size > MAX_FILE_SIZE) {
          throw new Error(
            'Datei ist größer als 10 MB. Bitte eine kleinere Datei verwenden.'
          )
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

        const detectedMapping = autoDetectMapping(detectedHeaders)
        setMapping(detectedMapping)

        // Load parks if not yet loaded
        await loadParks()

        setCurrentStep(1)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Lesen der Datei'
        setParseError(message)
        toast.error('Fehler beim Lesen der Datei', { description: message })
      } finally {
        setIsParsing(false)
      }
    },
    [loadParks]
  )

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) parseFile(droppedFile)
    },
    [parseFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) parseFile(selectedFile)
    },
    [parseFile]
  )

  // -------------------------------------------------------------------------
  // Step 2: Mapping
  // -------------------------------------------------------------------------
  const updateMapping = useCallback((field: keyof ColumnMapping, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === '__none__' ? null : value,
    }))
  }, [])

  const isMappingValid =
    mapping.park !== null &&
    mapping.year !== null &&
    mapping.revenueEur !== null &&
    mapping.productionKwh !== null

  // -------------------------------------------------------------------------
  // Step 3: Validation
  // -------------------------------------------------------------------------
  const runValidation = useCallback(() => {
    setIsValidating(true)
    setValidationResults([])

    try {
      // Build park name lookup (case-insensitive)
      const parkByName = new Map(
        parks.map((p) => [p.name.toLowerCase().trim(), p])
      )

      const results: ValidationResult[] = rawData.map((row, idx) => {
        const messages: string[] = []
        let status: 'success' | 'warning' | 'error' = 'success'

        // Park
        const parkVal = mapping.park ? String(row[mapping.park] ?? '').trim() : ''
        if (!parkVal) {
          messages.push('Kein Park angegeben')
          status = 'error'
        } else {
          const found = parkByName.get(parkVal.toLowerCase())
          if (!found) {
            // Try partial match
            const partial = parks.find(
              (p) =>
                p.name.toLowerCase().includes(parkVal.toLowerCase()) ||
                parkVal.toLowerCase().includes(p.name.toLowerCase())
            )
            if (!partial) {
              messages.push(`Park nicht gefunden: "${parkVal}"`)
              status = 'error'
            } else {
              messages.push(`Park erkannt: ${partial.name}`)
            }
          }
        }

        // Year
        const year = mapping.year ? Number(row[mapping.year]) : NaN
        if (isNaN(year) || year < 2000 || year > 2100) {
          messages.push(`Ungültiges Jahr: ${mapping.year ? row[mapping.year] : '(leer)'}`)
          status = 'error'
        }

        // Month (optional -- null means annual)
        if (mapping.month) {
          const monthRaw = row[mapping.month]
          if (monthRaw !== null && monthRaw !== undefined && monthRaw !== '') {
            const month = parseMonth(monthRaw)
            if (month === null) {
              messages.push(`Ungültiger Monat: ${monthRaw}`)
              if (status === 'success') status = 'warning'
            }
          }
        }

        // Production kWh
        const production = mapping.productionKwh
          ? parseGermanNumber(row[mapping.productionKwh])
          : null
        if (production === null || production < 0) {
          messages.push(
            `Ungültige Produktion: ${mapping.productionKwh ? row[mapping.productionKwh] : '(leer)'}`
          )
          status = 'error'
        }

        // Revenue EUR
        const revenue = mapping.revenueEur
          ? parseGermanNumber(row[mapping.revenueEur])
          : null
        if (revenue === null || revenue < 0) {
          messages.push(
            `Ungültiger Erlös: ${mapping.revenueEur ? row[mapping.revenueEur] : '(leer)'}`
          )
          status = 'error'
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
  }, [rawData, mapping, parks])

  const validCount = validationResults.filter((r) => r.status === 'success').length
  const warningCount = validationResults.filter((r) => r.status === 'warning').length
  const errorCount = validationResults.filter((r) => r.status === 'error').length

  // -------------------------------------------------------------------------
  // Step 4: Import -- create settlements one by one
  // -------------------------------------------------------------------------
  const executeImport = useCallback(async () => {
    setIsImporting(true)
    setImportProgress(0)

    const parkByName = new Map(parks.map((p) => [p.name.toLowerCase().trim(), p]))
    // Also build a partial match map
    const findPark = (name: string) => {
      const exact = parkByName.get(name.toLowerCase().trim())
      if (exact) return exact
      return parks.find(
        (p) =>
          p.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(p.name.toLowerCase())
      ) ?? null
    }

    const results: ImportRowResult[] = []
    let imported = 0
    let skipped = 0
    let errors = 0

    // Only process rows that passed validation (success or warning)
    const validRows = rawData.filter((_, idx) => {
      const vr = validationResults[idx]
      return vr && vr.status !== 'error'
    })

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100))

      try {
        const parkVal = mapping.park ? String(row[mapping.park] ?? '').trim() : ''
        const park = findPark(parkVal)

        if (!park) {
          results.push({
            row: i + 1,
            success: false,
            parkName: parkVal,
            error: `Park nicht gefunden: "${parkVal}"`,
          })
          errors++
          continue
        }

        const year = mapping.year ? Number(row[mapping.year]) : 0
        const monthRaw = mapping.month ? row[mapping.month] : null
        const month =
          monthRaw !== null && monthRaw !== undefined && monthRaw !== ''
            ? parseMonth(monthRaw)
            : null
        const productionKwh = mapping.productionKwh
          ? parseGermanNumber(row[mapping.productionKwh]) ?? 0
          : 0
        const revenueEur = mapping.revenueEur
          ? parseGermanNumber(row[mapping.revenueEur]) ?? 0
          : 0
        const reference = mapping.reference ? String(row[mapping.reference] ?? '').trim() : null
        const notes = mapping.notes ? String(row[mapping.notes] ?? '').trim() : null

        const body = {
          parkId: park.id,
          year,
          month: month ?? undefined,
          totalProductionKwh: productionKwh,
          netOperatorRevenueEur: revenueEur,
          netOperatorReference: reference || undefined,
          notes: notes || undefined,
        }

        const res = await fetch('/api/energy/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (res.ok || res.status === 201) {
          imported++
          results.push({
            row: i + 1,
            success: true,
            parkName: park.name,
            year,
            month,
          })
        } else if (res.status === 409) {
          skipped++
          const errBody = await res.json().catch(() => ({ error: 'Duplikat' }))
          results.push({
            row: i + 1,
            success: false,
            parkName: park.name,
            year,
            month,
            error: errBody.details || errBody.error || 'Eintrag existiert bereits',
          })
        } else {
          errors++
          const errBody = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }))
          results.push({
            row: i + 1,
            success: false,
            parkName: park.name,
            year,
            month,
            error: errBody.error || `Fehler (HTTP ${res.status})`,
          })
        }
      } catch (err) {
        errors++
        results.push({
          row: i + 1,
          success: false,
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        })
      }
    }

    setImportResults({ imported, skipped, errors, details: results })
    setImportProgress(100)
    setIsImporting(false)

    if (imported > 0) {
      toast.success('Import erfolgreich', {
        description: `${imported} Abrechnungen importiert`,
      })
      onSuccess()
    } else if (errors > 0) {
      toast.warning('Import mit Fehlern', {
        description: `${errors} Fehler aufgetreten`,
      })
    }
  }, [rawData, mapping, parks, validationResults, onSuccess])

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
  // Render: Upload
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
  // Render: Mapping
  // -------------------------------------------------------------------------
  const renderMappingStep = () => {
    const fields: Array<{
      key: keyof ColumnMapping
      label: string
      required: boolean
      description: string
    }> = [
      { key: 'park', label: 'Park', required: true, description: 'Windpark-Name oder ID' },
      { key: 'year', label: 'Jahr', required: true, description: 'Abrechnungsjahr' },
      {
        key: 'month',
        label: 'Monat',
        required: false,
        description: 'Abrechnungsmonat (leer = Jahresabrechnung)',
      },
      {
        key: 'productionKwh',
        label: 'Produktion kWh',
        required: true,
        description: 'Einspeisung laut Netzbetreiber',
      },
      {
        key: 'revenueEur',
        label: 'Erlös EUR',
        required: true,
        description: 'Vergütungsbetrag vom Netzbetreiber',
      },
      {
        key: 'reference',
        label: 'Referenznummer',
        required: false,
        description: 'NB-Belegnummer (optional)',
      },
      {
        key: 'notes',
        label: 'Bemerkungen',
        required: false,
        description: 'Zusätzliche Notizen (optional)',
      },
    ]

    return (
      <div className="flex-1 overflow-y-auto py-4">
        <p className="text-sm text-muted-foreground mb-4">
          Ordnen Sie die Spalten Ihrer Datei den entsprechenden Feldern zu. Park, Jahr,
          Produktion und Erlös muessen zugeordnet werden.
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
                Bitte ordnen Sie mindestens Park, Jahr, Produktion und Erlös zu.
              </p>
            </div>
          </div>
        )}

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
  // Render: Preview
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

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead className="w-16 text-xs">Status</TableHead>
                <TableHead className="text-xs">Park</TableHead>
                <TableHead className="text-xs">Zeitraum</TableHead>
                <TableHead className="text-xs text-right">Produktion kWh</TableHead>
                <TableHead className="text-xs text-right">Erlös EUR</TableHead>
                <TableHead className="text-xs">Hinweise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationResults.slice(0, 100).map((result) => {
                const row = result.data
                const parkVal = mapping.park ? row[mapping.park] : '-'
                const yearVal = mapping.year ? row[mapping.year] : '-'
                const monthVal = mapping.month ? row[mapping.month] : '-'
                const prodVal = mapping.productionKwh ? row[mapping.productionKwh] : '-'
                const revVal = mapping.revenueEur ? row[mapping.revenueEur] : '-'

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
                    <TableCell className="text-xs py-2 max-w-[100px] truncate">
                      {String(parkVal ?? '')}
                    </TableCell>
                    <TableCell className="text-xs py-2 whitespace-nowrap">
                      {monthVal && monthVal !== '-' && monthVal !== ''
                        ? `${String(monthVal)}/${String(yearVal)}`
                        : String(yearVal)}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-right font-mono">
                      {String(prodVal ?? '')}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-right font-mono">
                      {String(revVal ?? '')}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground max-w-[180px] truncate">
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
            Zeige 100 von {validationResults.length} Zeilen.
          </p>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Import result
  // -------------------------------------------------------------------------
  const renderImportStep = () => {
    if (isImporting) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">Abrechnungen werden importiert...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bitte warten Sie, bis der Import abgeschlossen ist.
            </p>
          </div>
          <Progress value={importProgress} className="w-64" />
        </div>
      )
    }

    if (!importResults) return null

    const hasImported = importResults.imported > 0

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
              ? `${importResults.imported} Abrechnungen wurden erfolgreich importiert.`
              : 'Es konnten keine Abrechnungen importiert werden.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-green-600">{importResults.imported}</p>
            <p className="text-xs text-muted-foreground">Importiert</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-yellow-600">{importResults.skipped}</p>
            <p className="text-xs text-muted-foreground">Übersprungen</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold text-destructive">{importResults.errors}</p>
            <p className="text-xs text-muted-foreground">Fehler</p>
          </div>
        </div>

        {(importResults.errors > 0 || importResults.skipped > 0) && (
          <div className="w-full max-w-md">
            <p className="text-sm font-medium mb-2">Details:</p>
            <div className="rounded-md border p-3 bg-muted/30 max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {importResults.details
                  .filter((d) => !d.success)
                  .slice(0, 20)
                  .map((detail, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-muted-foreground flex items-start gap-1"
                    >
                      <XCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                      Zeile {detail.row}
                      {detail.parkName ? ` (${detail.parkName})` : ''}:{' '}
                      {detail.error}
                    </li>
                  ))}
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
          <SheetTitle>Netzbetreiber-Daten importieren</SheetTitle>
          <SheetDescription>
            CSV- oder Excel-Datei mit Abrechnungsdaten vom Netzbetreiber importieren
          </SheetDescription>
        </SheetHeader>

        <div className="flex-shrink-0 py-4">
          <Stepper steps={WIZARD_STEPS} currentStep={currentStep} />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {currentStep === 0 && renderUploadStep()}
          {currentStep === 1 && renderMappingStep()}
          {currentStep === 2 && renderPreviewStep()}
          {currentStep === 3 && renderImportStep()}
        </div>

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
              {currentStep === 3 && importResults && (
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
