'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// -- Types --

export type StakeholderRole =
  | 'DEVELOPER'
  | 'GRID_OPERATOR'
  | 'TECHNICAL_BF'
  | 'COMMERCIAL_BF'
  | 'OPERATOR';

export type TaxType = 'STANDARD' | 'REDUCED' | 'EXEMPT';

export interface StakeholderFormData {
  stakeholderTenantId: string;
  parkTenantId: string;
  parkId: string;
  role: StakeholderRole;
  visibleFundIds: string[];
  billingEnabled: boolean;
  feePercentage: number | null;
  taxType: TaxType;
  sepaMandate: string;
  creditorId: string;
  validFrom: string;
  validTo: string;
  notes: string;
}

export interface StakeholderFormProps {
  initialData?: Partial<StakeholderFormData>;
  onSubmit: (data: StakeholderFormData) => void;
  isLoading?: boolean;
}

interface TenantOption {
  id: string;
  name: string;
}

interface ParkOption {
  id: string;
  name: string;
}

interface FundOption {
  id: string;
  name: string;
}

// -- Role labels for select dropdown --

const ROLE_OPTIONS: { value: StakeholderRole; label: string }[] = [
  { value: 'DEVELOPER', label: 'Projektierer' },
  { value: 'GRID_OPERATOR', label: 'Netzbetreiber' },
  { value: 'TECHNICAL_BF', label: 'Techn. Betriebsfuehrer' },
  { value: 'COMMERCIAL_BF', label: 'Kaufm. Betriebsfuehrer' },
  { value: 'OPERATOR', label: 'Betreiber' },
];

// -- Tax type options --

const TAX_OPTIONS: { value: TaxType; label: string }[] = [
  { value: 'STANDARD', label: 'Standard (19 %)' },
  { value: 'REDUCED', label: 'Ermaessigt (7 %)' },
  { value: 'EXEMPT', label: 'Befreit (0 %)' },
];

/**
 * Default empty form state.
 */
function getDefaultFormData(): StakeholderFormData {
  return {
    stakeholderTenantId: '',
    parkTenantId: '',
    parkId: '',
    role: 'DEVELOPER',
    visibleFundIds: [],
    billingEnabled: false,
    feePercentage: null,
    taxType: 'STANDARD',
    sepaMandate: '',
    creditorId: '',
    validFrom: '',
    validTo: '',
    notes: '',
  };
}

/**
 * Form component for creating or editing management billing stakeholders.
 * Cascading selects: Tenant -> Park, Tenant -> Funds.
 * When editing (initialData provided), identity fields are disabled.
 */
export function StakeholderForm({
  initialData,
  onSubmit,
  isLoading = false,
}: StakeholderFormProps) {
  const isEditing = !!initialData?.stakeholderTenantId;

  // -- Form state --
  const [formData, setFormData] = useState<StakeholderFormData>(() => ({
    ...getDefaultFormData(),
    ...initialData,
  }));

  // -- Dropdown data state --
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingParks, setLoadingParks] = useState(false);
  const [loadingFunds, setLoadingFunds] = useState(false);

  // -- Fetch tenants on mount --
  useEffect(() => {
    async function fetchTenants() {
      setLoadingTenants(true);
      try {
        const res = await fetch('/api/management-billing/available-tenants');
        if (res.ok) {
          const data = await res.json();
          setTenants(data.data ?? data);
        }
      } catch {
        // Silently handle - user sees empty dropdown
      } finally {
        setLoadingTenants(false);
      }
    }
    fetchTenants();
  }, []);

  // -- Fetch parks when parkTenantId changes --
  const fetchParks = useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setParks([]);
      return;
    }
    setLoadingParks(true);
    try {
      const res = await fetch(
        `/api/management-billing/available-parks?tenantId=${tenantId}`
      );
      if (res.ok) {
        const data = await res.json();
        setParks(data.data ?? data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoadingParks(false);
    }
  }, []);

  // -- Fetch funds when stakeholderTenantId changes --
  const fetchFunds = useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setFunds([]);
      return;
    }
    setLoadingFunds(true);
    try {
      const res = await fetch(
        `/api/management-billing/available-funds?tenantId=${tenantId}`
      );
      if (res.ok) {
        const data = await res.json();
        setFunds(data.data ?? data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoadingFunds(false);
    }
  }, []);

  // Trigger park fetch when parkTenantId changes
  useEffect(() => {
    if (formData.parkTenantId) {
      fetchParks(formData.parkTenantId);
    }
  }, [formData.parkTenantId, fetchParks]);

  // Trigger fund fetch when stakeholderTenantId changes
  useEffect(() => {
    if (formData.stakeholderTenantId) {
      fetchFunds(formData.stakeholderTenantId);
    }
  }, [formData.stakeholderTenantId, fetchFunds]);

  // -- Helper to update a single field --
  function updateField<K extends keyof StakeholderFormData>(
    key: K,
    value: StakeholderFormData[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  // -- Handle fund checkbox toggle --
  function toggleFund(fundId: string) {
    setFormData((prev) => {
      const current = prev.visibleFundIds;
      const next = current.includes(fundId)
        ? current.filter((id) => id !== fundId)
        : [...current, fundId];
      return { ...prev, visibleFundIds: next };
    });
  }

  // -- Handle form submission --
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Stakeholder Tenant */}
      <div className="space-y-2">
        <Label htmlFor="stakeholderTenantId">Dienstleister (Mandant)</Label>
        {loadingTenants ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={formData.stakeholderTenantId}
            onValueChange={(val) => updateField('stakeholderTenantId', val)}
            disabled={isEditing}
          >
            <SelectTrigger id="stakeholderTenantId">
              <SelectValue placeholder="Mandant auswaehlen..." />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Park Tenant */}
      <div className="space-y-2">
        <Label htmlFor="parkTenantId">Park-Mandant</Label>
        {loadingTenants ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={formData.parkTenantId}
            onValueChange={(val) => {
              updateField('parkTenantId', val);
              // Reset park selection when tenant changes
              updateField('parkId', '');
            }}
            disabled={isEditing}
          >
            <SelectTrigger id="parkTenantId">
              <SelectValue placeholder="Park-Mandant auswaehlen..." />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Park */}
      <div className="space-y-2">
        <Label htmlFor="parkId">Windpark</Label>
        {loadingParks ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={formData.parkId}
            onValueChange={(val) => updateField('parkId', val)}
            disabled={isEditing || !formData.parkTenantId}
          >
            <SelectTrigger id="parkId">
              <SelectValue
                placeholder={
                  !formData.parkTenantId
                    ? 'Erst Park-Mandant auswaehlen'
                    : 'Windpark auswaehlen...'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {parks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Role */}
      <div className="space-y-2">
        <Label htmlFor="role">Rolle</Label>
        <Select
          value={formData.role}
          onValueChange={(val) => updateField('role', val as StakeholderRole)}
          disabled={isEditing}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder="Rolle auswaehlen..." />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Visible Funds (checkboxes) */}
      <div className="space-y-2">
        <Label>Sichtbare Gesellschaften</Label>
        {loadingFunds ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-52" />
          </div>
        ) : funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {formData.stakeholderTenantId
              ? 'Keine Gesellschaften verfügbar.'
              : 'Erst Dienstleister-Mandant auswaehlen.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {funds.map((fund) => (
              <label
                key={fund.id}
                className="flex items-center gap-2 cursor-pointer rounded-md border p-3 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={formData.visibleFundIds.includes(fund.id)}
                  onCheckedChange={() => toggleFund(fund.id)}
                />
                <span className="text-sm">{fund.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Billing Enabled */}
      <div className="flex items-center gap-3">
        <Switch
          id="billingEnabled"
          checked={formData.billingEnabled}
          onCheckedChange={(checked) => updateField('billingEnabled', checked)}
        />
        <Label htmlFor="billingEnabled">Abrechnung aktiviert</Label>
      </div>

      {/* Fee Percentage - shown only when billing is enabled */}
      {formData.billingEnabled && (
        <div className="space-y-2">
          <Label htmlFor="feePercentage">Gebühr (%)</Label>
          <Input
            id="feePercentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="z.B. 2.50"
            value={formData.feePercentage ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              updateField(
                'feePercentage',
                val === '' ? null : parseFloat(val)
              );
            }}
          />
        </div>
      )}

      {/* Tax Type */}
      <div className="space-y-2">
        <Label htmlFor="taxType">Steuersatz</Label>
        <Select
          value={formData.taxType}
          onValueChange={(val) => updateField('taxType', val as TaxType)}
        >
          <SelectTrigger id="taxType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SEPA Mandate */}
      <div className="space-y-2">
        <Label htmlFor="sepaMandate">SEPA-Mandat (optional)</Label>
        <Input
          id="sepaMandate"
          placeholder="z.B. MNDT-2026-001"
          value={formData.sepaMandate}
          onChange={(e) => updateField('sepaMandate', e.target.value)}
        />
      </div>

      {/* Creditor ID */}
      <div className="space-y-2">
        <Label htmlFor="creditorId">Glaeubiger-ID (optional)</Label>
        <Input
          id="creditorId"
          placeholder="z.B. DE98ZZZ09999999999"
          value={formData.creditorId}
          onChange={(e) => updateField('creditorId', e.target.value)}
        />
      </div>

      {/* Valid From */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="validFrom">Gültig ab</Label>
          <Input
            id="validFrom"
            type="date"
            value={formData.validFrom}
            onChange={(e) => updateField('validFrom', e.target.value)}
          />
        </div>

        {/* Valid To */}
        <div className="space-y-2">
          <Label htmlFor="validTo">Gültig bis (optional)</Label>
          <Input
            id="validTo"
            type="date"
            value={formData.validTo}
            onChange={(e) => updateField('validTo', e.target.value)}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Bemerkungen</Label>
        <Textarea
          id="notes"
          placeholder="Optionale Bemerkungen..."
          rows={3}
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
        />
      </div>

      {/* Submit button */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Speichern' : 'Anlegen'}
        </Button>
      </div>
    </form>
  );
}
