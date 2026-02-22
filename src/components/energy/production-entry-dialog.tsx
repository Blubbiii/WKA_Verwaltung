'use client'

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductionEditData {
  id: string
  year: number
  month: number
  productionKwh: number
  revenueEur: number | null
  operatingHours?: number | null
  availabilityPct?: number | null
  notes: string | null
  source: string
  status: string
  turbine: {
    id: string
    designation: string
    park: {
      id: string
      name: string
    }
  }
  revenueType?: {
    id: string
    name: string
    code: string
  } | null
}

interface ProductionEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editData?: ProductionEditData | null
}

interface ParkOption {
  id: string
  name: string
  turbines?: TurbineOption[]
}

interface TurbineOption {
  id: string
  designation: string
  status: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = [
  { value: '1', label: 'Januar' },
  { value: '2', label: 'Februar' },
  { value: '3', label: 'Maerz' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mai' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
]

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - i)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionEntryDialog({
  open,
  onOpenChange,
  onSuccess,
  editData,
}: ProductionEntryDialogProps) {
  const isEdit = !!editData

  // Form state
  const [parkId, setParkId] = useState('')
  const [turbineId, setTurbineId] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [productionKwh, setProductionKwh] = useState('')
  const [operatingHours, setOperatingHours] = useState('')
  const [availabilityPct, setAvailabilityPct] = useState('')
  const [notes, setNotes] = useState('')

  // Data
  const [parks, setParks] = useState<ParkOption[]>([])
  const [turbines, setTurbines] = useState<TurbineOption[]>([])
  const [isLoadingParks, setIsLoadingParks] = useState(false)
  const [isLoadingTurbines, setIsLoadingTurbines] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // -------------------------------------------------------------------------
  // Load parks
  // -------------------------------------------------------------------------
  const loadParks = useCallback(async () => {
    setIsLoadingParks(true)
    try {
      const res = await fetch('/api/parks?limit=100')
      if (!res.ok) throw new Error('Fehler beim Laden der Parks')
      const json = await res.json()
      const data = (json.data ?? json) as ParkOption[]
      setParks(data)
    } catch {
      toast.error('Parks konnten nicht geladen werden')
    } finally {
      setIsLoadingParks(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Load turbines for selected park
  // -------------------------------------------------------------------------
  const loadTurbines = useCallback(async (selectedParkId: string) => {
    if (!selectedParkId) {
      setTurbines([])
      return
    }

    setIsLoadingTurbines(true)
    try {
      const res = await fetch(`/api/parks/${selectedParkId}`)
      if (!res.ok) throw new Error('Fehler beim Laden der Anlagen')
      const park = await res.json()
      const turbineList = (park.turbines ?? []) as TurbineOption[]
      setTurbines(turbineList.filter((t) => t.status === 'ACTIVE'))
    } catch {
      toast.error('Anlagen konnten nicht geladen werden')
      setTurbines([])
    } finally {
      setIsLoadingTurbines(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Initialize form
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      loadParks()

      if (editData) {
        setParkId(editData.turbine.park.id)
        setTurbineId(editData.turbine.id)
        setYear(String(editData.year))
        setMonth(String(editData.month))
        setProductionKwh(String(editData.productionKwh))
        setOperatingHours(
          editData.operatingHours !== null && editData.operatingHours !== undefined
            ? String(editData.operatingHours)
            : ''
        )
        setAvailabilityPct(
          editData.availabilityPct !== null && editData.availabilityPct !== undefined
            ? String(editData.availabilityPct)
            : ''
        )
        setNotes(editData.notes ?? '')

        // Load turbines for the park
        loadTurbines(editData.turbine.park.id)
      } else {
        // Reset form for new entry
        setParkId('')
        setTurbineId('')
        setYear(String(currentYear))
        setMonth(String(new Date().getMonth() + 1))
        setProductionKwh('')
        setOperatingHours('')
        setAvailabilityPct('')
        setNotes('')
        setTurbines([])
      }
    }
  }, [open, editData, loadParks, loadTurbines])

  // Load turbines when park changes
  useEffect(() => {
    if (parkId && open) {
      loadTurbines(parkId)
      // Clear turbine selection unless we are in edit mode on first load
      if (!editData || parkId !== editData.turbine.park.id) {
        setTurbineId('')
      }
    }
  }, [parkId, open, loadTurbines, editData])

  // -------------------------------------------------------------------------
  // Form validation
  // -------------------------------------------------------------------------
  const isFormValid =
    turbineId !== '' &&
    year !== '' &&
    month !== '' &&
    productionKwh !== '' &&
    !isNaN(Number(productionKwh)) &&
    Number(productionKwh) >= 0

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid) return

    setIsSubmitting(true)

    try {
      const body: Record<string, unknown> = {
        turbineId,
        year: Number(year),
        month: Number(month),
        productionKwh: Number(productionKwh),
        source: isEdit ? editData.source : 'MANUAL',
        status: isEdit ? editData.status : 'DRAFT',
      }

      // Optional fields
      if (operatingHours !== '') {
        body.operatingHours = Number(operatingHours)
      }
      if (availabilityPct !== '') {
        body.availabilityPct = Number(availabilityPct)
      }
      if (notes.trim()) {
        body.notes = notes.trim()
      }

      const url = isEdit
        ? `/api/energy/productions/${editData.id}`
        : '/api/energy/productions'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }))
        throw new Error(
          error.details
            ? typeof error.details === 'string'
              ? error.details
              : error.error
            : error.error || `HTTP ${res.status}`
        )
      }

      toast.success(
        isEdit ? 'Produktionsdaten aktualisiert' : 'Produktionsdaten gespeichert'
      )
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(isEdit ? 'Fehler beim Aktualisieren' : 'Fehler beim Speichern', {
        description: message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Produktionsdaten bearbeiten' : 'Produktionsdaten manuell erfassen'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${editData.turbine.designation} - ${editData.month}/${editData.year}`
              : 'Neuen Produktionsdatensatz fuer eine Turbine erfassen'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Park and Turbine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-park">
                Park <span className="text-destructive">*</span>
              </Label>
              <Select
                value={parkId}
                onValueChange={setParkId}
                disabled={isEdit || isLoadingParks}
              >
                <SelectTrigger id="prod-park">
                  <SelectValue
                    placeholder={isLoadingParks ? 'Laden...' : 'Park waehlen...'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-turbine">
                Anlage / WKA <span className="text-destructive">*</span>
              </Label>
              <Select
                value={turbineId}
                onValueChange={setTurbineId}
                disabled={isEdit || !parkId || isLoadingTurbines}
              >
                <SelectTrigger id="prod-turbine">
                  <SelectValue
                    placeholder={
                      isLoadingTurbines
                        ? 'Laden...'
                        : !parkId
                          ? 'Erst Park waehlen'
                          : 'Anlage waehlen...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {turbines.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.designation}
                    </SelectItem>
                  ))}
                  {turbines.length === 0 && parkId && !isLoadingTurbines && (
                    <SelectItem value="__empty__" disabled>
                      Keine aktiven Anlagen gefunden
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Year and Month */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-year">
                Jahr <span className="text-destructive">*</span>
              </Label>
              <Select value={year} onValueChange={setYear} disabled={isEdit}>
                <SelectTrigger id="prod-year">
                  <SelectValue placeholder="Jahr waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-month">
                Monat <span className="text-destructive">*</span>
              </Label>
              <Select value={month} onValueChange={setMonth} disabled={isEdit}>
                <SelectTrigger id="prod-month">
                  <SelectValue placeholder="Monat waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Production, Hours, Availability */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-kwh">
                Produktion kWh <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prod-kwh"
                type="number"
                min="0"
                step="0.001"
                placeholder="z.B. 450000"
                value={productionKwh}
                onChange={(e) => setProductionKwh(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-hours">Betriebsstunden</Label>
              <Input
                id="prod-hours"
                type="number"
                min="0"
                max="744"
                step="0.01"
                placeholder="z.B. 720"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-avail">Verfuegbarkeit %</Label>
              <Input
                id="prod-avail"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="z.B. 97.5"
                value={availabilityPct}
                onChange={(e) => setAvailabilityPct(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="prod-notes">Bemerkungen</Label>
            <Textarea
              id="prod-notes"
              placeholder="Optionale Bemerkungen..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Aktualisieren' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
