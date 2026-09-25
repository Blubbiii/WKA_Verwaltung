"use client";

/**
 * Create/edit dialog for vendors. Used by the vendor list and by vendor
 * pickers ("Aus der Auswahl anlegen").
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface Vendor {
  id: string;
  name: string;
  taxId: string | null;
  vatId: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  notes: string | null;
  personId: string | null;
  person: { id: string; firstName: string | null; lastName: string | null; companyName: string | null } | null;
}

const EMPTY_FORM = {
  name: "",
  taxId: "",
  vatId: "",
  iban: "",
  bic: "",
  email: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  notes: "",
};

// ============================================================================
// Vendor Dialog
// ============================================================================

export function VendorDialog({
  open,
  onClose,
  onSaved,
  vendor,
  vorbelegung,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the saved vendor (id and name). */
  onSaved: (gespeichert?: { id: string; name: string }) => void;
  vendor?: Vendor | null;
  /** Name prefill, e.g. the text typed into a vendor picker. */
  vorbelegung?: string;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name,
        taxId: vendor.taxId ?? "",
        vatId: vendor.vatId ?? "",
        iban: vendor.iban ?? "",
        bic: vendor.bic ?? "",
        email: vendor.email ?? "",
        street: vendor.street ?? "",
        postalCode: vendor.postalCode ?? "",
        city: vendor.city ?? "",
        country: vendor.country,
        notes: vendor.notes ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM, name: vorbelegung ?? "" });
    }
  }, [vendor, open, vorbelegung]);

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        taxId: form.taxId || null,
        vatId: form.vatId || null,
        iban: form.iban || null,
        bic: form.bic || null,
        email: form.email || null,
        street: form.street || null,
        postalCode: form.postalCode || null,
        city: form.city || null,
        country: form.country,
        notes: form.notes || null,
      };

      const url = vendor ? `/api/vendors/${vendor.id}` : "/api/vendors";
      const method = vendor ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }

      const gespeichert = await res.json().catch(() => null);
      toast.success(vendor ? "Lieferant aktualisiert" : "Lieferant angelegt");
      onSaved(gespeichert?.id ? { id: gespeichert.id, name: gespeichert.name ?? payload.name } : undefined);
      onClose();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Lieferant bearbeiten" : "Neuer Lieferant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label htmlFor="vendor-name">Name *</Label>
            <Input id="vendor-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vendor-taxId">Steuernummer</Label>
              <Input id="vendor-taxId" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vendor-vatId">USt-IdNr.</Label>
              <Input id="vendor-vatId" value={form.vatId} onChange={(e) => set("vatId", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vendor-iban">IBAN</Label>
              <Input id="vendor-iban" value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="DE..." />
            </div>
            <div>
              <Label htmlFor="vendor-bic">BIC</Label>
              <Input id="vendor-bic" maxLength={11} value={form.bic} onChange={(e) => set("bic", e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="vendor-email">E-Mail</Label>
            <Input id="vendor-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div>
            <Label htmlFor="vendor-street">Straße</Label>
            <Input id="vendor-street" value={form.street} onChange={(e) => set("street", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vendor-postalCode">PLZ</Label>
              <Input id="vendor-postalCode" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vendor-city">Stadt</Label>
              <Input id="vendor-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="vendor-notes">Notizen</Label>
            <Textarea id="vendor-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichere..." : vendor ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
