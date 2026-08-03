"use client";

/**
 * Eigentümer und Bewirtschafter eines Flurstücks.
 *
 * ## Warum ein Dialog und keine eigene Seite
 *
 * Flurstücke haben keine eigene Detailseite — sie leben unter dem Park und
 * unter dem Pachtvertrag. Ein Dialog ist von beiden Stellen erreichbar, ohne
 * einen dritten Navigationszweig zu erfinden.
 *
 * ## Drei Entscheidungen, die diese Maske bewusst trifft
 *
 * **„Beenden" steht vorn, „Löschen" im Zusatzmenü.** Ein Eigentümerwechsel
 * wird abgebildet, indem der alte Eintrag ein Enddatum bekommt und der neue am
 * Folgetag beginnt. Wer stattdessen löscht, nimmt einer bereits abgerechneten
 * Periode die Grundlage und weiß nach einem Flurschaden nicht mehr, wer damals
 * auf der Fläche war. Die Maske macht den richtigen Weg zum bequemen.
 *
 * **Die Quotensumme steht dabei, während getippt wird.** Die 100-%-Regel gilt
 * je Stichtag; wer sie erst beim Absenden erfährt, muss raten, welche Zeile
 * schuld ist. Sie **blockiert** aber nicht: ein halb erfasstes Grundbuch muss
 * speicherbar bleiben, sonst weicht man auf Notizfelder aus.
 *
 * **Ein leerer Bewirtschafter heißt „nicht erfasst".** Nicht „der Eigentümer
 * bewirtschaftet selbst". Der Leerzustand sagt das ausdrücklich — sonst liest
 * man aus einer Lücke eine Aussage heraus, die niemand getroffen hat.
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Sprout, Trash2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/use-confirm";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
import { PAGE_SIZE_DROPDOWN } from "@/lib/config/pagination";

interface PersonRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  personType: string;
}

interface Eintrag {
  id: string;
  personId: string;
  person: PersonRef;
  sharePercent?: number;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
}

interface Quoten {
  summe: number;
  stimmt: boolean;
  hinweis: string | null;
}

export interface PlotPartiesDialogProps {
  plotId: string | null;
  /** Bezeichnung des Flurstücks für die Überschrift. */
  plotLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function personName(p: PersonRef): string {
  return (
    p.companyName?.trim() ||
    [p.firstName, p.lastName].filter(Boolean).join(" ") ||
    "Ohne Namen"
  );
}

/** Heute als `YYYY-MM-DD` — für „beenden zum heutigen Tag". */
function heute(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function PlotPartiesDialog({
  plotId,
  plotLabel,
  open,
  onOpenChange,
}: PlotPartiesDialogProps) {
  const t = useTranslations("plotParties");
  const invalidate = useInvalidateQuery();
  // Der Browserdialog kann nicht zeigen, was genau passiert, und laesst sich
  // fuer die Sitzung unterdruecken — dann liefe das Loeschen kommentarlos
  // durch. Ein Waechter-Test setzt das durch; er hat diese Datei zu Recht
  // abgewiesen.
  const { confirm, confirmDialog } = useConfirm();

  // useQuery, nicht useEffect + fetch — so schreibt es CLAUDE.md fuer neue
  // Abrufe vor, und ein Waechter-Test setzt es durch. Er hat diese Datei beim
  // ersten Anlauf zu Recht abgewiesen.
  const {
    data: eigentuemerDaten,
    isLoading: laedtEigentuemer,
    error: fehlerEigentuemer,
  } = useApiQuery<{ data: Eintrag[]; quoten: Quoten }>(
    ["plot-owners", plotId ?? ""],
    open && plotId ? `/api/plots/${plotId}/owners` : null,
  );

  const {
    data: bewirtschafterDaten,
    isLoading: laedtBewirtschafter,
    error: fehlerBewirtschafter,
  } = useApiQuery<{ data: Eintrag[] }>(
    ["plot-farmers", plotId ?? ""],
    open && plotId ? `/api/plots/${plotId}/farmers` : null,
  );

  const { data: personenDaten } = useApiQuery<{ data: PersonRef[] }>(
    ["persons-dropdown"],
    open ? `/api/persons?limit=${PAGE_SIZE_DROPDOWN}` : null,
    { staleTime: 60_000 },
  );

  const eigentuemer = eigentuemerDaten?.data ?? [];
  const quoten = eigentuemerDaten?.quoten ?? null;
  const bewirtschafter = bewirtschafterDaten?.data ?? [];
  const personen: ComboboxOption[] = (personenDaten?.data ?? []).map((p) => ({
    value: p.id,
    label: personName(p),
  }));
  const laedt = laedtEigentuemer || laedtBewirtschafter;
  const fehler = fehlerEigentuemer ?? fehlerBewirtschafter;

  const neuLaden = useCallback(() => {
    invalidate(["plot-owners", plotId ?? ""]);
    invalidate(["plot-farmers", plotId ?? ""]);
  }, [invalidate, plotId]);

  async function anlegen(rolle: "owners" | "farmers", personId: string, anteil?: string) {
    if (!plotId) return;
    if (!personId) {
      toast.error(t("noPerson"));
      return;
    }
    const share = anteil ? Number(anteil.replace(",", ".")) : undefined;
    if (rolle === "owners" && (!share || share <= 0)) {
      toast.error(t("noShare"));
      return;
    }

    const res = await fetch(`/api/plots/${plotId}/${rolle}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        rolle === "owners" ? { personId, sharePercent: share } : { personId },
      ),
    });
    if (!res.ok) {
      const fehler = await res.json().catch(() => ({}));
      toast.error(fehler.message ?? fehler.error ?? t("loadError"));
      return;
    }
    toast.success(t("saved"));
    neuLaden();
  }

  async function beenden(rolle: "owners" | "farmers", eintragId: string) {
    if (!plotId) return;
    const res = await fetch(`/api/plots/${plotId}/${rolle}/${eintragId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validTo: heute() }),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).message ?? t("loadError"));
      return;
    }
    toast.success(t("ended_toast"));
    neuLaden();
  }

  async function entfernen(rolle: "owners" | "farmers", eintragId: string) {
    if (!plotId) return;
    const bestaetigt = await confirm({
      title: t("delete"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    });
    if (!bestaetigt) return;
    const res = await fetch(`/api/plots/${plotId}/${rolle}/${eintragId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).message ?? t("loadError"));
      return;
    }
    toast.success(t("deleted"));
    neuLaden();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {plotLabel ? t("subtitle", { plot: plotLabel }) : null}
          </DialogDescription>
        </DialogHeader>

        {fehler ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{t("loadError")}</span>
          </div>
        ) : laedt ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-8">
            <Abschnitt
              icon={<Users className="h-4 w-4" />}
              titel={t("ownersTitle")}
              hinweis={t("ownersHint")}
              eintraege={eigentuemer}
              mitAnteil
              leer={t("emptyOwners")}
              personen={personen}
              anlegenLabel={t("addOwner")}
              onAnlegen={(p, a) => anlegen("owners", p, a)}
              onBeenden={(id) => beenden("owners", id)}
              onEntfernen={(id) => entfernen("owners", id)}
              t={t}
            />

            {/*
              Die Quotensumme als Hinweis, nicht als Sperre. Ein halb erfasstes
              Grundbuch muss speicherbar bleiben — wer die Eingabe blockiert,
              erzwingt erfundene Quoten oder Notizfelder.
            */}
            {quoten && !quoten.stimmt && quoten.hinweis && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{quoten.hinweis}</span>
              </div>
            )}

            <Abschnitt
              icon={<Sprout className="h-4 w-4" />}
              titel={t("farmersTitle")}
              hinweis={t("farmersHint")}
              eintraege={bewirtschafter}
              leer={t("emptyFarmers")}
              personen={personen}
              anlegenLabel={t("addFarmer")}
              onAnlegen={(p) => anlegen("farmers", p)}
              onBeenden={(id) => beenden("farmers", id)}
              onEntfernen={(id) => entfernen("farmers", id)}
              t={t}
            />
          </div>
        )}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

interface AbschnittProps {
  icon: React.ReactNode;
  titel: string;
  hinweis: string;
  eintraege: Eintrag[];
  mitAnteil?: boolean;
  leer: string;
  personen: ComboboxOption[];
  anlegenLabel: string;
  onAnlegen: (personId: string, anteil?: string) => void | Promise<void>;
  onBeenden: (eintragId: string) => void | Promise<void>;
  onEntfernen: (eintragId: string) => void | Promise<void>;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function Abschnitt({
  icon,
  titel,
  hinweis,
  eintraege,
  mitAnteil,
  leer,
  personen,
  anlegenLabel,
  onAnlegen,
  onBeenden,
  onEntfernen,
  t,
}: AbschnittProps) {
  const [person, setPerson] = useState("");
  const [anteil, setAnteil] = useState("");
  const [speichert, setSpeichert] = useState(false);

  const laufend = (e: Eintrag) => !e.validTo;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {titel}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{hinweis}</p>
      </div>

      {eintraege.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {leer}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {eintraege.map((e) => (
            <li key={e.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{personName(e.person)}</span>
                  {laufend(e) ? (
                    <Badge variant="secondary">{t("current")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("ended")}</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {mitAnteil && e.sharePercent !== undefined && (
                    <span className="mr-3 font-mono">{e.sharePercent} %</span>
                  )}
                  {e.validFrom && <span className="mr-3">{t("colFrom")} {e.validFrom.slice(0, 10)}</span>}
                  {e.validTo && <span>{t("colTo")} {e.validTo.slice(0, 10)}</span>}
                </div>
              </div>

              {/*
                „Beenden" vorn, „Löschen" als stilles Symbol daneben. Der
                Wechsel ist der häufige Fall und der richtige Weg — er soll
                der bequemere sein.
              */}
              {laufend(e) && (
                <Button
                  variant="outline"
                  size="sm"
                  title={t("endHint")}
                  onClick={() => void onBeenden(e.id)}
                >
                  {t("end")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                title={t("deleteHint")}
                onClick={() => void onEntfernen(e.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs">{t("colPerson")}</Label>
          <Combobox
            options={personen}
            value={person}
            onChange={setPerson}
            placeholder={t("selectPerson")}
          />
        </div>
        {mitAnteil && (
          <div className="w-28">
            <Label className="text-xs">{t("colShare")}</Label>
            <Input
              inputMode="decimal"
              value={anteil}
              onChange={(ev) => setAnteil(ev.target.value)}
              placeholder={t("sharePlaceholder")}
            />
          </div>
        )}
        <Button
          size="sm"
          disabled={speichert}
          onClick={async () => {
            setSpeichert(true);
            try {
              await onAnlegen(person, mitAnteil ? anteil : undefined);
              setPerson("");
              setAnteil("");
            } finally {
              setSpeichert(false);
            }
          }}
        >
          {speichert ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          {anlegenLabel}
        </Button>
      </div>
    </section>
  );
}
