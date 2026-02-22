"use client";

import { useState, useEffect } from "react";
import { Loader2, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonData {
  id: string;
  personType: string;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  bankIban?: string | null;
  bankBic?: string | null;
  bankName?: string | null;
}

interface PersonEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: PersonData;
  onSaved: (updated: PersonData) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonEditDialog({
  open,
  onOpenChange,
  person,
  onSaved,
}: PersonEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PersonData>(person);

  // Reset form when person changes or dialog opens
  useEffect(() => {
    if (open) {
      setForm(person);
    }
  }, [open, person]);

  function update(field: keyof PersonData, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    // Basic validation
    if (form.personType === "natural" && !form.lastName?.trim()) {
      toast.error("Nachname ist erforderlich");
      return;
    }
    if (form.personType === "legal" && !form.companyName?.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/persons/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType: form.personType,
          salutation: form.salutation || null,
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          companyName: form.companyName || null,
          email: form.email || null,
          phone: form.phone || null,
          street: form.street || null,
          houseNumber: form.houseNumber || null,
          postalCode: form.postalCode || null,
          city: form.city || null,
          bankIban: form.bankIban || null,
          bankBic: form.bankBic || null,
          bankName: form.bankName || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler" }));
        throw new Error(err.error || "Speichern fehlgeschlagen");
      }

      const updated = await res.json();
      toast.success("Person gespeichert");
      onSaved(updated);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen"
      );
    } finally {
      setSaving(false);
    }
  }

  const isNatural = form.personType === "natural";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isNatural ? (
              <User className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
            Verpächter bearbeiten
          </DialogTitle>
          <DialogDescription>
            Name, Adresse und Bankverbindung ändern
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Person type */}
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select
              value={form.personType}
              onValueChange={(v) => update("personType", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural">Natürliche Person</SelectItem>
                <SelectItem value="legal">Juristische Person</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name fields */}
          {isNatural ? (
            <>
              <div className="space-y-2">
                <Label>Anrede</Label>
                <Select
                  value={form.salutation || "__none__"}
                  onValueChange={(v) =>
                    update("salutation", v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="- Keine -" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">- Keine -</SelectItem>
                    <SelectItem value="Herr">Herr</SelectItem>
                    <SelectItem value="Frau">Frau</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Vorname</Label>
                  <Input
                    value={form.firstName || ""}
                    onChange={(e) => update("firstName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Nachname <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.lastName || ""}
                    onChange={(e) => update("lastName", e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>
                Firmenname <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.companyName || ""}
                onChange={(e) => update("companyName", e.target.value)}
              />
            </div>
          )}

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={form.phone || ""}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-2">
              <Label>Straße</Label>
              <Input
                value={form.street || ""}
                onChange={(e) => update("street", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hausnr.</Label>
              <Input
                value={form.houseNumber || ""}
                onChange={(e) => update("houseNumber", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div className="space-y-2">
              <Label>PLZ</Label>
              <Input
                value={form.postalCode || ""}
                onChange={(e) => update("postalCode", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ort</Label>
              <Input
                value={form.city || ""}
                onChange={(e) => update("city", e.target.value)}
              />
            </div>
          </div>

          {/* Bank details */}
          <div className="space-y-2">
            <Label>IBAN</Label>
            <Input
              value={form.bankIban || ""}
              onChange={(e) => update("bankIban", e.target.value)}
              placeholder="DE..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>BIC</Label>
              <Input
                value={form.bankBic || ""}
                onChange={(e) => update("bankBic", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bank</Label>
              <Input
                value={form.bankName || ""}
                onChange={(e) => update("bankName", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
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
