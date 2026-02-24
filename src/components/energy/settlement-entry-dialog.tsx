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

export interface SettlementEditData {
  id: string
  year: number
  month: number | null
  netOperatorRevenueEur: number
  netOperatorReference: string | null
  totalProductionKwh: number
  eegProductionKwh: number | null
  eegRevenueEur: number | null
  dvProductionKwh: number | null
  dvRevenueEur: number | null
  distributionMode: string
  smoothingFactor: number | null
  tolerancePercentage: number | null
  status: string
  notes: string | null
  park: {
    id: string
    name: string
    shortName: string | null
  }
}

interface SettlementEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editData?: SettlementEditData | null
}

interface ParkOption {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = [
  { value: '__none__', label: '-- Jahresabrechnung --' },
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

export function SettlementEntryDialog({
  open,
  onOpenChange,
  onSuccess,
  editData,
}: SettlementEntryDialogProps) {
  const isEdit = !!editData

  // Form state
  const [parkId, setParkId] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [month, setMonth] = useState('__none__')
  const [eegProductionKwh, setEegProductionKwh] = useState('')
  const [eegRevenueEur, setEegRevenueEur] = useState('')
  const [dvProductionKwh, setDvProductionKwh] = useState('')
  const [dvRevenueEur, setDvRevenueEur] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  // Data
  const [parks, setParks] = useState<ParkOption[]>([])
  const [isLoadingParks, setIsLoadingParks] = useState(false)
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
  // Initialize form
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      loadParks()

      if (editData) {
        setParkId(editData.park.id)
        setYear(String(editData.year))
        setMonth(
          editData.month !== null && editData.month !== 0
            ? String(editData.month)
            : '__none__'
        )
        setEegProductionKwh(editData.eegProductionKwh != null ? String(editData.eegProductionKwh) : '')
        setEegRevenueEur(editData.eegRevenueEur != null ? String(editData.eegRevenueEur) : '')
        setDvProductionKwh(editData.dvProductionKwh != null ? String(editData.dvProductionKwh) : '')
        setDvRevenueEur(editData.dvRevenueEur != null ? String(editData.dvRevenueEur) : '')
        setReference(editData.netOperatorReference ?? '')
        setNotes(editData.notes ?? '')
      } else {
        setParkId('')
        setYear(String(currentYear))
        setMonth('__none__')
        setEegProductionKwh('')
        setEegRevenueEur('')
        setDvProductionKwh('')
        setDvRevenueEur('')
        setReference('')
        setNotes('')
      }
    }
  }, [open, editData, loadParks])

  // -------------------------------------------------------------------------
  // Form validation
  // -------------------------------------------------------------------------
  // Compute totals from EEG + DV
  const eegProd = eegProductionKwh !== '' ? Number(eegProductionKwh) : 0
  const dvProd = dvProductionKwh !== '' ? Number(dvProductionKwh) : 0
  const eegRev = eegRevenueEur !== '' ? Number(eegRevenueEur) : 0
  const dvRev = dvRevenueEur !== '' ? Number(dvRevenueEur) : 0
  const totalProductionKwh = eegProd + dvProd
  const totalRevenueEur = eegRev + dvRev

  // At least one of EEG or DV must have data
  const hasEeg = eegProductionKwh !== '' && eegRevenueEur !== ''
  const hasDv = dvProductionKwh !== '' && dvRevenueEur !== ''
  const hasAnyRevenue = hasEeg || hasDv

  const isFormValid =
    parkId !== '' &&
    year !== '' &&
    hasAnyRevenue &&
    totalProductionKwh >= 0 &&
    totalRevenueEur >= 0

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid) return

    setIsSubmitting(true)

    try {
      const monthValue = month === '__none__' ? null : Number(month)

      if (isEdit) {
        // PATCH - only send changed fields
        const body: Record<string, unknown> = {
          totalProductionKwh,
          netOperatorRevenueEur: totalRevenueEur,
          eegProductionKwh: eegProductionKwh !== '' ? Number(eegProductionKwh) : null,
          eegRevenueEur: eegRevenueEur !== '' ? Number(eegRevenueEur) : null,
          dvProductionKwh: dvProductionKwh !== '' ? Number(dvProductionKwh) : null,
          dvRevenueEur: dvRevenueEur !== '' ? Number(dvRevenueEur) : null,
          netOperatorReference: reference.trim() || null,
          notes: notes.trim() || null,
        }

        const res = await fetch(`/api/energy/settlements/${editData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }))
          throw new Error(error.details || error.error || `HTTP ${res.status}`)
        }

        toast.success('Abrechnung aktualisiert')
      } else {
        // POST - create new
        const body: Record<string, unknown> = {
          parkId,
          year: Number(year),
          month: monthValue,
          totalProductionKwh,
          netOperatorRevenueEur: totalRevenueEur,
          eegProductionKwh: eegProductionKwh !== '' ? Number(eegProductionKwh) : null,
          eegRevenueEur: eegRevenueEur !== '' ? Number(eegRevenueEur) : null,
          dvProductionKwh: dvProductionKwh !== '' ? Number(dvProductionKwh) : null,
          dvRevenueEur: dvRevenueEur !== '' ? Number(dvRevenueEur) : null,
          netOperatorReference: reference.trim() || null,
          notes: notes.trim() || null,
        }

        const res = await fetch('/api/energy/settlements', {
          method: 'POST',
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

        toast.success('Abrechnung erstellt')
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(isEdit ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen', {
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
            {isEdit ? 'Abrechnung bearbeiten' : 'Neue Abrechnung erfassen'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${editData.park.name} - ${editData.month ? `${editData.month}/${editData.year}` : `Jahr ${editData.year}`}`
              : 'Neue Netzbetreiber-Abrechnung manuell erfassen'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Park */}
          <div className="space-y-2">
            <Label htmlFor="sett-park">
              Park <span className="text-destructive">*</span>
            </Label>
            <Select
              value={parkId}
              onValueChange={setParkId}
              disabled={isEdit || isLoadingParks}
            >
              <SelectTrigger id="sett-park">
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

          {/* Year and Month */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sett-year">
                Jahr <span className="text-destructive">*</span>
              </Label>
              <Select value={year} onValueChange={setYear} disabled={isEdit}>
                <SelectTrigger id="sett-year">
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
              <Label htmlFor="sett-month">Monat</Label>
              <Select value={month} onValueChange={setMonth} disabled={isEdit}>
                <SelectTrigger id="sett-month">
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
              <p className="text-xs text-muted-foreground">
                Leer lassen für eine Jahresabrechnung
              </p>
            </div>
          </div>

          {/* EEG */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">EEG-Vergütung</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sett-eeg-prod" className="text-xs text-muted-foreground">
                  Einspeisung kWh (EEG)
                </Label>
                <Input
                  id="sett-eeg-prod"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="z.B. 1500000"
                  value={eegProductionKwh}
                  onChange={(e) => setEegProductionKwh(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sett-eeg-rev" className="text-xs text-muted-foreground">
                  Erlöse EUR (EEG)
                </Label>
                <Input
                  id="sett-eeg-rev"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="z.B. 120000.00"
                  value={eegRevenueEur}
                  onChange={(e) => setEegRevenueEur(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Direktvermarktung */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Direktvermarktung / Marktpraemie</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sett-dv-prod" className="text-xs text-muted-foreground">
                  Einspeisung kWh (DV)
                </Label>
                <Input
                  id="sett-dv-prod"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="z.B. 1000000"
                  value={dvProductionKwh}
                  onChange={(e) => setDvProductionKwh(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sett-dv-rev" className="text-xs text-muted-foreground">
                  Erlöse EUR (DV)
                </Label>
                <Input
                  id="sett-dv-rev"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="z.B. 65000.00"
                  value={dvRevenueEur}
                  onChange={(e) => setDvRevenueEur(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Calculated totals */}
          {hasAnyRevenue && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gesamt Einspeisung:</span>
                <span className="font-medium">{totalProductionKwh.toLocaleString('de-DE')} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gesamt Erlöse:</span>
                <span className="font-medium">{totalRevenueEur.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</span>
              </div>
            </div>
          )}

          {/* Reference */}
          <div className="space-y-2">
            <Label htmlFor="sett-ref">Referenznummer</Label>
            <Input
              id="sett-ref"
              type="text"
              placeholder="z.B. NB-2024-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Belegnummer oder Referenz vom Netzbetreiber (optional)
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="sett-notes">Bemerkungen</Label>
            <Textarea
              id="sett-notes"
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
