/**
 * Tariff form state (strings, as the inputs hold them) and its mapping to
 * the route input (tarif-schema). Empty limit = unlimited, empty price =
 * "on request", included services one per line.
 */

import { parseAmount } from "@/lib/parse-amount";
import type { TarifEingabe } from "./tarif-schema";

export interface TarifFormular {
  key: string;
  name: string;
  beschreibung: string;
  preisMonatEur: string;
  preisHinweis: string;
  maxFirmen: string;
  maxUmspannwerke: string;
  maxWea: string;
  maxBenutzer: string;
  maxSpeicherMb: string;
  leistungen: string;
  hervorgehoben: boolean;
  sichtbar: boolean;
  sortierung: string;
}

export function leeresTarifFormular(): TarifFormular {
  return {
    key: "",
    name: "",
    beschreibung: "",
    preisMonatEur: "",
    preisHinweis: "zzgl. MwSt.",
    maxFirmen: "",
    maxUmspannwerke: "",
    maxWea: "",
    maxBenutzer: "",
    maxSpeicherMb: "",
    leistungen: "",
    hervorgehoben: false,
    sichtbar: true,
    sortierung: "0",
  };
}

const ganzzahl = (v: string) => {
  const n = parseAmount(v);
  return n === null ? null : Math.max(0, Math.round(n));
};
const text = (v: string) => v.trim() || null;

export function tarifAusFormular(f: TarifFormular): TarifEingabe {
  return {
    key: f.key.trim().toLowerCase(),
    name: f.name.trim(),
    beschreibung: text(f.beschreibung),
    preisMonatEur: parseAmount(f.preisMonatEur),
    preisHinweis: text(f.preisHinweis),
    maxFirmen: ganzzahl(f.maxFirmen),
    maxUmspannwerke: ganzzahl(f.maxUmspannwerke),
    maxWea: ganzzahl(f.maxWea),
    maxBenutzer: ganzzahl(f.maxBenutzer),
    maxSpeicherMb: ganzzahl(f.maxSpeicherMb),
    leistungen: f.leistungen
      .split("\n")
      .map((z) => z.trim())
      .filter(Boolean),
    hervorgehoben: f.hervorgehoben,
    sichtbar: f.sichtbar,
    sortierung: ganzzahl(f.sortierung) ?? 0,
  };
}

/** The route returns decimals as strings — accept both. */
type TarifDaten = Omit<TarifEingabe, "preisMonatEur"> & { preisMonatEur: string | number | null };

export function formularAusTarif(t: TarifDaten): TarifFormular {
  const zahl = (n: number | null) => (n === null ? "" : String(n));
  return {
    key: t.key,
    name: t.name,
    beschreibung: t.beschreibung ?? "",
    preisMonatEur:
      t.preisMonatEur === null ? "" : Number(t.preisMonatEur).toFixed(2).replace(".", ","),
    preisHinweis: t.preisHinweis ?? "",
    maxFirmen: zahl(t.maxFirmen),
    maxUmspannwerke: zahl(t.maxUmspannwerke),
    maxWea: zahl(t.maxWea),
    maxBenutzer: zahl(t.maxBenutzer),
    maxSpeicherMb: zahl(t.maxSpeicherMb),
    leistungen: t.leistungen.join("\n"),
    hervorgehoben: t.hervorgehoben,
    sichtbar: t.sichtbar,
    sortierung: String(t.sortierung),
  };
}
