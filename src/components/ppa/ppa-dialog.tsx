"use client";

/**
 * PPA anlegen, bearbeiten oder ansehen.
 *
 * Die PPA-Liste hatte "Neuer PPA", "Anzeigen" und "Bearbeiten" — ohne
 * Handler. Dieser Dialog ist die fehlende Hälfte.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
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
import { AmountInput } from "@/components/ui/amount-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiQuery } from "@/hooks/useApiQuery";
import { PAGE_SIZE_DROPDOWN } from "@/lib/config/pagination";
import {
  leeresPpaFormular,
  ppaFehler,
  ppaFormularAus,
  ppaRumpf,
  type PpaDatensatz,
  type PpaFormular,
} from "@/lib/ppa/formular";

export type PpaDialogModus = "neu" | "bearbeiten" | "ansehen";

interface PpaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modus: PpaDialogModus;
  ppa: (PpaDatensatz & { id: string }) | null;
  onSaved: () => void;
}

export function PpaDialog({ open, onOpenChange, modus, ppa, onSaved }: PpaDialogProps) {
  const t = useTranslations("invoices.ppa");
  const [formular, setFormular] = useState<PpaFormular>(leeresPpaFormular());
  const [geprueft, setGeprueft] = useState(false);
  const nurLesen = modus === "ansehen";

  // Fill on every open — Radix does not call onOpenChange when the parent opens it.
  useEffect(() => {
    if (!open) return;
    setFormular(ppa ? ppaFormularAus(ppa) : leeresPpaFormular());
    setGeprueft(false);
  }, [open, ppa]);

  const { data: parksData } = useApiQuery<{ data: { id: string; name: string }[] }>(
    ["ppa-parks"],
    open && modus === "neu" ? `/api/parks?limit=${PAGE_SIZE_DROPDOWN}` : null,
  );

  const speichern = useMutation({
    mutationFn: async () => {
      const bearbeiten = modus === "bearbeiten" && ppa;
      const res = await fetch(bearbeiten ? `/api/ppa/${ppa.id}` : "/api/ppa", {
        method: bearbeiten ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ppaRumpf(formular, bearbeiten ? "bearbeiten" : "neu")),
      });
      if (!res.ok) {
        const fehler = await res.json().catch(() => ({}));
        throw new Error(fehler.error || t("form.saveError"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(modus === "neu" ? t("form.created") : t("form.saved"));
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fehler = ppaFehler(formular, modus === "neu" ? "neu" : "bearbeiten");
  const zeigeFehler = (feld: string) => geprueft && fehler.includes(feld);
  const setze = <K extends keyof PpaFormular>(feld: K, wert: PpaFormular[K]) =>
    setFormular((f) => ({ ...f, [feld]: wert }));

  function absenden() {
    setGeprueft(true);
    if (fehler.length === 0) speichern.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {modus === "neu" ? t("form.titleNew") : modus === "bearbeiten" ? t("form.titleEdit") : formular.title}
          </DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <fieldset disabled={nurLesen || speichern.isPending} className="grid gap-4 sm:grid-cols-2">
          <Feld id="ppa-title" label={`${t("colTitle")} *`} fehler={zeigeFehler("title") ? t("form.required") : undefined}>
            <Input id="ppa-title" value={formular.title} onChange={(e) => setze("title", e.target.value)} />
          </Feld>
          <Feld id="ppa-counterparty" label={`${t("colCounterparty")} *`} fehler={zeigeFehler("counterparty") ? t("form.required") : undefined}>
            <Input id="ppa-counterparty" value={formular.counterparty} onChange={(e) => setze("counterparty", e.target.value)} />
          </Feld>

          <Feld id="ppa-park" label={`${t("colPark")} *`} fehler={zeigeFehler("parkId") ? t("form.required") : undefined}>
            {modus === "neu" ? (
              <Select value={formular.parkId} onValueChange={(v) => setze("parkId", v)}>
                <SelectTrigger id="ppa-park">
                  <SelectValue placeholder={t("form.parkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(parksData?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // The update API does not move a PPA to another park.
              <Input id="ppa-park" value={(ppa as { park?: { name?: string } } | null)?.park?.name ?? ""} disabled />
            )}
          </Feld>
          <Feld id="ppa-number" label={t("form.contractNumber")}>
            <Input id="ppa-number" value={formular.contractNumber} onChange={(e) => setze("contractNumber", e.target.value)} />
          </Feld>

          <Feld id="ppa-start" label={`${t("form.startDate")} *`} fehler={zeigeFehler("startDate") ? t("form.required") : undefined}>
            <Input id="ppa-start" type="date" value={formular.startDate} onChange={(e) => setze("startDate", e.target.value)} />
          </Feld>
          <Feld
            id="ppa-end"
            label={`${t("form.endDate")} *`}
            fehler={zeigeFehler("endDate") ? t("form.required") : zeigeFehler("endBeforeStart") ? t("form.endBeforeStart") : undefined}
          >
            <Input id="ppa-end" type="date" value={formular.endDate} onChange={(e) => setze("endDate", e.target.value)} />
          </Feld>

          <Feld id="ppa-mode" label={t("colPricingMode")}>
            <Select value={formular.pricingMode} onValueChange={(v) => setze("pricingMode", v as PpaFormular["pricingMode"])}>
              <SelectTrigger id="ppa-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED">{t("pricingFixed")}</SelectItem>
                <SelectItem value="INDEXED">{t("pricingIndexed")}</SelectItem>
                <SelectItem value="COLLAR">{t("pricingCollar")}</SelectItem>
              </SelectContent>
            </Select>
          </Feld>

          {formular.pricingMode === "FIXED" && (
            <Feld id="ppa-fixed" label={`${t("form.fixedPrice")} (${t("priceUnit")})`}>
              <AmountInput id="ppa-fixed" value={formular.fixedPriceCentKwh} onValueChange={(v) => setze("fixedPriceCentKwh", v)} decimals={3} />
            </Feld>
          )}
          {formular.pricingMode === "INDEXED" && (
            <>
              <Feld id="ppa-index" label={t("form.indexBase")}>
                <Input id="ppa-index" value={formular.indexBase} onChange={(e) => setze("indexBase", e.target.value)} />
              </Feld>
              <Feld id="ppa-markup" label={`${t("form.indexMarkup")} (${t("priceUnit")})`}>
                <AmountInput id="ppa-markup" value={formular.indexMarkupCentKwh} onValueChange={(v) => setze("indexMarkupCentKwh", v)} decimals={3} />
              </Feld>
            </>
          )}
          {formular.pricingMode === "COLLAR" && (
            <>
              <Feld id="ppa-floor" label={`${t("form.floorPrice")} (${t("priceUnit")})`}>
                <AmountInput id="ppa-floor" value={formular.floorPriceCentKwh} onValueChange={(v) => setze("floorPriceCentKwh", v)} decimals={3} />
              </Feld>
              <Feld id="ppa-cap" label={`${t("form.capPrice")} (${t("priceUnit")})`}>
                <AmountInput id="ppa-cap" value={formular.capPriceCentKwh} onValueChange={(v) => setze("capPriceCentKwh", v)} decimals={3} />
              </Feld>
            </>
          )}

          <Feld id="ppa-min" label={`${t("form.minQuantity")} (MWh)`}>
            <AmountInput id="ppa-min" value={formular.minQuantityMwh} onValueChange={(v) => setze("minQuantityMwh", v)} decimals={0} />
          </Feld>
          <Feld id="ppa-max" label={`${t("form.maxQuantity")} (MWh)`}>
            <AmountInput id="ppa-max" value={formular.maxQuantityMwh} onValueChange={(v) => setze("maxQuantityMwh", v)} decimals={0} />
          </Feld>

          <Feld id="ppa-period" label={t("form.billingPeriod")}>
            <Select value={formular.billingPeriod} onValueChange={(v) => setze("billingPeriod", v as PpaFormular["billingPeriod"])}>
              <SelectTrigger id="ppa-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">{t("form.periodMonthly")}</SelectItem>
                <SelectItem value="QUARTERLY">{t("form.periodQuarterly")}</SelectItem>
                <SelectItem value="YEARLY">{t("form.periodYearly")}</SelectItem>
              </SelectContent>
            </Select>
          </Feld>
          <Feld id="ppa-status" label={t("colStatus")}>
            <Select value={formular.status} onValueChange={(v) => setze("status", v as PpaFormular["status"])}>
              <SelectTrigger id="ppa-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">{t("statusDraft")}</SelectItem>
                <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
                <SelectItem value="EXPIRED">{t("statusExpired")}</SelectItem>
                <SelectItem value="TERMINATED">{t("statusTerminated")}</SelectItem>
              </SelectContent>
            </Select>
          </Feld>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ppa-notes">{t("form.notes")}</Label>
            <Textarea id="ppa-notes" rows={3} value={formular.notes} onChange={(e) => setze("notes", e.target.value)} />
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {nurLesen ? t("form.close") : t("form.cancel")}
          </Button>
          {!nurLesen && (
            <Button onClick={absenden} disabled={speichern.isPending}>
              {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("form.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Feld({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
    </div>
  );
}
