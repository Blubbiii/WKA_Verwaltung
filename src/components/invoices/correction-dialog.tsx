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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowRight, Pencil } from "lucide-react";
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

interface CorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  onSuccess: (creditNoteId: string, correctionInvoiceId: string) => void;
}

const taxTypeLabels: Record<string, string> = {
  STANDARD: "19% MwSt",
  REDUCED: "7% MwSt",
  EXEMPT: "Steuerfrei",
};

const taxRates: Record<string, number> = {
  STANDARD: 19,
  REDUCED: 7,
  EXEMPT: 0,
};

interface EditedPosition {
  editing: boolean;
  description: string;
  quantity: string;
  unitPrice: string;
  taxType: string;
}

export function CorrectionDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  items,
  onSuccess,
}: CorrectionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [editedPositions, setEditedPositions] = useState<EditedPosition[]>(
    items.map((item) => ({
      editing: false,
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      taxType: item.taxType,
    }))
  );

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEditedPositions(
        items.map((item) => ({
          editing: false,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          taxType: item.taxType,
        }))
      );
      setReason("");
    }
    onOpenChange(newOpen);
  };

  const toggleEditing = (index: number) => {
    setEditedPositions((prev) => {
      const updated = [...prev];
      if (updated[index].editing) {
        // Reset to original values when toggling off
        const item = items[index];
        updated[index] = {
          editing: false,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          taxType: item.taxType,
        };
      } else {
        updated[index] = { ...updated[index], editing: true };
      }
      return updated;
    });
  };

  const updateField = (
    index: number,
    field: keyof EditedPosition,
    value: string
  ) => {
    setEditedPositions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Calculate preview of changes
  const preview = useMemo(() => {
    const changedPositions: Array<{
      index: number;
      originalItem: InvoiceItem;
      newDescription: string;
      newQuantity: number;
      newUnitPrice: number;
      newTaxType: string;
      newTaxRate: number;
      originalNet: number;
      newNet: number;
      originalGross: number;
      newGross: number;
      difference: number;
    }> = [];

    for (let i = 0; i < editedPositions.length; i++) {
      const pos = editedPositions[i];
      if (!pos.editing) continue;

      const item = items[i];
      const newQty = parseFloat(pos.quantity);
      const newPrice = parseFloat(pos.unitPrice);
      const newTaxType = pos.taxType;

      if (isNaN(newQty) || newQty <= 0 || isNaN(newPrice) || newPrice < 0) continue;

      // Check if anything actually changed
      const descChanged = pos.description !== item.description;
      const qtyChanged = newQty !== item.quantity;
      const priceChanged = newPrice !== item.unitPrice;
      const taxChanged = newTaxType !== item.taxType;

      if (!descChanged && !qtyChanged && !priceChanged && !taxChanged) continue;

      const newTaxRate = taxRates[newTaxType] || 19;
      const newNet = Math.round(newQty * newPrice * 100) / 100;
      const newTax = Math.round(newNet * (newTaxRate / 100) * 100) / 100;
      const newGross = Math.round((newNet + newTax) * 100) / 100;

      const originalNet = Number(item.netAmount);
      const originalGross = Number(item.grossAmount);

      changedPositions.push({
        index: i,
        originalItem: item,
        newDescription: pos.description,
        newQuantity: newQty,
        newUnitPrice: newPrice,
        newTaxType,
        newTaxRate,
        originalNet,
        newNet,
        originalGross,
        newGross,
        difference: Math.round((newGross - originalGross) * 100) / 100,
      });
    }

    const totalDifference = changedPositions.reduce(
      (sum, p) => sum + p.difference,
      0
    );

    return {
      changedPositions,
      totalDifference: Math.round(totalDifference * 100) / 100,
      hasChanges: changedPositions.length > 0,
    };
  }, [editedPositions, items]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Bitte geben Sie einen Korrekturgrund an");
      return;
    }

    if (!preview.hasChanges) {
      toast.error("Keine Aenderungen vorgenommen");
      return;
    }

    try {
      setLoading(true);

      const corrections = preview.changedPositions.map((cp) => {
        const result: Record<string, unknown> = {
          originalIndex: cp.index,
        };
        if (cp.newDescription !== cp.originalItem.description) {
          result.newDescription = cp.newDescription;
        }
        if (cp.newQuantity !== cp.originalItem.quantity) {
          result.newQuantity = cp.newQuantity;
        }
        if (cp.newUnitPrice !== cp.originalItem.unitPrice) {
          result.newUnitPrice = cp.newUnitPrice;
        }
        if (cp.newTaxType !== cp.originalItem.taxType) {
          result.newTaxType = cp.newTaxType;
        }
        return result;
      });

      const response = await fetch(`/api/invoices/${invoiceId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CORRECTION",
          corrections,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen der Korrektur");
      }

      const result = await response.json();
      toast.success("Korrektur erstellt");
      onOpenChange(false);
      onSuccess(result.creditNote.id, result.correctionInvoice.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen der Korrektur"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Korrektur erstellen</DialogTitle>
          <DialogDescription>
            Erstellen Sie eine Rechnungskorrektur fuer {invoiceNumber}. Klicken Sie auf
            das Bearbeiten-Symbol bei den zu korrigierenden Positionen und aendern Sie die Werte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Positions table with inline editing */}
          <div>
            <Label className="text-sm font-medium">Positionen bearbeiten</Label>
            <div className="mt-2 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-12">Pos.</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right w-24">Menge</TableHead>
                    <TableHead className="text-right w-28">Einzelpreis</TableHead>
                    <TableHead className="w-28">MwSt</TableHead>
                    <TableHead className="text-right w-24">Netto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const pos = editedPositions[index];
                    const isEditing = pos.editing;
                    const newQty = parseFloat(pos.quantity);
                    const newPrice = parseFloat(pos.unitPrice);
                    const newTaxRate = taxRates[pos.taxType] || 19;
                    const newNet =
                      isEditing && !isNaN(newQty) && !isNaN(newPrice)
                        ? Math.round(newQty * newPrice * 100) / 100
                        : item.netAmount;

                    return (
                      <TableRow
                        key={item.id}
                        className={isEditing ? "bg-blue-50" : ""}
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleEditing(index)}
                          >
                            <Pencil
                              className={`h-3.5 w-3.5 ${isEditing ? "text-blue-600" : "text-muted-foreground"}`}
                            />
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{item.position}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={pos.description}
                              onChange={(e) =>
                                updateField(index, "description", e.target.value)
                              }
                              className="h-8 text-sm"
                            />
                          ) : (
                            <span className="text-sm">{item.description}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={pos.quantity}
                              onChange={(e) =>
                                updateField(index, "quantity", e.target.value)
                              }
                              className="h-8 w-24 text-right"
                            />
                          ) : (
                            <span>{item.quantity}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={pos.unitPrice}
                              onChange={(e) =>
                                updateField(index, "unitPrice", e.target.value)
                              }
                              className="h-8 w-28 text-right"
                            />
                          ) : (
                            <span>{formatCurrency(item.unitPrice)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={pos.taxType}
                              onValueChange={(v) =>
                                updateField(index, "taxType", v)
                              }
                            >
                              <SelectTrigger className="h-8 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="STANDARD">19%</SelectItem>
                                <SelectItem value="REDUCED">7%</SelectItem>
                                <SelectItem value="EXEMPT">0%</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {taxTypeLabels[item.taxType] || `${item.taxRate}%`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {isEditing ? (
                            <span
                              className={
                                newNet !== item.netAmount
                                  ? "text-blue-600"
                                  : ""
                              }
                            >
                              {formatCurrency(newNet)}
                            </span>
                          ) : (
                            formatCurrency(item.netAmount)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Preview of changes */}
          {preview.hasChanges && (
            <div className="bg-muted/50 p-4 rounded-md space-y-4">
              <Label className="text-sm font-medium">Vorschau der Korrekturen</Label>
              <div className="space-y-3">
                {preview.changedPositions.map((cp) => (
                  <div
                    key={cp.index}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Badge variant="outline">Pos. {cp.originalItem.position}</Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground line-through">
                        {formatCurrency(cp.originalGross)}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{formatCurrency(cp.newGross)}</span>
                    </div>
                    <span
                      className={
                        cp.difference > 0
                          ? "text-green-600"
                          : cp.difference < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }
                    >
                      ({cp.difference > 0 ? "+" : ""}
                      {formatCurrency(cp.difference)})
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Gesamtdifferenz (Brutto):</span>
                <span
                  className={`text-lg font-bold ${
                    preview.totalDifference > 0
                      ? "text-green-600"
                      : preview.totalDifference < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {preview.totalDifference > 0 ? "+" : ""}
                  {formatCurrency(preview.totalDifference)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Es werden zwei Dokumente erstellt: Eine Korrekturgutschrift (negativer Betrag fuer die
                alten Werte) und eine Korrekturrechnung (neuer Betrag mit den korrigierten Werten).
              </p>
            </div>
          )}

          <Separator />

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="correctionReason">Korrekturgrund *</Label>
            <Textarea
              id="correctionReason"
              placeholder="z.B. Falscher Einzelpreis, Beschreibung korrigiert"
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
            onClick={handleSubmit}
            disabled={loading || !preview.hasChanges || !reason.trim()}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Korrektur erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
