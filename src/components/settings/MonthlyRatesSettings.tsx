"use client";

/**
 * Monatssätze (EnergyMonthlyRate) pflegen.
 *
 * Die Abregelungs-Auswertung bewertet verlorene kWh mit dem Satz des Monats.
 * Eine Oberfläche dafür gab es nicht — die Bewertung in Euro blieb leer.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AmountInput } from "@/components/ui/amount-input";
import { DataTable } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/use-confirm";
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
import { PAGE_SIZE_LARGE } from "@/lib/config/pagination";
import {
  leererMonatssatz,
  monatssatzFehler,
  monatssatzRumpf,
  type MonatssatzFormular,
} from "@/lib/energy/monatssatz";

interface Monatssatz {
  id: string;
  year: number;
  month: number;
  ratePerKwh: number;
  marketValue: number | null;
  managementFee: number | null;
  notes: string | null;
  revenueTypeId: string;
  revenueType: { id: string; name: string; code: string } | null;
}

interface Erloesart {
  id: string;
  name: string;
  code: string;
}

const RATES_KEY = "/api/admin/energy-monthly-rates";

async function holen<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function MonthlyRatesSettings() {
  const t = useTranslations("admin.monthlyRates");
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const aktuellesJahr = new Date().getFullYear();
  const [jahr, setJahr] = useState(aktuellesJahr);
  const [dialog, setDialog] = useState<{ satz: Monatssatz | null } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [RATES_KEY, jahr],
    queryFn: () => holen<{ data: Monatssatz[] }>(`${RATES_KEY}?year=${jahr}&limit=${PAGE_SIZE_LARGE}`),
    staleTime: 60_000,
  });

  const loeschen = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${RATES_KEY}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t("deleteError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RATES_KEY] });
      toast.success(t("deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monatsname = (monat: number) =>
    new Date(2000, monat - 1, 1).toLocaleDateString("de-DE", { month: "long" });
  const euro = (wert: number | null) =>
    wert === null ? "–" : `${wert.toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
            <SelectTrigger className="w-28" aria-label={t("year")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 8 }, (_, i) => aktuellesJahr + 1 - i).map((j) => (
                <SelectItem key={j} value={String(j)}>{j}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialog({ satz: null })}>
            <Plus className="mr-2 h-4 w-4" />
            {t("new")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={data?.data ?? []}
          getRowId={(r) => r.id}
          isLoading={isLoading}
          searchPlaceholder={t("search")}
          empty={{
            icon: CalendarRange,
            title: t("emptyTitle", { year: jahr }),
            description: t("emptyDescription"),
            action: (
              <Button variant="outline" onClick={() => setDialog({ satz: null })}>
                <Plus className="mr-2 h-4 w-4" />
                {t("new")}
              </Button>
            ),
          }}
          columns={[
            { id: "month", header: t("month"), cell: (r) => monatsname(r.month), sortValue: (r) => r.month },
            {
              id: "type", header: t("revenueType"), cell: (r) => r.revenueType?.name ?? "–",
              sortValue: (r) => r.revenueType?.name, searchValue: (r) => r.revenueType?.name,
            },
            { id: "rate", header: t("rate"), align: "right", cell: (r) => euro(r.ratePerKwh), sortValue: (r) => r.ratePerKwh },
            { id: "market", header: t("marketValue"), align: "right", cell: (r) => euro(r.marketValue), sortValue: (r) => r.marketValue },
            { id: "notes", header: t("notes"), cell: (r) => r.notes ?? "", searchValue: (r) => r.notes },
            {
              id: "actions", header: "", align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={() => setDialog({ satz: r })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("delete")}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("deleteTitle"),
                        description: t("deleteDescription", { month: monatsname(r.month), year: r.year }),
                        variant: "destructive",
                      });
                      if (ok) loeschen.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </CardContent>
      <MonatssatzDialog
        offen={dialog !== null}
        satz={dialog?.satz ?? null}
        jahr={jahr}
        schliessen={() => setDialog(null)}
      />
      {confirmDialog}
    </Card>
  );
}

function MonatssatzDialog({
  offen,
  satz,
  jahr,
  schliessen,
}: {
  offen: boolean;
  satz: Monatssatz | null;
  jahr: number;
  schliessen: () => void;
}) {
  const t = useTranslations("admin.monthlyRates");
  const queryClient = useQueryClient();
  const modus = satz ? "bearbeiten" : "neu";
  const [formular, setFormular] = useState<MonatssatzFormular>(leererMonatssatz(jahr));
  const [geprueft, setGeprueft] = useState(false);

  useEffect(() => {
    if (!offen) return;
    setFormular(
      satz
        ? {
            year: satz.year, month: satz.month, revenueTypeId: satz.revenueTypeId, ratePerKwh: satz.ratePerKwh,
            marketValue: satz.marketValue, managementFee: satz.managementFee, notes: satz.notes ?? "",
          }
        : leererMonatssatz(jahr),
    );
    setGeprueft(false);
  }, [offen, satz, jahr]);

  const { data: arten } = useQuery({
    queryKey: ["/api/admin/revenue-types"],
    queryFn: () => holen<{ data: Erloesart[] }>("/api/admin/revenue-types"),
    enabled: offen,
    staleTime: 60_000,
  });

  const speichern = useMutation({
    mutationFn: async () => {
      const res = await fetch(satz ? `${RATES_KEY}/${satz.id}` : RATES_KEY, {
        method: satz ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(monatssatzRumpf(formular, modus)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t("saveError"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RATES_KEY] });
      toast.success(t("saved"));
      schliessen();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fehler = monatssatzFehler(formular, modus);
  const zeige = (feld: string) => geprueft && fehler.includes(feld);
  const setze = <K extends keyof MonatssatzFormular>(feld: K, wert: MonatssatzFormular[K]) =>
    setFormular((f) => ({ ...f, [feld]: wert }));

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!o) schliessen(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{satz ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{satz ? t("keyFixedHint") : t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={speichern.isPending} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rate-month">{t("month")} *</Label>
            <Select value={formular.month ? String(formular.month) : ""} onValueChange={(v) => setze("month", Number(v))} disabled={!!satz}>
              <SelectTrigger id="rate-month"><SelectValue placeholder={t("monthPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {new Date(2000, m - 1, 1).toLocaleDateString("de-DE", { month: "long" })} {formular.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zeige("month") && <p className="text-xs text-destructive">{t("required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-type">{t("revenueType")} *</Label>
            <Select value={formular.revenueTypeId} onValueChange={(v) => setze("revenueTypeId", v)} disabled={!!satz}>
              <SelectTrigger id="rate-type"><SelectValue placeholder={t("revenueTypePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {(arten?.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zeige("revenueTypeId") && <p className="text-xs text-destructive">{t("required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-value">{t("rate")} (€/kWh) *</Label>
            <AmountInput id="rate-value" value={formular.ratePerKwh} onValueChange={(v) => setze("ratePerKwh", v)} decimals={4} />
            {zeige("ratePerKwh") && <p className="text-xs text-destructive">{t("required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-market">{t("marketValue")} (€/kWh)</Label>
            <AmountInput id="rate-market" value={formular.marketValue} onValueChange={(v) => setze("marketValue", v)} decimals={4} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-fee">{t("managementFee")} (€/kWh)</Label>
            <AmountInput id="rate-fee" value={formular.managementFee} onValueChange={(v) => setze("managementFee", v)} decimals={4} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rate-notes">{t("notes")}</Label>
            <Textarea id="rate-notes" rows={2} value={formular.notes} onChange={(e) => setze("notes", e.target.value)} />
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={schliessen}>{t("cancel")}</Button>
          <Button
            onClick={() => { setGeprueft(true); if (fehler.length === 0) speichern.mutate(); }}
            disabled={speichern.isPending}
          >
            {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
