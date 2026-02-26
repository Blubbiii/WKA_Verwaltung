"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// =============================================================================
// Types
// =============================================================================

export type RecipientFilterType = "ALL" | "BY_FUND" | "BY_PARK" | "BY_ROLE" | "ACTIVE_ONLY";

export interface RecipientFilterValue {
  type: RecipientFilterType;
  fundIds?: string[];
  parkIds?: string[];
}

interface FundOption {
  id: string;
  name: string;
}

interface ParkOption {
  id: string;
  name: string;
}

interface RecipientFilterFormProps {
  value: RecipientFilterValue;
  onChange: (value: RecipientFilterValue) => void;
}

// =============================================================================
// Component
// =============================================================================

export function RecipientFilterForm({ value, onChange }: RecipientFilterFormProps) {
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [fundsRes, parksRes] = await Promise.all([
        fetch("/api/funds?limit=100"),
        fetch("/api/parks?limit=100"),
      ]);

      if (fundsRes.ok) {
        const data = await fundsRes.json();
        const list = data.funds || data.data || data || [];
        setFunds(
          Array.isArray(list)
            ? list.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
            : []
        );
      }

      if (parksRes.ok) {
        const data = await parksRes.json();
        const list = data.parks || data.data || data || [];
        setParks(
          Array.isArray(list)
            ? list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
            : []
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const handleTypeChange = (type: string) => {
    onChange({ type: type as RecipientFilterType, fundIds: [], parkIds: [] });
  };

  const toggleFund = (fundId: string) => {
    const current = value.fundIds ?? [];
    const updated = current.includes(fundId)
      ? current.filter((id) => id !== fundId)
      : [...current, fundId];
    onChange({ ...value, fundIds: updated });
  };

  const togglePark = (parkId: string) => {
    const current = value.parkIds ?? [];
    const updated = current.includes(parkId)
      ? current.filter((id) => id !== parkId)
      : [...current, parkId];
    onChange({ ...value, parkIds: updated });
  };

  return (
    <div className="space-y-4">
      <RadioGroup value={value.type} onValueChange={handleTypeChange}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="ALL" id="filter-all" />
          <Label htmlFor="filter-all" className="cursor-pointer">
            Alle Gesellschafter
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="ACTIVE_ONLY" id="filter-active" />
          <Label htmlFor="filter-active" className="cursor-pointer">
            Nur aktive Gesellschafter (ohne Austritt)
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="BY_FUND" id="filter-fund" />
          <Label htmlFor="filter-fund" className="cursor-pointer">
            Nach Gesellschaft filtern
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="BY_PARK" id="filter-park" />
          <Label htmlFor="filter-park" className="cursor-pointer">
            Nach Windpark filtern
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="BY_ROLE" id="filter-role" />
          <Label htmlFor="filter-role" className="cursor-pointer">
            Nur aktive (nach Status)
          </Label>
        </div>
      </RadioGroup>

      {value.type === "BY_FUND" && (
        <div className="mt-4 space-y-2">
          <Label>Gesellschaften auswaehlen</Label>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-48" />
              ))}
            </div>
          ) : funds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Gesellschaften gefunden.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
              {funds.map((fund) => (
                <div key={fund.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`fund-${fund.id}`}
                    checked={(value.fundIds ?? []).includes(fund.id)}
                    onCheckedChange={() => toggleFund(fund.id)}
                  />
                  <Label htmlFor={`fund-${fund.id}`} className="cursor-pointer text-sm">
                    {fund.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {(value.fundIds?.length ?? 0) > 0 && (
            <Badge variant="secondary" className="text-xs">
              {value.fundIds!.length} ausgewaehlt
            </Badge>
          )}
        </div>
      )}

      {value.type === "BY_PARK" && (
        <div className="mt-4 space-y-2">
          <Label>Windparks auswaehlen</Label>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-48" />
              ))}
            </div>
          ) : parks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Windparks gefunden.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
              {parks.map((park) => (
                <div key={park.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`park-${park.id}`}
                    checked={(value.parkIds ?? []).includes(park.id)}
                    onCheckedChange={() => togglePark(park.id)}
                  />
                  <Label htmlFor={`park-${park.id}`} className="cursor-pointer text-sm">
                    {park.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {(value.parkIds?.length ?? 0) > 0 && (
            <Badge variant="secondary" className="text-xs">
              {value.parkIds!.length} ausgewaehlt
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
