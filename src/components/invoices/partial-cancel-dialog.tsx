"use client";

import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

interface InvoiceItem {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  netAmount: number;
  taxType: string;
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
}

interface PartialCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  onSuccess: (creditNoteId: string) => void;
}

const taxTypeLabels: Record<string, string> = {
  STANDARD: "19%",
  REDUCED: "7%",
  EXEMPT: "0%",
};

interface SelectedPosition {
  selected: boolean;
  cancelQuantity: string; // String for input handling
}

export function PartialCancelDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  items,
  onSuccess,
}: PartialCancelDialogProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [positions, setPositions] = useState<SelectedPosition[]>(
    items.map((item) => ({
      selected: false,
      cancelQuantity: String(item.quantity),
    }))
  );

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setPositions(
        items.map((item) => ({
          selected: false,
          cancelQuantity: String(item.quantity),
        }))
      );
      setReason("");
    }
    onOpenChange(newOpen);
  };

  const togglePosition = (index: number) => {
    setPositions((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        selected: !updated[index].selected,
      };
      return updated;
    });
  };

  const updateQuantity = (index: number, value: string) => {
    setPositions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], cancelQuantity: value };
      return updated;
    });
  };

  // Calculate preview amounts
  const preview = useMemo(() => {
    let totalNet = 0;
    let totalTax = 0;
    let totalGross = 0;
    let validationError: string | null = null;

    const selectedItems: Array<{
      index: number;
      item: InvoiceItem;
      cancelQty: number;
      cancelNet: number;
      cancelTax: number;
      cancelGross: number;
    }> = [];

    for (let i = 0; i < positions.length; i++) {
      if (!positions[i].selected) continue;

      const item = items[i];
      const cancelQty = parseFloat(positions[i].cancelQuantity);

      if (isNaN(cancelQty) || cancelQty <= 0) {
        validationError = `Position ${item.position}: Ungueltige Menge`;
        continue;
      }

      if (cancelQty > item.quantity) {
        validationError = `Position ${item.position}: Menge (${cancelQty}) uebersteigt Original (${item.quantity})`;
        continue;
      }

      const cancelNet = Math.round(cancelQty * Math.abs(item.unitPrice) * 100) / 100;
      const taxRate = item.taxRate;
      const cancelTax = Math.round(cancelNet * (taxRate / 100) * 100) / 100;
      const cancelGross = Math.round((cancelNet + cancelTax) * 100) / 100;

      totalNet += cancelNet;
      totalTax += cancelTax;
      totalGross += cancelGross;

      selectedItems.push({
        index: i,
        item,
        cancelQty,
        cancelNet,
        cancelTax,
        cancelGross,
      });
    }

    return {
      selectedItems,
      totalNet: Math.round(totalNet * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
      validationError,
      hasSelection: selectedItems.length > 0,
      isFullCancel:
        selectedItems.length === items.length &&
        selectedItems.every((si) => si.cancelQty === si.item.quantity),
    };
  }, [positions, items]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Bitte geben Sie einen Storno-Grund an");
      return;
    }

    if (!preview.hasSelection) {
      toast.error("Bitte waehlen Sie mindestens eine Position aus");
      return;
    }

    if (preview.validationError) {
      toast.error(preview.validationError);
      return;
    }

    if (preview.isFullCancel) {
      toast.error(
        "Alle Positionen mit voller Menge ausgewaehlt. Bitte nutzen Sie die Vollstornierung."
      );
      return;
    }

    try {
      setLoading(true);

      const requestPositions = preview.selectedItems.map((si) => ({
        originalIndex: si.index,
        cancelQuantity:
          si.cancelQty === si.item.quantity ? undefined : si.cancelQty,
      }));

      const response = await fetch(`/api/invoices/${invoiceId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PARTIAL_CANCEL",
          positions: requestPositions,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen der Teilstornierung");
      }

      const result = await response.json();
      toast.success("Teilstorno erstellt");
      onOpenChange(false);
      onSuccess(result.creditNote.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen der Teilstornierung"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Teilstorno erstellen</DialogTitle>
          <DialogDescription>
            Erstellen Sie eine Teilstornierung fuer {invoiceNumber}. Waehlen Sie die
            zu stornierenden Positionen und optional eine reduzierte Menge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Positions table with checkboxes */}
          <div>
            <Label className="text-sm font-medium">Positionen auswaehlen</Label>
            <div className="mt-2 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-12">Pos.</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right w-24">Orig. Menge</TableHead>
                    <TableHead className="text-right w-32">Storno-Menge</TableHead>
                    <TableHead className="text-right w-24">Einzelpreis</TableHead>
                    <TableHead className="w-16">MwSt</TableHead>
                    <TableHead className="text-right w-28">Storno-Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const pos = positions[index];
                    const cancelQty = parseFloat(pos.cancelQuantity);
                    const isValid = !isNaN(cancelQty) && cancelQty > 0 && cancelQty <= item.quantity;
                    const cancelNet =
                      pos.selected && isValid
                        ? Math.round(cancelQty * Math.abs(item.unitPrice) * 100) / 100
                        : 0;

                    return (
                      <TableRow
                        key={item.id}
                        className={pos.selected ? "bg-muted/50" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={pos.selected}
                            onCheckedChange={() => togglePosition(index)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.position}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {pos.selected ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={item.quantity}
                              value={pos.cancelQuantity}
                              onChange={(e) => updateQuantity(index, e.target.value)}
                              className="h-8 w-24 text-right"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {taxTypeLabels[item.taxType] || `${item.taxRate}%`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {pos.selected ? (
                            <span className="text-red-600">
                              -{formatCurrency(cancelNet)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Validation warning */}
          {preview.validationError && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{preview.validationError}</span>
            </div>
          )}

          {/* Full cancel warning */}
          {preview.isFullCancel && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                Alle Positionen mit voller Menge ausgewaehlt. Bitte nutzen Sie die Vollstornierung.
              </span>
            </div>
          )}

          {/* Preview summary */}
          {preview.hasSelection && !preview.isFullCancel && (
            <div className="bg-muted/50 p-4 rounded-md space-y-2">
              <Label className="text-sm font-medium">Vorschau Teilstorno-Gutschrift</Label>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Netto:</span>
                  <span className="ml-2 font-medium text-red-600">
                    -{formatCurrency(preview.totalNet)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">MwSt:</span>
                  <span className="ml-2 font-medium text-red-600">
                    -{formatCurrency(preview.totalTax)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Brutto:</span>
                  <span className="ml-2 font-bold text-red-600">
                    -{formatCurrency(preview.totalGross)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="partialCancelReason">Storno-Grund *</Label>
            <Textarea
              id="partialCancelReason"
              placeholder="z.B. Falsche Menge berechnet, Position nicht erbracht"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={
              loading ||
              !preview.hasSelection ||
              !reason.trim() ||
              !!preview.validationError ||
              preview.isFullCancel
            }
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Teilstorno erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
