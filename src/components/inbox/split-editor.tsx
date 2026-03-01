"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Split {
  id?: string;
  fundId: string;
  fundName?: string;
  splitPercent: number | null;
  splitAmount: number | null;
  description: string;
  datevAccount: string;
  outgoingInvoiceId?: string | null;
}

interface Fund {
  id: string;
  name: string;
}

interface SplitEditorProps {
  invoiceId: string;
  grossAmount: number | null;
  initialSplits: Split[];
  onSaved?: () => void;
  disabled?: boolean;
}

export function SplitEditor({
  invoiceId,
  grossAmount,
  initialSplits,
  onSaved,
  disabled,
}: SplitEditorProps) {
  const [splits, setSplits] = useState<Split[]>(initialSplits);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/funds?limit=200")
      .then((r) => r.json())
      .then((data) => setFunds(data.data ?? []))
      .catch(() => {});
  }, []);

  const totalPercent = splits.reduce((s, sp) => s + (sp.splitPercent ?? 0), 0);
  const totalAmount = splits.reduce((s, sp) => s + (sp.splitAmount ?? 0), 0);

  const addSplit = () => {
    setSplits((prev) => [
      ...prev,
      { fundId: "", splitPercent: null, splitAmount: null, description: "", datevAccount: "" },
    ]);
  };

  const removeSplit = (idx: number) => {
    setSplits((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSplit = (idx: number, field: keyof Split, value: unknown) => {
    setSplits((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const save = async () => {
    if (splits.some((s) => !s.fundId)) {
      toast.error("Bitte für jeden Split einen Fonds auswählen");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/inbox/${invoiceId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splits: splits.map((s) => ({
            fundId: s.fundId,
            splitPercent: s.splitPercent,
            splitAmount: s.splitAmount,
            description: s.description || null,
            datevAccount: s.datevAccount || null,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("Splits gespeichert");
      onSaved?.();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const generateInvoices = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/inbox/${invoiceId}/generate-invoices`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      const data = await res.json();
      toast.success(`${data.created?.length ?? 0} Ausgangsrechnung(en) erzeugt`);
      onSaved?.();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setGenerating(false);
    }
  };

  const hasUnsavedSplits = splits.some((s) => !s.id);
  const hasSplits = splits.length > 0;

  return (
    <div className="space-y-3">
      {splits.map((split, idx) => {
        const hasOutgoing = !!split.outgoingInvoiceId;
        return (
          <div key={idx} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={split.fundId}
                onValueChange={(v) => updateSplit(idx, "fundId", v)}
                disabled={disabled || hasOutgoing}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Fonds auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!disabled && !hasOutgoing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  onClick={() => removeSplit(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}

              {hasOutgoing && (
                <span className="text-xs text-muted-foreground shrink-0">Rechnung erzeugt</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Anteil %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="z.B. 60"
                  value={split.splitPercent ?? ""}
                  onChange={(e) =>
                    updateSplit(
                      idx,
                      "splitPercent",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  disabled={disabled || hasOutgoing}
                />
              </div>
              <div>
                <Label className="text-xs">Betrag €</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="z.B. 1200.00"
                  value={split.splitAmount ?? ""}
                  onChange={(e) =>
                    updateSplit(
                      idx,
                      "splitAmount",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  disabled={disabled || hasOutgoing}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Beschreibung</Label>
                <Input
                  placeholder="Optional"
                  value={split.description}
                  onChange={(e) => updateSplit(idx, "description", e.target.value)}
                  disabled={disabled || hasOutgoing}
                />
              </div>
              <div>
                <Label className="text-xs">DATEV-Konto</Label>
                <Input
                  placeholder="z.B. 4950"
                  value={split.datevAccount}
                  onChange={(e) => updateSplit(idx, "datevAccount", e.target.value)}
                  disabled={disabled || hasOutgoing}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Totals */}
      {splits.length > 1 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {splits.some((s) => s.splitPercent !== null) && (
            <div className={totalPercent !== 100 ? "text-destructive" : ""}>
              Gesamt: {totalPercent.toFixed(2)}%
              {totalPercent !== 100 && (
                <span className="ml-1 inline-flex items-center gap-0.5">
                  <AlertCircle className="h-3 w-3" /> (erwartet 100%)
                </span>
              )}
            </div>
          )}
          {splits.some((s) => s.splitAmount !== null) && grossAmount !== null && (
            <div className={Math.abs(totalAmount - grossAmount) > 0.01 ? "text-destructive" : ""}>
              Gesamt: {totalAmount.toFixed(2)} € (Brutto: {grossAmount.toFixed(2)} €)
            </div>
          )}
        </div>
      )}

      {!disabled && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={addSplit} type="button">
            <Plus className="h-4 w-4 mr-1" />
            Split hinzufügen
          </Button>

          {hasSplits && (
            <Button
              size="sm"
              onClick={save}
              disabled={saving || !hasSplits}
              type="button"
            >
              {saving ? "Speichere..." : "Splits speichern"}
            </Button>
          )}

          {hasSplits && !hasUnsavedSplits && (
            <Button
              variant="secondary"
              size="sm"
              onClick={generateInvoices}
              disabled={generating}
              type="button"
            >
              {generating ? "Erzeugt..." : "Ausgangsrechnungen erzeugen"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
