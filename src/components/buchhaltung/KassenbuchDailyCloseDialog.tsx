"use client";

/**
 * P26.2 UI: Kassensturz §146 AO Dialog.
 *
 * Trigger den Tagesabschluss + alle Einträge des Tages werden festgeschrieben.
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";

export interface KassenbuchDailyCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vorgeschlagenes Schlussdatum (default: heute). */
  initialDate?: string;
  /** Letzter rechnerischer Saldo des Tages (Anzeige). */
  computedBalance: number;
  onSuccess?: () => void;
}

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function KassenbuchDailyCloseDialog({
  open,
  onOpenChange,
  initialDate,
  computedBalance,
  onSuccess,
}: KassenbuchDailyCloseDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [closeDate, setCloseDate] = useState(initialDate ?? today);
  const [countedBalance, setCountedBalance] = useState(
    computedBalance.toFixed(2),
  );
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const counted = Number(countedBalance);
  const difference = !isNaN(counted) ? counted - computedBalance : 0;
  const hasDifference = Math.abs(difference) > 0.005;
  const notesValid = !hasDifference || notes.trim().length >= 3;

  const handleSave = async () => {
    if (!notesValid) {
      toast.error("Begründung ist bei Differenz Pflicht");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/buchhaltung/kassenbuch/daily-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closeDate,
          countedBalance: counted,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Tagesabschluss fehlgeschlagen");
      }
      toast.success(`Kassenbuch ${closeDate} abgeschlossen`);
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
            <Lock className="h-5 w-5" />
            Kassensturz / Tagesabschluss
          </DialogTitle>
          <DialogDescription>
            §146 AO — Tatsächlich gezählten Bargeldbestand erfassen. Nach
            Abschluss werden alle Einträge des Tages festgeschrieben.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Stichtag</Label>
            <Input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rechnerischer Saldo</Label>
              <Input
                value={formatEur(computedBalance)}
                disabled
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Gezählt (Ist)</Label>
              <Input
                type="number"
                step="0.01"
                value={countedBalance}
                onChange={(e) => setCountedBalance(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <Alert
            variant={hasDifference ? "destructive" : "default"}
            className={!hasDifference ? "bg-green-50/50 dark:bg-green-950/10 border-green-200" : ""}
          >
            {hasDifference ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              Differenz: {difference > 0 ? "+" : ""}
              {formatEur(difference)} €
            </AlertTitle>
            <AlertDescription>
              {hasDifference
                ? "Begründung ist Pflicht (z.B. fehlender Beleg, Wechselgeld-Differenz)"
                : "Bestand stimmt mit Rechnung überein."}
            </AlertDescription>
          </Alert>

          {hasDifference && (
            <div className="space-y-2">
              <Label>
                Begründung *{" "}
                <span className="text-xs text-muted-foreground">
                  (min. 3 Zeichen)
                </span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="z.B. Wechselgeld 0,50 € fehlt — wird morgen korrigiert"
              />
            </div>
          )}

          {!hasDifference && (
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="z.B. Tagesabschluss durch Buchhalter"
              />
            </div>
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
            onClick={() => void handleSave()}
            disabled={isSaving || !notesValid}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            Abschließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
