"use client";

/**
 * Erfassungsmaske für die Regulatorik-Stammdaten einer Anlage.
 *
 * B2 (Audit 2026-07).
 *
 * ## Die Formate werden beim Speichern geprüft, nicht hier
 *
 * Der Server ist die Instanz, die Nein sagt — eine zweite Prüfung im Formular
 * wäre eine zweite Wahrheit, die auseinanderdriftet. Was das Formular tut, ist
 * die erwartete Länge ANZUZEIGEN, damit ein Tippfehler beim Eintippen auffällt
 * und nicht erst nach dem Absenden.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import type { TurbineRow } from "@/app/(dashboard)/verwaltung/regulatorik/page";

const MASTR_STATUSES = ["NOT_REGISTERED", "PENDING", "REGISTERED", "DECOMMISSIONED"] as const;
const SCHEMES = [
  "UNKNOWN",
  "FIXED_FEED_IN",
  "MARKET_PREMIUM",
  "TENDER_AWARD",
  "OUTSIDE_EEG",
] as const;

/** Länge des EEG-Anlagenschlüssels nach § 3 Nr. 1 HkNRV. */
const EEG_KEY_LENGTH = 33;

interface FormState {
  mastrUnitNumber: string;
  mastrPlantNumber: string;
  mastrStatus: (typeof MASTR_STATUSES)[number];
  mastrRegisteredAt: string;
  lastChangeAt: string;
  lastChangeReportedAt: string;
  eegPlantKey: string;
  scheme: (typeof SCHEMES)[number];
  awardValueCtPerKwh: string;
  awardDate: string;
  awardReference: string;
  siteQualityPercent: string;
  gridOperator: string;
  gridConnectionDate: string;
  annualReportDay: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    mastrUnitNumber: "",
    mastrPlantNumber: "",
    mastrStatus: "NOT_REGISTERED",
    mastrRegisteredAt: "",
    lastChangeAt: "",
    lastChangeReportedAt: "",
    eegPlantKey: "",
    scheme: "UNKNOWN",
    awardValueCtPerKwh: "",
    awardDate: "",
    awardReference: "",
    siteQualityPercent: "",
    gridOperator: "",
    gridConnectionDate: "",
    annualReportDay: "",
    notes: "",
  };
}

function day(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function RegulatoryProfileDialog({
  turbine,
  onClose,
  onSaved,
}: {
  turbine: TurbineRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("regulatory");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!turbine) return;
    const profile = turbine.regulatoryProfile;
    setForm(
      profile
        ? {
            mastrUnitNumber: profile.mastrUnitNumber ?? "",
            mastrPlantNumber: profile.mastrPlantNumber ?? "",
            mastrStatus: profile.mastrStatus,
            mastrRegisteredAt: day(profile.mastrRegisteredAt),
            lastChangeAt: day(profile.lastChangeAt),
            lastChangeReportedAt: day(profile.lastChangeReportedAt),
            eegPlantKey: profile.eegPlantKey ?? "",
            scheme: profile.scheme,
            awardValueCtPerKwh: profile.awardValueCtPerKwh
              ? String(Number(profile.awardValueCtPerKwh)).replace(".", ",")
              : "",
            awardDate: day(profile.awardDate),
            awardReference: profile.awardReference ?? "",
            siteQualityPercent: profile.siteQualityPercent
              ? String(Number(profile.siteQualityPercent)).replace(".", ",")
              : "",
            gridOperator: profile.gridOperator ?? "",
            gridConnectionDate: day(profile.gridConnectionDate),
            annualReportDay: profile.annualReportDay ?? "",
            notes: profile.notes ?? "",
          }
        : {
            ...emptyForm(),
            // Das alte Freitextfeld als Vorschlag übernehmen — es ist der
            // einzige Anhaltspunkt, den es bisher gab. Geprüft wird es beim
            // Speichern wie jede andere Eingabe.
            mastrUnitNumber: turbine.mastrNumber ?? "",
          },
    );
  }, [turbine]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function num(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function save() {
    if (!turbine) return;
    setSaving(true);
    try {
      const res = await fetch("/api/regulatory/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turbineId: turbine.id,
          mastrUnitNumber: form.mastrUnitNumber || null,
          mastrPlantNumber: form.mastrPlantNumber || null,
          mastrStatus: form.mastrStatus,
          mastrRegisteredAt: form.mastrRegisteredAt || null,
          lastChangeAt: form.lastChangeAt || null,
          lastChangeReportedAt: form.lastChangeReportedAt || null,
          eegPlantKey: form.eegPlantKey || null,
          scheme: form.scheme,
          awardValueCtPerKwh: num(form.awardValueCtPerKwh),
          awardDate: form.awardDate || null,
          awardReference: form.awardReference || null,
          siteQualityPercent: num(form.siteQualityPercent),
          gridOperator: form.gridOperator || null,
          gridConnectionDate: form.gridConnectionDate || null,
          annualReportDay: form.annualReportDay || null,
          notes: form.notes || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Die Begründung des Servers ist die genaue — sie nennt Feld und Format.
        throw new Error(result.message || t("saveError"));
      }
      toast.success(t("saved"));
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"), { duration: 12_000 });
    } finally {
      setSaving(false);
    }
  }

  const keyLength = form.eegPlantKey.trim().length;

  return (
    <Dialog open={turbine !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { turbine: turbine?.designation ?? "" })}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("sectionMastr")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("fields.mastrUnitNumber")} htmlFor="mastrUnitNumber">
                <Input
                  id="mastrUnitNumber"
                  value={form.mastrUnitNumber}
                  onChange={(e) => set("mastrUnitNumber", e.target.value.toUpperCase())}
                  placeholder="SEE900000000001"
                  className="font-mono"
                />
              </Field>
              <Field label={t("fields.mastrPlantNumber")} htmlFor="mastrPlantNumber">
                <Input
                  id="mastrPlantNumber"
                  value={form.mastrPlantNumber}
                  onChange={(e) => set("mastrPlantNumber", e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </Field>
              <Field label={t("fields.mastrStatus")}>
                <Select
                  value={form.mastrStatus}
                  onValueChange={(value) => set("mastrStatus", value as FormState["mastrStatus"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MASTR_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`mastrStatuses.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("fields.mastrRegisteredAt")} htmlFor="mastrRegisteredAt">
                <Input
                  id="mastrRegisteredAt"
                  type="date"
                  value={form.mastrRegisteredAt}
                  onChange={(e) => set("mastrRegisteredAt", e.target.value)}
                />
              </Field>
              <Field
                label={t("fields.lastChangeAt")}
                htmlFor="lastChangeAt"
                hint={t("fields.lastChangeHint")}
              >
                <Input
                  id="lastChangeAt"
                  type="date"
                  value={form.lastChangeAt}
                  onChange={(e) => set("lastChangeAt", e.target.value)}
                />
              </Field>
              <Field label={t("fields.lastChangeReportedAt")} htmlFor="lastChangeReportedAt">
                <Input
                  id="lastChangeReportedAt"
                  type="date"
                  value={form.lastChangeReportedAt}
                  onChange={(e) => set("lastChangeReportedAt", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("sectionEeg")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("fields.eegPlantKey")}
                htmlFor="eegPlantKey"
                hint={
                  keyLength === 0 || keyLength === EEG_KEY_LENGTH
                    ? t("fields.eegKeyHint", { length: EEG_KEY_LENGTH })
                    : // Beim Tippen sichtbar, nicht erst nach dem Absenden.
                      t("fields.eegKeyLength", { actual: keyLength, expected: EEG_KEY_LENGTH })
                }
                hintTone={
                  keyLength !== 0 && keyLength !== EEG_KEY_LENGTH ? "warning" : "muted"
                }
              >
                <Input
                  id="eegPlantKey"
                  value={form.eegPlantKey}
                  onChange={(e) => set("eegPlantKey", e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </Field>
              <Field label={t("fields.scheme")} hint={t("fields.schemeHint")}>
                <Select
                  value={form.scheme}
                  onValueChange={(value) => set("scheme", value as FormState["scheme"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEMES.map((scheme) => (
                      <SelectItem key={scheme} value={scheme}>
                        {t(`schemes.${scheme}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("fields.awardValue")} htmlFor="awardValueCtPerKwh">
                <Input
                  id="awardValueCtPerKwh"
                  value={form.awardValueCtPerKwh}
                  onChange={(e) => set("awardValueCtPerKwh", e.target.value)}
                  placeholder="7,35"
                  inputMode="decimal"
                />
              </Field>
              <Field label={t("fields.awardDate")} htmlFor="awardDate">
                <Input
                  id="awardDate"
                  type="date"
                  value={form.awardDate}
                  onChange={(e) => set("awardDate", e.target.value)}
                />
              </Field>
              <Field label={t("fields.awardReference")} htmlFor="awardReference">
                <Input
                  id="awardReference"
                  value={form.awardReference}
                  onChange={(e) => set("awardReference", e.target.value)}
                />
              </Field>
              <Field
                label={t("fields.siteQuality")}
                htmlFor="siteQualityPercent"
                hint={t("fields.siteQualityHint")}
              >
                <Input
                  id="siteQualityPercent"
                  value={form.siteQualityPercent}
                  onChange={(e) => set("siteQualityPercent", e.target.value)}
                  placeholder="87,50"
                  inputMode="decimal"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("sectionGrid")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("fields.gridOperator")} htmlFor="gridOperator">
                <Input
                  id="gridOperator"
                  value={form.gridOperator}
                  onChange={(e) => set("gridOperator", e.target.value)}
                />
              </Field>
              <Field label={t("fields.gridConnectionDate")} htmlFor="gridConnectionDate">
                <Input
                  id="gridConnectionDate"
                  type="date"
                  value={form.gridConnectionDate}
                  onChange={(e) => set("gridConnectionDate", e.target.value)}
                />
              </Field>
              <Field
                label={t("fields.annualReportDay")}
                htmlFor="annualReportDay"
                hint={t("fields.annualReportDayHint")}
              >
                <Input
                  id="annualReportDay"
                  value={form.annualReportDay}
                  onChange={(e) => set("annualReportDay", e.target.value)}
                  placeholder="02-28"
                  className="font-mono"
                />
              </Field>
            </div>
          </section>

          <Field label={t("fields.notes")} htmlFor="regulatoryNotes">
            <Textarea
              id="regulatoryNotes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  hintTone = "muted",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  hintTone?: "muted" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && (
        <p className={hintTone === "warning" ? "text-xs text-amber-600" : "text-xs text-muted-foreground"}>
          {hint}
        </p>
      )}
    </div>
  );
}
