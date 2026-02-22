"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { ParticipationData, Fund } from "../onboarding-types";

interface StepParticipationProps {
  data: ParticipationData;
  onChange: (data: ParticipationData) => void;
  errors: Partial<Record<keyof ParticipationData, string>>;
}

export function StepParticipation({ data, onChange, errors }: StepParticipationProps) {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFunds = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/funds?status=ACTIVE&limit=100");
      if (response.ok) {
        const result = await response.json();
        setFunds(result.data || []);
      }
    } catch {
      // Fund fetch failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  function update(field: keyof ParticipationData, value: string) {
    onChange({ ...data, [field]: value });
  }

  function handleFundChange(fundId: string) {
    const selectedFund = funds.find((f) => f.id === fundId);
    onChange({
      ...data,
      fundId,
      fundName: selectedFund?.name || "",
    });
  }

  const selectedFund = funds.find((f) => f.id === data.fundId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Beteiligung</h3>
        <p className="text-sm text-muted-foreground">
          Waehlen Sie die Gesellschaft und geben Sie die Beteiligungsdaten ein.
        </p>
      </div>

      {/* Fund selection */}
      <div className="space-y-2">
        <Label htmlFor="onb-fund">
          Gesellschaft / Fonds <span className="text-destructive">*</span>
        </Label>
        {isLoading ? (
          <div className="flex items-center gap-2 h-10 rounded-md border px-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Gesellschaften werden geladen...</span>
          </div>
        ) : (
          <Select value={data.fundId} onValueChange={handleFundChange}>
            <SelectTrigger
              id="onb-fund"
              aria-invalid={!!errors.fundId}
              aria-describedby={errors.fundId ? "onb-fund-error" : undefined}
            >
              <SelectValue placeholder="Gesellschaft auswaehlen" />
            </SelectTrigger>
            <SelectContent>
              {funds.map((fund) => (
                <SelectItem key={fund.id} value={fund.id}>
                  {fund.name}
                  {fund.legalForm ? ` (${fund.legalForm})` : ""}
                </SelectItem>
              ))}
              {funds.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Keine Gesellschaften gefunden
                </div>
              )}
            </SelectContent>
          </Select>
        )}
        {errors.fundId && (
          <p id="onb-fund-error" className="text-sm text-destructive">
            {errors.fundId}
          </p>
        )}
      </div>

      {/* Fund info panel */}
      {selectedFund && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Gesellschaft: </span>
              <span className="font-medium">{selectedFund.name}</span>
            </div>
            {selectedFund.legalForm && (
              <div className="text-sm">
                <span className="text-muted-foreground">Rechtsform: </span>
                <span className="font-medium">{selectedFund.legalForm}</span>
              </div>
            )}
            {selectedFund.totalCapital != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Gesamtkapital: </span>
                <span className="font-medium">{formatCurrency(selectedFund.totalCapital)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Participation details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="onb-capitalContribution">
            Kapitalanteil (EUR) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="onb-capitalContribution"
            type="number"
            min="0"
            step="0.01"
            value={data.capitalContribution}
            onChange={(e) => update("capitalContribution", e.target.value)}
            placeholder="z.B. 25000"
            aria-invalid={!!errors.capitalContribution}
            aria-describedby={errors.capitalContribution ? "onb-capital-error" : undefined}
          />
          {errors.capitalContribution && (
            <p id="onb-capital-error" className="text-sm text-destructive">
              {errors.capitalContribution}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-entryDate">
            Beitrittsdatum <span className="text-destructive">*</span>
          </Label>
          <Input
            id="onb-entryDate"
            type="date"
            value={data.entryDate}
            onChange={(e) => update("entryDate", e.target.value)}
            aria-invalid={!!errors.entryDate}
            aria-describedby={errors.entryDate ? "onb-entry-error" : undefined}
          />
          {errors.entryDate && (
            <p id="onb-entry-error" className="text-sm text-destructive">
              {errors.entryDate}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-shareholderNumber">Gesellschafter-Nr. / Kontonummer</Label>
          <Input
            id="onb-shareholderNumber"
            value={data.shareholderNumber}
            onChange={(e) => update("shareholderNumber", e.target.value)}
            placeholder="z.B. KOM-042"
          />
        </div>
      </div>

      {/* Calculated ownership hint */}
      {data.capitalContribution && selectedFund?.totalCapital != null && Number(selectedFund.totalCapital) > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Geschaetzter Anteil: </span>
          <span className="font-mono font-medium">
            {(
              (parseFloat(data.capitalContribution) /
                (Number(selectedFund.totalCapital) + parseFloat(data.capitalContribution))) *
              100
            ).toFixed(2)}
            %
          </span>
          <span className="text-muted-foreground ml-1">
            (wird nach Erstellung automatisch berechnet)
          </span>
        </div>
      )}
    </div>
  );
}
