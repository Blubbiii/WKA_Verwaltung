"use client";

/**
 * Replace a major component: the old part gets a removal date and reason,
 * the new one is created — in one transaction on the server. Nothing is
 * deleted; the chain "third gearbox" stays readable.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  AUSBAUGRUENDE,
  tauschFormularFuer,
  tauschPayload,
  type TauschFormular,
} from "@/lib/components/tausch-formular";

interface ReplaceComponentDialogProps {
  component: {
    id: string;
    type: string;
    position: string | null;
    manufacturer: string | null;
    model: string | null;
    designLifeYears: number | null;
    turbine: { designation: string };
  };
  onClose: () => void;
}

export function ReplaceComponentDialog({ component, onClose }: ReplaceComponentDialogProps) {
  const t = useTranslations("majorComponents");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TauschFormular>(() =>
    tauschFormularFuer(component, new Date().toISOString().slice(0, 10)),
  );
  const setze = <K extends keyof TauschFormular>(feld: K, wert: TauschFormular[K]) =>
    setForm((alt) => ({ ...alt, [feld]: wert }));

  const tauschen = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/components/${component.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tauschPayload(form)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("replace.error"));
      return json as { warnings?: string[] };
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ["major-components"] });
      toast.success(t("replace.done"), {
        description: json.warnings?.join(" · "),
        duration: json.warnings?.length ? 12_000 : 4_000,
      });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const bezeichnung = `${t(`types.${component.type}`)}${component.position ? ` ${component.position}` : ""}`;

  return (
    <Dialog open onOpenChange={(offen) => !offen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("replace.title", { component: bezeichnung, turbine: component.turbine.designation })}
          </DialogTitle>
          <DialogDescription>{t("replace.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm font-medium">{t("replace.oldPart")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rc-removed">{t("replace.removedAt")}</Label>
              <Input
                id="rc-removed"
                type="date"
                value={form.removedAt}
                onChange={(e) => setze("removedAt", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-reason">{t("replace.reason")}</Label>
              <Select
                value={form.removalReason}
                onValueChange={(v) => setze("removalReason", v as TauschFormular["removalReason"])}
              >
                <SelectTrigger id="rc-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUSBAUGRUENDE.map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`removalReasons.${g}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rc-rnotes">{t("replace.removalNotes")}</Label>
              <Input
                id="rc-rnotes"
                value={form.removalNotes}
                onChange={(e) => setze("removalNotes", e.target.value)}
              />
            </div>
          </div>

          <p className="text-sm font-medium">{t("replace.newPart")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rc-installed">{t("replace.installedAt")}</Label>
              <Input
                id="rc-installed"
                type="date"
                value={form.installedAt}
                onChange={(e) => setze("installedAt", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("replace.installedAtHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-serial">{t("table.serial")}</Label>
              <Input
                id="rc-serial"
                value={form.serialNumber}
                maxLength={100}
                onChange={(e) => setze("serialNumber", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-manufacturer">{t("replace.manufacturer")}</Label>
              <Input
                id="rc-manufacturer"
                value={form.manufacturer}
                maxLength={200}
                onChange={(e) => setze("manufacturer", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-model">{t("replace.model")}</Label>
              <Input
                id="rc-model"
                value={form.model}
                maxLength={200}
                onChange={(e) => setze("model", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-life">{t("replace.designLife")}</Label>
              <Input
                id="rc-life"
                inputMode="numeric"
                value={form.designLifeYears}
                onChange={(e) => setze("designLifeYears", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-cost">{t("replace.cost")}</Label>
              <Input
                id="rc-cost"
                inputMode="decimal"
                value={form.costEur}
                onChange={(e) => setze("costEur", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-warranty">{t("replace.warrantyEnd")}</Label>
              <Input
                id="rc-warranty"
                type="date"
                value={form.warrantyEndDate}
                onChange={(e) => setze("warrantyEndDate", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("replace.warrantyHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-wprovider">{t("replace.warrantyProvider")}</Label>
              <Input
                id="rc-wprovider"
                value={form.warrantyProvider}
                maxLength={200}
                onChange={(e) => setze("warrantyProvider", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rc-notes">{t("replace.notes")}</Label>
              <Textarea
                id="rc-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setze("notes", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={tauschen.isPending}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => tauschen.mutate()} disabled={!form.removedAt || tauschen.isPending}>
            {tauschen.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("replace.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
