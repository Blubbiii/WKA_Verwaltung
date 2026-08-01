"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  // A3: Kapitalertragsteuer-Merkmale. Sie standen bisher nur als Vorgabe für
  // die ganze Ausschüttung zur Verfügung — hier werden sie je Person gepflegt.
  churchTaxLiable?: boolean;
  churchTaxRate?: string | number | null;
  exemptionOrderEur?: string | number | null;
}

interface ContactEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData;
  onSaved: () => void;
}

const SALUTATIONS = ["Herr", "Frau", "Firma", "Dr.", "Prof."] as const;
const CONTACT_TYPE_KEYS = [
  "Gesellschafter",
  "Pächter",
  "Investor",
  "Partner",
  "Dienstleister",
  "Sonstiges",
] as const;

export function ContactEditDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: ContactEditDialogProps) {
  const t = useTranslations("crm.contactEdit");
  const tDetail = useTranslations("crm.detail");
  const tCommon = useTranslations("common");
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
    churchTaxLiable: contact.churchTaxLiable ?? false,
    churchTaxRate:
      contact.churchTaxRate === null || contact.churchTaxRate === undefined
        ? ""
        : String(contact.churchTaxRate),
    exemptionOrderEur:
      contact.exemptionOrderEur === null || contact.exemptionOrderEur === undefined
        ? ""
        : String(contact.exemptionOrderEur),
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
        churchTaxLiable: contact.churchTaxLiable ?? false,
        churchTaxRate:
          contact.churchTaxRate === null || contact.churchTaxRate === undefined
            ? ""
            : String(contact.churchTaxRate),
        exemptionOrderEur:
          contact.exemptionOrderEur === null || contact.exemptionOrderEur === undefined
            ? ""
            : String(contact.exemptionOrderEur),
      });
    }
  }, [open, contact]);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(form)) {
        // Zahlfelder gehen als Zahl heraus, nicht als Text — sonst weist die
        // Zod-Pruefung sie ab. Leer heisst NICHT ERFASST und damit null; das
        // ist ein anderer Zustand als der Wert 0 (siehe schema.prisma).
        if (key === "churchTaxRate" || key === "exemptionOrderEur") {
          body[key] = value === "" ? null : Number(value);
          continue;
        }
        if (typeof value === "boolean") {
          body[key] = value;
          continue;
        }
        body[key] = value === "" ? null : value;
      }

      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("saveError"));
      }

      toast.success(t("saveSuccess"));
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name Section */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>{t("salutationLabel")}</Label>
              <Select
                value={form.salutation || "none"}
                onValueChange={(v) =>
                  update("salutation", v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {SALUTATIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("firstNameLabel")}</Label>
              <Input
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("lastNameLabel")}</Label>
              <Input
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </div>
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label>{t("companyNameLabel")}</Label>
            <Input
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
            />
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("emailLabel")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phoneLabel")}</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("mobileLabel")}</Label>
              <Input
                value={form.mobile}
                onChange={(e) => update("mobile", e.target.value)}
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-3">
              <Label>{t("streetLabel")}</Label>
              <Input
                value={form.street}
                onChange={(e) => update("street", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("houseNumberLabel")}</Label>
              <Input
                value={form.houseNumber}
                onChange={(e) => update("houseNumber", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>{t("postalCodeLabel")}</Label>
              <Input
                value={form.postalCode}
                onChange={(e) => update("postalCode", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("cityLabel")}</Label>
              <Input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("countryLabel")}</Label>
              <Input
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
              />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>{tDetail("contactTypeLabel")}</Label>
            <Select
              value={form.contactType || "none"}
              onValueChange={(v) => update("contactType", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={tDetail("contactTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {tDetail("contactTypeNone")}
                </SelectItem>
                {CONTACT_TYPE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {tDetail(`contactTypes.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Kapitalertragsteuer (A3) */}
          <div className="space-y-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{t("kapestSectionTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("kapestSectionHint")}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.churchTaxLiable}
                onChange={(e) => update("churchTaxLiable", e.target.checked)}
              />
              {t("churchTaxLiableLabel")}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("churchTaxRateLabel")}</Label>
                <Select
                  value={form.churchTaxRate || "none"}
                  onValueChange={(v) =>
                    update("churchTaxRate", v === "none" ? "" : v)
                  }
                  disabled={!form.churchTaxLiable}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("churchTaxRateUnset")} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Auswahl statt Freitext: 8 und 9 Prozent sind die einzigen
                        gesetzlichen Saetze, und die Eingabe „9" statt „0.09"
                        waere sonst erst im gedruckten Beiblatt aufgefallen. */}
                    <SelectItem value="none">{t("churchTaxRateUnset")}</SelectItem>
                    <SelectItem value="0.08">{t("churchTaxRate8")}</SelectItem>
                    <SelectItem value="0.09">{t("churchTaxRate9")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("exemptionOrderLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.exemptionOrderEur}
                  onChange={(e) => update("exemptionOrderEur", e.target.value)}
                  placeholder={t("exemptionOrderPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>{t("notesLabel")}</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
