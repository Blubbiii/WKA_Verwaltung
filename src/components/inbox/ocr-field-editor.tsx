"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { VendorAutocomplete } from "./vendor-autocomplete";

interface InvoiceFields {
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  vendorId: string | null;
  vendorName: string | null;
  vendorNameFallback: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  grossAmount: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  iban: string | null;
  bic: string | null;
  paymentReference: string | null;
  recipientFundId: string | null;
  datevAccount: string | null;
  notes: string | null;
  ocrStatus: string;
}

interface OcrFieldEditorProps {
  invoiceId: string;
  fields: InvoiceFields;
  onSaved?: (updated: Partial<InvoiceFields>) => void;
  disabled?: boolean;
}

const OCR_STATUS_LABEL: Record<string, string> = {
  PENDING: "OCR ausstehend",
  PROCESSING: "OCR läuft...",
  DONE: "OCR abgeschlossen",
  FAILED: "OCR fehlgeschlagen",
};

export function OcrFieldEditor({ invoiceId, fields, onSaved, disabled }: OcrFieldEditorProps) {
  const [form, setForm] = useState<InvoiceFields>({ ...fields });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof InvoiceFields, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        invoiceType: form.invoiceType,
        vendorId: form.vendorId,
        vendorNameFallback: form.vendorNameFallback,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate,
        grossAmount: form.grossAmount,
        netAmount: form.netAmount,
        vatAmount: form.vatAmount,
        vatRate: form.vatRate,
        iban: form.iban,
        bic: form.bic,
        paymentReference: form.paymentReference,
        recipientFundId: form.recipientFundId,
        datevAccount: form.datevAccount,
        notes: form.notes,
      };

      const res = await fetch(`/api/inbox/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }

      toast.success("Felder gespeichert");
      onSaved?.(form);
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const toDateInputValue = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };

  const toIso = (dateStr: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toISOString();
  };

  return (
    <div className="space-y-4">
      {/* OCR Status */}
      <div className="flex items-center gap-2">
        <Badge variant={form.ocrStatus === "DONE" ? "default" : form.ocrStatus === "FAILED" ? "destructive" : "secondary"}>
          {OCR_STATUS_LABEL[form.ocrStatus] ?? form.ocrStatus}
        </Badge>
      </div>

      {/* Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Typ</Label>
          <Select
            value={form.invoiceType}
            onValueChange={(v) => set("invoiceType", v)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INVOICE">Rechnung</SelectItem>
              <SelectItem value="CREDIT_NOTE">Gutschrift</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Rechnungsnummer</Label>
          <Input
            value={form.invoiceNumber ?? ""}
            onChange={(e) => set("invoiceNumber", e.target.value || null)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Vendor */}
      <div>
        <Label>Lieferant</Label>
        <VendorAutocomplete
          value={form.vendorId}
          vendorName={form.vendorName}
          onChange={(id, meta) => {
            set("vendorId", id);
            if (meta?.name) set("vendorName", meta.name);
            if (!form.iban && meta?.iban) set("iban", meta.iban);
            if (!form.bic && meta?.bic) set("bic", meta.bic);
          }}
          disabled={disabled}
        />
        {!form.vendorId && (
          <div className="mt-1">
            <Input
              placeholder="Lieferantenname (manuell)"
              value={form.vendorNameFallback ?? ""}
              onChange={(e) => set("vendorNameFallback", e.target.value || null)}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rechnungsdatum</Label>
          <Input
            type="date"
            value={toDateInputValue(form.invoiceDate)}
            onChange={(e) => set("invoiceDate", toIso(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Fälligkeitsdatum</Label>
          <Input
            type="date"
            value={toDateInputValue(form.dueDate)}
            onChange={(e) => set("dueDate", toIso(e.target.value))}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Netto €</Label>
          <Input
            type="number"
            step="0.01"
            value={form.netAmount ?? ""}
            onChange={(e) => set("netAmount", e.target.value ? parseFloat(e.target.value) : null)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>MwSt €</Label>
          <Input
            type="number"
            step="0.01"
            value={form.vatAmount ?? ""}
            onChange={(e) => set("vatAmount", e.target.value ? parseFloat(e.target.value) : null)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Brutto €</Label>
          <Input
            type="number"
            step="0.01"
            value={form.grossAmount ?? ""}
            onChange={(e) => set("grossAmount", e.target.value ? parseFloat(e.target.value) : null)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* IBAN / BIC */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>IBAN</Label>
          <Input
            value={form.iban ?? ""}
            onChange={(e) => set("iban", e.target.value || null)}
            disabled={disabled}
            placeholder="DE..."
          />
        </div>
        <div>
          <Label>BIC</Label>
          <Input
            value={form.bic ?? ""}
            onChange={(e) => set("bic", e.target.value || null)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Payment reference */}
      <div>
        <Label>Verwendungszweck</Label>
        <Input
          value={form.paymentReference ?? ""}
          onChange={(e) => set("paymentReference", e.target.value || null)}
          disabled={disabled}
          maxLength={140}
        />
      </div>

      {/* DATEV account */}
      <div>
        <Label>DATEV-Aufwandskonto</Label>
        <Input
          value={form.datevAccount ?? ""}
          onChange={(e) => set("datevAccount", e.target.value || null)}
          disabled={disabled}
          placeholder="z.B. 4980"
        />
      </div>

      {/* Notes */}
      <div>
        <Label>Notizen</Label>
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          disabled={disabled}
          rows={2}
        />
      </div>

      {!disabled && (
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Speichere..." : "Felder speichern"}
        </Button>
      )}
    </div>
  );
}
