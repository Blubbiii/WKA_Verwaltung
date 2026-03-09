"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ContactData {
  id: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  contactType: string | null;
  notes: string | null;
}

interface ContactEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData;
  onSaved: () => void;
}

const SALUTATIONS = ["Herr", "Frau", "Firma", "Dr.", "Prof."];
const CONTACT_TYPES = [
  "Gesellschafter",
  "Pächter",
  "Investor",
  "Partner",
  "Dienstleister",
  "Sonstiges",
];

export function ContactEditDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: ContactEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    salutation: contact.salutation ?? "",
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    companyName: contact.companyName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    mobile: contact.mobile ?? "",
    street: contact.street ?? "",
    houseNumber: contact.houseNumber ?? "",
    postalCode: contact.postalCode ?? "",
    city: contact.city ?? "",
    country: contact.country ?? "Deutschland",
    contactType: contact.contactType ?? "",
    notes: contact.notes ?? "",
  });

  // Reset form when contact changes
  useEffect(() => {
    if (open) {
      setForm({
        salutation: contact.salutation ?? "",
        firstName: contact.firstName ?? "",
        lastName: contact.lastName ?? "",
        companyName: contact.companyName ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        mobile: contact.mobile ?? "",
        street: contact.street ?? "",
        houseNumber: contact.houseNumber ?? "",
        postalCode: contact.postalCode ?? "",
        city: contact.city ?? "",
        country: contact.country ?? "Deutschland",
        contactType: contact.contactType ?? "",
        notes: contact.notes ?? "",
      });
    }
  }, [open, contact]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(form)) {
        body[key] = value === "" ? null : value;
      }

      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success("Kontakt aktualisiert");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kontakt bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name Section */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Anrede</Label>
              <Select value={form.salutation || "none"} onValueChange={(v) => update("salutation", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {SALUTATIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vorname</Label>
              <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Nachname</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label>Firma / Organisation</Label>
            <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mobil</Label>
              <Input value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-3">
              <Label>Straße</Label>
              <Input value={form.street} onChange={(e) => update("street", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hausnr.</Label>
              <Input value={form.houseNumber} onChange={(e) => update("houseNumber", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>PLZ</Label>
              <Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Ort</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Land</Label>
              <Input value={form.country} onChange={(e) => update("country", e.target.value)} />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Kontakttyp</Label>
            <Select value={form.contactType || "none"} onValueChange={(v) => update("contactType", v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Typ</SelectItem>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
