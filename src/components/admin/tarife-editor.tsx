"use client";

/**
 * Tariffs of the platform, maintained in the marketing settings (2026-09).
 * The same records are shown on the landing page (if visible) and enforced
 * as the customers' licence — one source for sales and technology.
 * Only the platform operator (superadmin) may change them.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatCurrency } from "@/lib/format";
import {
  formularAusTarif,
  leeresTarifFormular,
  tarifAusFormular,
  type TarifFormular,
} from "@/lib/lizenz/tarif-formular";
import type { TarifEingabe } from "@/lib/lizenz/tarif-schema";

type Tarif = Omit<TarifEingabe, "preisMonatEur"> & {
  id: string;
  preisMonatEur: string | null;
  _count: { tenants: number };
};

const GRENZEN = ["maxFirmen", "maxUmspannwerke", "maxWea", "maxBenutzer", "maxSpeicherMb"] as const;

export function TarifeEditor() {
  const t = useTranslations("admin.tarife");
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [bearbeitet, setBearbeitet] = useState<{ id: string | null; form: TarifFormular } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tarife"],
    queryFn: async (): Promise<{ data: Tarif[] }> => {
      const res = await fetch("/api/superadmin/tarife");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });

  const speichern = useMutation({
    mutationFn: async () => {
      if (!bearbeitet) return;
      const res = await fetch(bearbeitet.id ? `/api/superadmin/tarife/${bearbeitet.id}` : "/api/superadmin/tarife", {
        method: bearbeitet.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tarifAusFormular(bearbeitet.form)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("saveError"));
    },
    onSuccess: () => {
      toast.success(t("saved"));
      setBearbeitet(null);
      queryClient.invalidateQueries({ queryKey: ["tarife"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const loeschen = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/superadmin/tarife/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("deleteError"));
    },
    onSuccess: () => {
      toast.success(t("deleted"));
      queryClient.invalidateQueries({ queryKey: ["tarife"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">{t("superadminOnly")}</CardContent>
      </Card>
    );
  }

  const setze = <K extends keyof TarifFormular>(feld: K, wert: TarifFormular[K]) =>
    setBearbeitet((alt) => (alt ? { ...alt, form: { ...alt.form, [feld]: wert } } : alt));
  const grenzeText = (wert: number | null) => (wert === null ? t("unlimited") : String(wert));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button onClick={() => setBearbeitet({ id: null, form: leeresTarifFormular() })}>
          <Plus className="mr-2 h-4 w-4" />
          {t("add")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (data?.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data!.data.map((tarif) => (
              <div key={tarif.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {tarif.name}
                      {tarif.hervorgehoben && <Star className="h-4 w-4 text-amber-500" aria-label={t("highlighted")} />}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {tarif.preisMonatEur === null
                        ? t("onRequest")
                        : t("perMonth", { preis: formatCurrency(Number(tarif.preisMonatEur)) })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {!tarif.sichtbar && <Badge variant="outline">{t("hidden")}</Badge>}
                    <Badge variant="secondary">{t("booked", { count: tarif._count.tenants })}</Badge>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {GRENZEN.map((g) => (
                    <div key={g} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t(`fields.${g}`)}</dt>
                      <dd className="font-medium tabular-nums">{grenzeText(tarif[g])}</dd>
                    </div>
                  ))}
                </dl>
                {tarif.leistungen.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {tarif.leistungen.slice(0, 5).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBearbeitet({ id: tarif.id, form: formularAusTarif(tarif) })}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loeschen.isPending}
                    onClick={async () => {
                      if (await confirm({ title: t("deleteTitle", { name: tarif.name }), variant: "destructive" })) {
                        loeschen.mutate(tarif.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    {t("delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!bearbeitet} onOpenChange={(offen) => !offen && setBearbeitet(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bearbeitet?.id ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          {bearbeitet && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tf-name">{t("fields.name")}</Label>
                <Input id="tf-name" value={bearbeitet.form.name} onChange={(e) => setze("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tf-key">{t("fields.key")}</Label>
                <Input id="tf-key" value={bearbeitet.form.key} onChange={(e) => setze("key", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tf-preis">{t("fields.preisMonatEur")}</Label>
                <Input
                  id="tf-preis"
                  inputMode="decimal"
                  placeholder={t("onRequest")}
                  value={bearbeitet.form.preisMonatEur}
                  onChange={(e) => setze("preisMonatEur", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tf-hinweis">{t("fields.preisHinweis")}</Label>
                <Input id="tf-hinweis" value={bearbeitet.form.preisHinweis} onChange={(e) => setze("preisHinweis", e.target.value)} />
              </div>
              {GRENZEN.map((g) => (
                <div key={g} className="space-y-2">
                  <Label htmlFor={`tf-${g}`}>{t(`fields.${g}`)}</Label>
                  <Input
                    id={`tf-${g}`}
                    inputMode="numeric"
                    placeholder={t("unlimited")}
                    value={bearbeitet.form[g]}
                    onChange={(e) => setze(g, e.target.value)}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="tf-sort">{t("fields.sortierung")}</Label>
                <Input id="tf-sort" inputMode="numeric" value={bearbeitet.form.sortierung} onChange={(e) => setze("sortierung", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tf-beschreibung">{t("fields.beschreibung")}</Label>
                <Textarea id="tf-beschreibung" rows={2} value={bearbeitet.form.beschreibung} onChange={(e) => setze("beschreibung", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tf-leistungen">{t("fields.leistungen")}</Label>
                <Textarea
                  id="tf-leistungen"
                  rows={5}
                  placeholder={t("leistungenPlaceholder")}
                  value={bearbeitet.form.leistungen}
                  onChange={(e) => setze("leistungen", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="tf-sichtbar" checked={bearbeitet.form.sichtbar} onCheckedChange={(v) => setze("sichtbar", v)} />
                <Label htmlFor="tf-sichtbar">{t("fields.sichtbar")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="tf-hervor" checked={bearbeitet.form.hervorgehoben} onCheckedChange={(v) => setze("hervorgehoben", v)} />
                <Label htmlFor="tf-hervor">{t("fields.hervorgehoben")}</Label>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("limitsHint")}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBearbeitet(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => speichern.mutate()} disabled={speichern.isPending}>
              {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </Card>
  );
}
