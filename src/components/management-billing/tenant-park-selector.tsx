'use client';

import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
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

export interface TenantParkSelection {
  tenantId: string;
  parkId: string;
  fundIds: string[];
}

export interface TenantParkSelectorProps {
  onSelectionChange: (selection: TenantParkSelection) => void;
  disabled?: boolean;
  /** Optional initial values for pre-populating the selector */
  initialSelection?: Partial<TenantParkSelection>;
}

/**
 * Reusable cascading selector component for Tenant -> Park -> Funds.
 * - First dropdown selects the tenant
 * - Second dropdown selects the park (loads when tenant is selected)
 * - Third section shows fund checkboxes (loads when tenant is selected)
 */
export function TenantParkSelector({
  onSelectionChange,
  disabled = false,
  initialSelection,
}: TenantParkSelectorProps) {
  // -- Selection state --
  const [tenantId, setTenantId] = useState(initialSelection?.tenantId ?? '');
  const [parkId, setParkId] = useState(initialSelection?.parkId ?? '');
  const [fundIds, setFundIds] = useState<string[]>(
    initialSelection?.fundIds ?? []
  );

  // -- Dropdown data state --
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingParks, setLoadingParks] = useState(false);
  const [loadingFunds, setLoadingFunds] = useState(false);

  // -- Notify parent of selection changes --
  useEffect(() => {
    onSelectionChange({ tenantId, parkId, fundIds });
    // Only fire when selection values change, not the callback ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, parkId, fundIds]);

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

  // -- Fetch parks when tenantId changes --
  const fetchParks = useCallback(async (tid: string) => {
    if (!tid) {
      setParks([]);
      return;
    }
    setLoadingParks(true);
    try {
      const res = await fetch(
        `/api/management-billing/available-parks?tenantId=${tid}`
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

  // -- Fetch funds when tenantId changes --
  const fetchFunds = useCallback(async (tid: string) => {
    if (!tid) {
      setFunds([]);
      return;
    }
    setLoadingFunds(true);
    try {
      const res = await fetch(
        `/api/management-billing/available-funds?tenantId=${tid}`
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

  // Trigger cascade fetches when tenant changes
  useEffect(() => {
    if (tenantId) {
      fetchParks(tenantId);
      fetchFunds(tenantId);
    } else {
      setParks([]);
      setFunds([]);
    }
  }, [tenantId, fetchParks, fetchFunds]);

  // -- Event handlers --

  function handleTenantChange(value: string) {
    setTenantId(value);
    // Reset dependent selections
    setParkId('');
    setFundIds([]);
  }

  function handleParkChange(value: string) {
    setParkId(value);
  }

  function toggleFund(fundId: string) {
    setFundIds((prev) =>
      prev.includes(fundId)
        ? prev.filter((id) => id !== fundId)
        : [...prev, fundId]
    );
  }

  return (
    <div className="space-y-4">
      {/* Tenant select */}
      <div className="space-y-2">
        <Label htmlFor="tps-tenant">Mandant</Label>
        {loadingTenants ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={tenantId}
            onValueChange={handleTenantChange}
            disabled={disabled}
          >
            <SelectTrigger id="tps-tenant">
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

      {/* Park select */}
      <div className="space-y-2">
        <Label htmlFor="tps-park">Windpark</Label>
        {loadingParks ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={parkId}
            onValueChange={handleParkChange}
            disabled={disabled || !tenantId}
          >
            <SelectTrigger id="tps-park">
              <SelectValue
                placeholder={
                  !tenantId
                    ? 'Erst Mandant auswaehlen'
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

      {/* Fund checkboxes */}
      <div className="space-y-2">
        <Label>Gesellschaften</Label>
        {loadingFunds ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-52" />
          </div>
        ) : funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tenantId
              ? 'Keine Gesellschaften verfuegbar.'
              : 'Erst Mandant auswaehlen.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {funds.map((fund) => (
              <label
                key={fund.id}
                className="flex items-center gap-2 cursor-pointer rounded-md border p-3 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={fundIds.includes(fund.id)}
                  onCheckedChange={() => toggleFund(fund.id)}
                  disabled={disabled}
                />
                <span className="text-sm">{fund.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
