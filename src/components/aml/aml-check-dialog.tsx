"use client";

/**
 * Records a GwG identity check (POST /api/aml-checks).
 *
 * Every check is a record of its own — the server never overwrites an
 * earlier one, because each is a separate proof with its own retention
 * period (§ 8 Abs. 4 GwG). "Record again" therefore always creates.
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AML_METHODEN,
  AML_RISIKEN,
  AML_STATUS,
  amlFormularFehler,
  amlFormularZuPayload,
  leeresAmlFormular,
  type AmlFormular,
} from "@/lib/aml/pruefung-formular";

interface AmlCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  subscriptionId?: string | null;
}

export function AmlCheckDialog({
  open,
  onOpenChange,
  personId,
  personName,
  subscriptionId,
}: AmlCheckDialogProps) {
  const t = useTranslations("aml");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AmlFormular>(leeresAmlFormular);

  const setze = <K extends keyof AmlFormular>(feld: K, wert: AmlFormular[K]) =>
    setForm((alt) => ({ ...alt, [feld]: wert }));

  const speichern = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/aml-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(amlFormularZuPayload(form, personId, subscriptionId)),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || result.error || t("saveError"));
      return result as { warnings?: string[] };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["aml-checks"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      // Pre-filled resubmission date and retention period come as warnings —
      // they are what the user has to check, so they are shown.
      toast.success(t("saved"), {
        description: result.warnings?.slice(0, 2).join(" · "),
        duration: result.warnings?.length ? 12_000 : 4_000,
      });
      setForm(leeresAmlFormular());
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const fehler = amlFormularFehler(form);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { name: personName })}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="aml-status">{t("fields.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setze("status", v as AmlFormular["status"])}>
              <SelectTrigger id="aml-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AML_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-method">{t("fields.method")}</Label>
            <Select value={form.method} onValueChange={(v) => setze("method", v as AmlFormular["method"])}>
              <SelectTrigger id="aml-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AML_METHODEN.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`methods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aml-identified">{t("fields.identifiedAt")}</Label>
            <Input
              id="aml-identified"
              type="date"
              value={form.identifiedAt}
              onChange={(e) => setze("identifiedAt", e.target.value)}
              aria-invalid={fehler === "identifiedAtRequired"}
            />
            {fehler === "identifiedAtRequired" && (
              <p className="text-xs text-destructive">{t("identifiedAtRequired")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-risk">{t("fields.riskLevel")}</Label>
            <Select value={form.riskLevel} onValueChange={(v) => setze("riskLevel", v as AmlFormular["riskLevel"])}>
              <SelectTrigger id="aml-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AML_RISIKEN.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`risks.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aml-doctype">{t("fields.documentType")}</Label>
            <Input
              id="aml-doctype"
              value={form.documentType}
              maxLength={60}
              placeholder={t("documentTypePlaceholder")}
              onChange={(e) => setze("documentType", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-docnr">{t("fields.documentNumber")}</Label>
            <Input
              id="aml-docnr"
              value={form.documentNumber}
              maxLength={60}
              onChange={(e) => setze("documentNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-authority">{t("fields.issuingAuthority")}</Label>
            <Input
              id="aml-authority"
              value={form.issuingAuthority}
              maxLength={200}
              onChange={(e) => setze("issuingAuthority", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-validuntil">{t("fields.documentValidUntil")}</Label>
            <Input
              id="aml-validuntil"
              type="date"
              value={form.documentValidUntil}
              onChange={(e) => setze("documentValidUntil", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aml-review">{t("fields.nextReviewAt")}</Label>
            <Input
              id="aml-review"
              type="date"
              value={form.nextReviewAt}
              onChange={(e) => setze("nextReviewAt", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("nextReviewHint")}</p>
          </div>
          <div className="space-y-3 pt-7">
            <div className="flex items-center gap-2">
              <Switch
                id="aml-bo"
                checked={form.beneficialOwnerVerified}
                onCheckedChange={(v) => setze("beneficialOwnerVerified", v)}
              />
              <Label htmlFor="aml-bo">{t("fields.beneficialOwnerVerified")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="aml-pep" checked={form.isPep} onCheckedChange={(v) => setze("isPep", v)} />
              <Label htmlFor="aml-pep">{t("fields.isPep")}</Label>
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="aml-notes">{t("fields.notes")}</Label>
            <Textarea
              id="aml-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setze("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichern.isPending}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => speichern.mutate()} disabled={!!fehler || speichern.isPending}>
            {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
