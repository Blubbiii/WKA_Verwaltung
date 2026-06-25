"use client";

/**
 * P23: Teilzahlungs-Dialog für Invoice-Detail-View.
 *
 * Nutzt POST /api/invoices/[id]/payments (P16).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CreditCard, Info, Loader2 } from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

export interface PaymentDialogProps {
  invoiceId: string;
  grossAmount: number;
  paidAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PaymentDialog({
  invoiceId,
  grossAmount,
  paidAmount,
  open,
  onOpenChange,
  onSuccess,
}: PaymentDialogProps) {
  const openAmount = Math.max(0, grossAmount - paidAmount);
  const today = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState(openAmount.toString());
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<"BANK" | "CASH" | "SEPA" | "OTHER">("BANK");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
      toast.error("Bitte gültigen Betrag eingeben");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: num,
          paymentDate: new Date(paymentDate).toISOString(),
          paymentMethod,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Zahlung konnte nicht erfasst werden");
      }
      const json = await res.json();
      const result = json.data ?? json;
      toast.success(
        result.isFullyPaid
          ? "Rechnung vollständig bezahlt"
          : `Teilzahlung erfasst (${formatEur(result.newPaidAmount)} € von ${formatEur(grossAmount)} €)`,
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
            <CreditCard className="h-5 w-5" />
            Zahlung erfassen
          </DialogTitle>
          <DialogDescription>
            Teil- oder Vollzahlung — bei Vollzahlung wird der Status auf PAID
            gesetzt, sonst PARTIALLY_PAID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Alert>
            <Info className="h-4 w-4" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Betrag (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={openAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Zahlungsdatum</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Zahlungsart</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as "BANK" | "CASH" | "SEPA" | "OTHER")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK">Banküberweisung</SelectItem>
                <SelectItem value="CASH">Bargeld</SelectItem>
                <SelectItem value="SEPA">SEPA-Lastschrift</SelectItem>
                <SelectItem value="OTHER">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notizen (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Verwendungszweck oder Bank-Referenz"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Abbrechen
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Erfassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
