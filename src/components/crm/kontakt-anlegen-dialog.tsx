"use client";

/**
 * "New contact" dialog with duplicate check. Used by the contact list and by
 * contact pickers ("Aus der Auswahl anlegen") — there the duplicate hint
 * offers to take the existing contact instead of creating a second one.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
import { HTTP_STATUS } from "@/lib/config/http-status";
import { kontaktVorbelegung } from "@/lib/crm/kontakt-vorbelegung";

interface ExistingMatch {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
}

interface CreateForm {
  personType: "natural" | "legal";
  salutation: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

const EMPTY_FORM: CreateForm = {
  personType: "natural",
  salutation: "",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
};

function anzeigeName(k: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  return k.companyName ?? `${k.firstName ?? ""} ${k.lastName ?? ""}`.trim();
}

export interface KontaktAnlegenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text typed into a picker; split into person or company fields. */
  vorbelegung?: string;
  onCreated: (kontakt: { id: string; name: string }) => void;
  /** The duplicate check found an existing contact and the user took it. */
  onExisting: (kontakt: { id: string; name: string }) => void;
  /** Label of the "use existing" button; default "open existing". */
  vorhandenenText?: string;
  /**
   * Where to create: the CRM route (with duplicate check, needs the CRM
   * module) or /api/persons (lease permissions, no module needed).
   */
  endpoint?: "/api/crm/contacts" | "/api/persons";
}

export function KontaktAnlegenDialog({
  open,
  onOpenChange,
  vorbelegung,
  onCreated,
  onExisting,
  vorhandenenText,
  endpoint = "/api/crm/contacts",
}: KontaktAnlegenDialogProps) {
  const t = useTranslations("crm.contacts");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [dedupMatch, setDedupMatch] = useState<ExistingMatch | null>(null);

  // Prefill from the picker's search each time the dialog opens.
  useEffect(() => {
    if (open && vorbelegung) setForm({ ...EMPTY_FORM, ...kontaktVorbelegung(vorbelegung) });
  }, [open, vorbelegung]);

  const handleCreate = async (force = false) => {
    setCreating(true);
    try {
      const body = {
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
        force,
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === HTTP_STATUS.CONFLICT) {
        const err = await res.json();
        // Backend envelope: { code, error, details: { existing } }.
        // Fallback auf err.existing für Kompatibilität, falls die Route
        // später wieder auf die flache Form umgestellt wird.
        const existing =
          (err.details as { existing?: ExistingMatch } | undefined)?.existing ??
          (err.existing as ExistingMatch | undefined);
        if (existing) {
          setDedupMatch(existing);
          return;
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? t("createError"));
      }
      const created = await res.json();
      toast.success(t("createSuccess"));
      onOpenChange(false);
      setForm(EMPTY_FORM);
      setDedupMatch(null);
      onCreated({ id: created.id, name: anzeigeName(created) });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("createError"));
    } finally {
      setCreating(false);
    }
  };


  return (
  <Dialog
    open={open}
    onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) {
        setForm(EMPTY_FORM);
        setDedupMatch(null);
      }
    }}
  >
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t("createDialogTitle")}</DialogTitle>
        <DialogDescription>
          {t("createDialogDescription")}
        </DialogDescription>
      </DialogHeader>

      {/* Dedup warning banner */}
      {dedupMatch && (
        <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                {t("createDedupTitle")}
              </div>
              <div className="mt-1 text-amber-800 dark:text-amber-300">
                {dedupMatch.companyName ??
                  `${dedupMatch.firstName ?? ""} ${dedupMatch.lastName ?? ""}`.trim()}
                {dedupMatch.street && (
                  <>
                    , {dedupMatch.street} {dedupMatch.houseNumber}
                    <br />
                    {dedupMatch.postalCode} {dedupMatch.city}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!dedupMatch) return;
                onOpenChange(false);
                setDedupMatch(null);
                setForm(EMPTY_FORM);
                onExisting({ id: dedupMatch.id, name: anzeigeName(dedupMatch) });
              }}
            >
              {vorhandenenText ?? t("createDedupOpenExisting")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDedupMatch(null);
                handleCreate(true);
              }}
            >
              {t("createDedupCreateAnyway")}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>{t("fieldType")}</Label>
          <Select
            value={form.personType}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                personType: v as "natural" | "legal",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="natural">{t("typeNatural")}</SelectItem>
              <SelectItem value="legal">{t("typeLegal")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.personType === "natural" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("fieldSalutation")}</Label>
              <Select
                value={form.salutation || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    salutation: v === "none" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="Herr">Herr</SelectItem>
                  <SelectItem value="Frau">Frau</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("fieldFirstName")}</Label>
              <Input
                value={form.firstName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstName: e.target.value }))
                }
                placeholder={t("placeholderFirstName")}
              />
            </div>
          </div>
        )}

        {form.personType === "natural" ? (
          <div className="space-y-1.5">
            <Label>{t("fieldLastName")}</Label>
            <Input
              value={form.lastName}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastName: e.target.value }))
              }
              placeholder={t("placeholderLastName")}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>{t("fieldCompanyName")}</Label>
            <Input
              value={form.companyName}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyName: e.target.value }))
              }
              placeholder={t("placeholderCompanyName")}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("fieldEmail")}</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((f) => ({ ...f, email: e.target.value }))
            }
            placeholder={t("placeholderEmail")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("fieldPhone")}</Label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, phone: e.target.value }))
            }
            placeholder={t("placeholderPhone")}
          />
        </div>

        {/* Address — needed for dedup key */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>{t("fieldStreet")}</Label>
            <Input
              value={form.street}
              onChange={(e) =>
                setForm((f) => ({ ...f, street: e.target.value }))
              }
              placeholder={t("placeholderStreet")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("fieldHouseNumber")}</Label>
            <Input
              value={form.houseNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, houseNumber: e.target.value }))
              }
              placeholder={t("placeholderHouseNumber")}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>{t("fieldPostalCode")}</Label>
            <Input
              value={form.postalCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, postalCode: e.target.value }))
              }
              placeholder={t("placeholderPostalCode")}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>{t("fieldCity")}</Label>
            <Input
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({ ...f, city: e.target.value }))
              }
              placeholder={t("placeholderCity")}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={creating}
        >
          {tCommon("cancel")}
        </Button>
        <Button
          onClick={() => handleCreate(false)}
          disabled={creating || dedupMatch !== null}
        >
          {creating ? t("saving") : t("saveButton")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
}
