"use client";

/**
 * Pickers for master data with "create" as last entry: Windpark,
 * Gesellschaft, Kontakt (Vertragspartner, Verpächter …), Lieferant, Gemeinde,
 * Kostenstelle. Each loads its list, knows the permission to create and
 * opens the same full form the list page uses.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { PAGE_SIZE_SELECTABLE } from "@/lib/config/pagination";
import { FundCreateForm } from "@/components/funds/fund-create-form";
import { ParkWizard } from "@/components/parks/park-wizard";
import { KontaktAnlegenDialog } from "@/components/crm/kontakt-anlegen-dialog";
import { VendorDialog } from "@/components/vendors/vendor-dialog";
import { GemeindeDialog } from "@/components/verwaltung/gemeinde-dialog";
import { KostenstelleDialog } from "@/components/wirtschaftsplan/kostenstelle-dialog";
import { AuswahlMitAnlegen } from "./auswahl-mit-anlegen";

export interface AuswahlProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  /** Entry for "none", e.g. "Keine Gesellschaft". */
  leerText?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /** After creating a record — e.g. for the form to reload its own lists. */
  onAngelegt?: (eintrag: { id: string; name: string }) => void;
}

type Zeile = Record<string, unknown> & { id: string };

async function liste(url: string): Promise<Zeile[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const j = await res.json();
  return (Array.isArray(j) ? j : j.data ?? []) as Zeile[];
}

function useListe(schluessel: string, url: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["auswahl", schluessel], queryFn: () => liste(url), staleTime: 60_000 });
  return {
    zeilen: query.data ?? [],
    laedt: query.isLoading,
    // Other pickers of the same kind on the page see the new record too.
    neuLaden: () => queryClient.invalidateQueries({ queryKey: ["auswahl", schluessel] }),
  };
}

const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// ---------------------------------------------------------------------------

export function GesellschaftAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { zeilen, laedt, neuLaden } = useListe("funds", `/api/funds?limit=${PAGE_SIZE_SELECTABLE}`);
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((f) => ({ value: f.id, label: String(f.name), description: s(f.legalForm) }))}
      loading={laedt}
      texte={{ neu: t("gesellschaft.neu"), mitName: t("gesellschaft.mitName") }}
      darfAnlegen={hasPermission("funds:create")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <Dialog open={d.open} onOpenChange={d.onOpenChange}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("gesellschaft.titel")}</DialogTitle>
              <DialogDescription>{t("hinweis")}</DialogDescription>
            </DialogHeader>
            <FundCreateForm vorbelegung={d.vorbelegung} onCreated={d.onAngelegt} onCancel={() => d.onOpenChange(false)} />
          </DialogContent>
        </Dialog>
      )}
    />
  );
}

export function ParkAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { zeilen, laedt, neuLaden } = useListe("parks", `/api/parks?limit=${PAGE_SIZE_SELECTABLE}`);
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((p) => ({ value: p.id, label: String(p.name), description: s(p.shortName) ?? s(p.city) }))}
      loading={laedt}
      texte={{ neu: t("park.neu"), mitName: t("park.mitName") }}
      darfAnlegen={hasPermission("parks:create")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <Dialog open={d.open} onOpenChange={d.onOpenChange}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("park.titel")}</DialogTitle>
              <DialogDescription>{t("hinweis")}</DialogDescription>
            </DialogHeader>
            <ParkWizard vorbelegung={d.vorbelegung} onCreated={d.onAngelegt} onCancel={() => d.onOpenChange(false)} />
          </DialogContent>
        </Dialog>
      )}
    />
  );
}

export function KontaktAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { flags } = useFeatureFlags();
  const { zeilen, laedt, neuLaden } = useListe("persons", `/api/persons?limit=${PAGE_SIZE_SELECTABLE}`);
  // Through the CRM route when allowed (it checks for duplicates); otherwise
  // the person route, which needs lease permissions only.
  const crm = flags.crm && hasPermission("crm:create");
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((p) => {
        const firma = p.personType === "legal";
        return {
          value: p.id,
          label: firma ? String(p.companyName ?? "") : `${s(p.firstName) ?? ""} ${s(p.lastName) ?? ""}`.trim(),
          description: firma ? t("kontakt.firma") : t("kontakt.person"),
          keywords: [s(p.email), s(p.city)].filter(Boolean).join(" "),
        };
      })}
      loading={laedt}
      texte={{ neu: t("kontakt.neu"), mitName: t("kontakt.mitName") }}
      darfAnlegen={crm || hasPermission("leases:create")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <KontaktAnlegenDialog
          open={d.open}
          onOpenChange={d.onOpenChange}
          vorbelegung={d.vorbelegung}
          onCreated={d.onAngelegt}
          onExisting={d.onAngelegt}
          vorhandenenText={t("kontakt.vorhandenen")}
          endpoint={crm ? "/api/crm/contacts" : "/api/persons"}
        />
      )}
    />
  );
}

export function LieferantAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { zeilen, laedt, neuLaden } = useListe("vendors", `/api/vendors?limit=${PAGE_SIZE_SELECTABLE}`);
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((v) => ({ value: v.id, label: String(v.name), description: s(v.city) }))}
      loading={laedt}
      texte={{ neu: t("lieferant.neu"), mitName: t("lieferant.mitName") }}
      darfAnlegen={hasPermission("vendors:create")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <VendorDialog
          open={d.open}
          onClose={() => d.onOpenChange(false)}
          vorbelegung={d.vorbelegung}
          onSaved={(v) => v && d.onAngelegt(v)}
        />
      )}
    />
  );
}

export function GemeindeAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { zeilen, laedt, neuLaden } = useListe("municipalities", "/api/municipalities");
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((m) => ({ value: m.id, label: String(m.name), description: s(m.officialKey) }))}
      loading={laedt}
      texte={{ neu: t("gemeinde.neu"), mitName: t("gemeinde.mitName") }}
      darfAnlegen={hasPermission("turbines:update")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <GemeindeDialog open={d.open} onOpenChange={d.onOpenChange} vorbelegung={d.vorbelegung} onSaved={d.onAngelegt} />
      )}
    />
  );
}

export function KostenstelleAuswahl(props: AuswahlProps) {
  const t = useTranslations("common.auswahl");
  const { hasPermission } = usePermissions();
  const { zeilen, laedt, neuLaden } = useListe("cost-centers", "/api/cost-centers");
  return (
    <AuswahlMitAnlegen
      {...props}
      optionen={zeilen.map((k) => ({ value: k.id, label: `${String(k.code)} – ${String(k.name)}`, keywords: String(k.name) }))}
      loading={laedt}
      texte={{ neu: t("kostenstelle.neu"), mitName: t("kostenstelle.mitName") }}
      darfAnlegen={hasPermission("wirtschaftsplan:create")}
      onAngelegt={(e) => {
        neuLaden();
        props.onAngelegt?.(e);
      }}
      dialog={(d) => (
        <KostenstelleDialog open={d.open} onOpenChange={d.onOpenChange} vorbelegung={d.vorbelegung} onCreated={d.onAngelegt} />
      )}
    />
  );
}
