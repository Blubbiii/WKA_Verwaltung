"use client";

/**
 * P23: Forderungsausfall / EWB / PWB-Dialog (P16).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldX } from "lucide-react";

export interface WriteOffDialogProps {
  invoiceId: string;
  grossAmount: number;
  paidAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function WriteOffDialog({
  invoiceId,
  grossAmount,
  paidAmount,
  open,
  onOpenChange,
  onSuccess,
}: WriteOffDialogProps) {
  const openAmount = Math.max(0, grossAmount - paidAmount);
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<"EWB" | "PWB" | "DIRECT_WRITEOFF">("DIRECT_WRITEOFF");
  const [amount, setAmount] = useState(openAmount.toString());
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [createUStAdjustment, setCreateUStAdjustment] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (reason.trim().length < 3) {
      toast.error("Begründung ist Pflicht (mindestens 3 Zeichen)");
      return;
    }
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
      toast.error("Bitte gültigen Betrag eingeben");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/write-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: num,
          reason: reason.trim(),
          effectiveDate: new Date(effectiveDate).toISOString(),
          createUStAdjustment: type === "DIRECT_WRITEOFF" ? createUStAdjustment : false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Wertberichtigung fehlgeschlagen");
      }
      toast.success(
        type === "DIRECT_WRITEOFF"
          ? "Forderung ausgebucht — Rechnung WRITTEN_OFF"
          : `${type} angelegt`,
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldX className="h-5 w-5" />
            Wertberichtigung / Forderungsausfall
          </DialogTitle>
          <DialogDescription>
            EWB/PWB §253 HGB oder direkter Forderungsausfall §17 UStG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Alert>
            <AlertDescription>
              <div className="grid grid-cols-3 gap-2 text-sm font-mono">
                <div>
                  <span className="text-muted-foreground">Brutto:</span>{" "}
                  {formatEur(grossAmount)} €
                </div>
                <div>
                  <span className="text-muted-foreground">Bezahlt:</span>{" "}
                  {formatEur(paidAmount)} €
                </div>
                <div>
                  <span className="text-muted-foreground">Offen:</span>{" "}
                  <strong>{formatEur(openAmount)} €</strong>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Art der Wertberichtigung</Label>
            <Select
              value={type}
              onValueChange={(v) =>
                setType(v as "EWB" | "PWB" | "DIRECT_WRITEOFF")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT_WRITEOFF">
                  Direkter Forderungsausfall §17 UStG
                </SelectItem>
                <SelectItem value="EWB">
                  EWB Einzelwertberichtigung §253 HGB
                </SelectItem>
                <SelectItem value="PWB">
                  PWB Pauschalwertberichtigung §253 HGB
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {type === "DIRECT_WRITEOFF" &&
                "Endgültige Ausbuchung — Status wird WRITTEN_OFF."}
              {type === "EWB" &&
                "Zweifelhafte Forderung — Status bleibt, nur Risikovorsorge."}
              {type === "PWB" &&
                "Pauschal-Risikovorsorge — Status bleibt, USt unberührt."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Betrag (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Wirksamkeitsdatum</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Begründung *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='z.B. "Insolvenzverfahren eröffnet 15.05.2026"'
              rows={3}
            />
          </div>

          {type === "DIRECT_WRITEOFF" && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="ust" className="text-base">
                  §17 UStG-Korrektur erzeugen
                </Label>
                <p className="text-xs text-muted-foreground">
                  Bucht automatisch eine USt-Korrektur (Vorsteuer-Erstattung).
                </p>
              </div>
              <Switch
                id="ust"
                checked={createUStAdjustment}
                onCheckedChange={setCreateUStAdjustment}
              />
            </div>
          )}

          {type === "DIRECT_WRITEOFF" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Endgültige Ausbuchung</AlertTitle>
              <AlertDescription>
                Dieser Vorgang kann nicht rückgängig gemacht werden (nur per
                Storno). Die Rechnung wird auf Status WRITTEN_OFF gesetzt.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Abbrechen
          </Button>
          <Button
            variant={type === "DIRECT_WRITEOFF" ? "destructive" : "default"}
            onClick={() => void handleSave()}
            disabled={isSaving || reason.trim().length < 3}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldX className="mr-2 h-4 w-4" />
            )}
            Buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
