"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ENTITY_TYPE_KEYS = ["PARK", "FUND", "LEASE", "CONTRACT"] as const;

const ROLE_KEYS = [
  "VERPAECHTER",
  "NETZBETREIBER",
  "GUTACHTER",
  "BETRIEBSFUEHRER",
  "VERSICHERUNG",
  "RECHTSANWALT",
  "STEUERBERATER",
  "DIENSTLEISTER",
  "BEHOERDE",
  "SONSTIGES",
] as const;

type EntityType = (typeof ENTITY_TYPE_KEYS)[number];
type Role = (typeof ROLE_KEYS)[number];

const ROLE_I18N_KEY: Record<Role, string> = {
  VERPAECHTER: "roleVerpaechter",
  NETZBETREIBER: "roleNetzbetreiber",
  GUTACHTER: "roleGutachter",
  BETRIEBSFUEHRER: "roleBetriebsfuehrer",
  VERSICHERUNG: "roleVersicherung",
  RECHTSANWALT: "roleRechtsanwalt",
  STEUERBERATER: "roleSteuerberater",
  DIENSTLEISTER: "roleDienstleister",
  BEHOERDE: "roleBehoerde",
  SONSTIGES: "roleSonstiges",
};

const ENTITY_I18N_KEY: Record<EntityType, string> = {
  PARK: "targetPark",
  FUND: "targetFund",
  LEASE: "targetLease",
  CONTRACT: "targetContract",
};

interface EntityOption {
  id: string;
  label: string;
}

interface ContactLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  onSuccess?: () => void;
}

/**
 * Loads pickable options for the currently selected entity type.
 * Uses the existing entity-listing APIs so no new endpoints are required.
 */
async function loadEntityOptions(
  entityType: EntityType,
): Promise<EntityOption[]> {
  try {
    switch (entityType) {
      case "PARK": {
        const res = await fetch("/api/parks?limit=500");
        if (!res.ok) return [];
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
        return items.map((p: { id: string; name: string }) => ({
          id: p.id,
          label: p.name,
        }));
      }
      case "FUND": {
        const res = await fetch("/api/funds?limit=500");
        if (!res.ok) return [];
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
        return items.map((f: { id: string; name: string }) => ({
          id: f.id,
          label: f.name,
        }));
      }
      case "LEASE": {
        const res = await fetch("/api/leases?limit=500");
        if (!res.ok) return [];
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
        return items.map(
          (l: {
            id: string;
            startDate?: string;
            lessor?: { firstName?: string; lastName?: string; companyName?: string };
          }) => ({
            id: l.id,
            label: `${
              l.lessor?.companyName ??
              `${l.lessor?.firstName ?? ""} ${l.lessor?.lastName ?? ""}`.trim() ??
              "Pachtvertrag"
            }${l.startDate ? ` (ab ${l.startDate.slice(0, 10)})` : ""}`,
          }),
        );
      }
      case "CONTRACT": {
        const res = await fetch("/api/contracts?limit=500");
        if (!res.ok) return [];
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
        return items.map(
          (c: { id: string; title: string; contractNumber?: string | null }) => ({
            id: c.id,
            label: c.contractNumber ? `${c.contractNumber} — ${c.title}` : c.title,
          }),
        );
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

export function ContactLinkDialog({
  open,
  onOpenChange,
  personId,
  onSuccess,
}: ContactLinkDialogProps) {
  const t = useTranslations("crm.contactLink");
  const tCommon = useTranslations("common");
  const [entityType, setEntityType] = useState<EntityType>("PARK");
  const [entityId, setEntityId] = useState<string>("");
  const [role, setRole] = useState<Role>("BETRIEBSFUEHRER");
  const [notes, setNotes] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    setEntityId("");
    loadEntityOptions(entityType)
      .then(setOptions)
      .finally(() => setLoadingOptions(false));
  }, [entityType, open]);

  const handleSubmit = async () => {
    if (!entityId) {
      toast.error(t("targetPlaceholder"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/contact-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          entityType,
          entityId,
          role,
          notes: notes || null,
          isPrimary,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? t("saveError"));
      }
      toast.success(t("saveSuccess"));
      onSuccess?.();
      onOpenChange(false);
      // Reset for next open
      setEntityId("");
      setNotes("");
      setIsPrimary(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("targetTypeLabel")}</Label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as EntityType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(ENTITY_I18N_KEY[key])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("targetIdLabel")}</Label>
            <Select
              value={entityId}
              onValueChange={setEntityId}
              disabled={loadingOptions || options.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingOptions
                      ? tCommon("loading")
                      : options.length === 0
                        ? t("loadError")
                        : t("targetPlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("roleLabel")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue placeholder={t("rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ROLE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(ROLE_I18N_KEY[key])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("notesLabel")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isPrimary"
              checked={isPrimary}
              onCheckedChange={(v) => setIsPrimary(v === true)}
            />
            <Label htmlFor="isPrimary" className="cursor-pointer">
              {t("isPrimaryLabel")}
            </Label>
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
          <Button onClick={handleSubmit} disabled={saving || !entityId}>
            {saving ? t("saving") : t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
