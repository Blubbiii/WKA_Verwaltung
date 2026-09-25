"use client";

/**
 * "New cost center" dialog. Used by /wirtschaftsplan/cost-centers and by cost
 * center pickers ("Aus der Auswahl anlegen").
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Briefcase, LayoutGrid, Loader2, Wind } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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

export const KOSTENSTELLEN_TYPEN: Record<string, { key: string; icon: React.ElementType; color: string }> = {
  PARK: { key: "typePark", icon: Building2, color: "text-blue-600" },
  TURBINE: { key: "typeTurbine", icon: Wind, color: "text-green-600" },
  FUND: { key: "typeFund", icon: Briefcase, color: "text-purple-600" },
  OVERHEAD: { key: "typeOverhead", icon: LayoutGrid, color: "text-orange-600" },
  CUSTOM: { key: "typeCustom", icon: LayoutGrid, color: "text-muted-foreground" },
};

const LEER = { code: "", name: "", type: "CUSTOM", description: "" };

export function KostenstelleDialog({
  open,
  onOpenChange,
  vorbelegung,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name prefill, e.g. the text typed into a cost center picker. */
  vorbelegung?: string;
  onCreated: (kostenstelle: { id: string; name: string }) => void;
}) {
  const t = useTranslations("wirtschaftsplan.costCenters");
  const [form, setForm] = useState(LEER);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...LEER, name: vorbelegung ?? "" });
  }, [open, vorbelegung]);

  async function handleCreate() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error(t("validationRequired"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          type: form.type,
          description: form.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("createError"));
      }
      const neu = await res.json().catch(() => null);
      toast.success(t("createSuccess"));
      onOpenChange(false);
      const daten = neu?.data ?? neu;
      if (daten?.id) onCreated({ id: daten.id, name: daten.name ?? form.name.trim() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("fieldCode")}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder={t("placeholderCode")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fieldType")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KOSTENSTELLEN_TYPEN).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {t(v.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("fieldName")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("placeholderName")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fieldDescription")}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("placeholderDescription")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
