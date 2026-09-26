/**
 * Licence of a customer (decision 2026-09): what the booked tariff covers,
 * how much is used, and what follows from exceeding it.
 *
 * Counted per customer (tenant):
 *   firmen        actively managed companies (funds), without substations
 *   umspannwerke  actively managed substation companies (category UMSPANNWERK)
 *   wea           turbines of device type WEA, not archived
 *   benutzer      active users without a shareholder link (portal users are free)
 *   speicherMb    stored files
 * Companies the customer only holds a stake in are not counted.
 *
 * Exceeding a limit blocks creating more of that kind at once; after
 * KARENZ_TAGE also editing master data is blocked. Reading, export,
 * deleting and all billing keep working — otherwise the lock would hit
 * third parties (lessors, shareholders) and retention duties.
 */

export type Zaehler = "firmen" | "umspannwerke" | "wea" | "benutzer" | "speicherMb";
export const ZAEHLER: Zaehler[] = ["firmen", "umspannwerke", "wea", "benutzer", "speicherMb"];

export type Verbrauch = Record<Zaehler, number>;
/** null = unlimited */
export type Grenzen = Record<Zaehler, number | null>;

export interface TarifGrenzen {
  name: string;
  maxFirmen: number | null;
  maxUmspannwerke: number | null;
  maxWea: number | null;
  maxBenutzer: number | null;
  maxSpeicherMb: number | null;
}

/** Per-customer exception, only for the counters it names. */
export type Abweichung = Partial<Record<Zaehler, number | null>>;

export const KARENZ_TAGE = 30;
const TAG_MS = 86_400_000;

export function wirksameGrenzen(tarif: TarifGrenzen | null, abweichung: Abweichung | null): Grenzen {
  const basis: Grenzen = tarif
    ? {
        firmen: tarif.maxFirmen,
        umspannwerke: tarif.maxUmspannwerke,
        wea: tarif.maxWea,
        benutzer: tarif.maxBenutzer,
        speicherMb: tarif.maxSpeicherMb,
      }
    : { firmen: null, umspannwerke: null, wea: null, benutzer: null, speicherMb: null };
  return { ...basis, ...(abweichung ?? {}) };
}

export interface Verweigerung {
  zaehler: Zaehler;
  grenze: number;
  verbrauch: number;
}

/** Null when `anzahl` more fit, otherwise what stands in the way. */
export function anlegenVerweigert(
  grenzen: Grenzen,
  verbrauch: Verbrauch,
  zaehler: Zaehler,
  anzahl = 1,
): Verweigerung | null {
  const grenze = grenzen[zaehler];
  if (grenze === null || verbrauch[zaehler] + anzahl <= grenze) return null;
  return { zaehler, grenze, verbrauch: verbrauch[zaehler] };
}

const BEZEICHNUNG: Record<Zaehler, [string, string]> = {
  firmen: ["Firma", "Firmen"],
  umspannwerke: ["Umspannwerk", "Umspannwerke"],
  wea: ["WEA", "WEA"],
  benutzer: ["Benutzer", "Benutzer"],
  speicherMb: ["MB Speicher", "MB Speicher"],
};

export function lizenzMeldung(tarifName: string, v: Verweigerung): string {
  const [einzahl, mehrzahl] = BEZEICHNUNG[v.zaehler];
  const umfang = `${v.grenze} ${v.grenze === 1 ? einzahl : mehrzahl}`;
  const stand = v.verbrauch === 1 ? "angelegt ist 1" : `angelegt sind ${v.verbrauch}`;
  return `Ihr Tarif ${tarifName} umfasst ${umfang}, ${stand}. Bitte buchen Sie eine größere Stufe.`;
}

export interface LizenzLage {
  zeilen: { zaehler: Zaehler; verbrauch: number; grenze: number | null; ueber: boolean }[];
  ueberschritten: Zaehler[];
  /** End of the grace period, null when within limits. */
  karenzBis: Date | null;
  gesperrt: boolean;
}

export function lizenzLage(
  grenzen: Grenzen,
  verbrauch: Verbrauch,
  ueberschrittenSeit: Date | null,
  jetzt: Date,
): LizenzLage {
  const zeilen = ZAEHLER.map((zaehler) => {
    const grenze = grenzen[zaehler];
    return { zaehler, verbrauch: verbrauch[zaehler], grenze, ueber: grenze !== null && verbrauch[zaehler] > grenze };
  });
  const ueberschritten = zeilen.filter((z) => z.ueber).map((z) => z.zaehler);
  if (ueberschritten.length === 0) return { zeilen, ueberschritten, karenzBis: null, gesperrt: false };
  const seit = ueberschrittenSeit ?? jetzt;
  const karenzBis = new Date(seit.getTime() + KARENZ_TAGE * TAG_MS);
  return { zeilen, ueberschritten, karenzBis, gesperrt: jetzt >= karenzBis };
}

/** Modules whose work must go on even after the grace period. */
const IMMER_FREI = new Set(["invoices", "energy", "leases", "management-billing", "users", "funds", "settings"]);

/**
 * Does the lock after the grace period apply to this permission?
 * Only creating and editing master data; reading, export and delete stay
 * free (deleting is how a customer gets back within limits).
 */
export function sperrtNachKarenz(recht: string): boolean {
  const [modul, aktion] = recht.split(":");
  if (IMMER_FREI.has(modul)) return false;
  return aktion === "create" || aktion === "update";
}

export interface FirmaStand {
  verwaltung: "AKTIV" | "BETEILIGUNG";
  status: string;
  kategorieCode: string | null;
}

export const UMSPANNWERK_CODE = "UMSPANNWERK";

/** Counter a company falls under, or null when it does not count. */
export function zaehlerFuerFirma(f: FirmaStand): "firmen" | "umspannwerke" | null {
  if (f.verwaltung !== "AKTIV" || f.status === "ARCHIVED") return null;
  return f.kategorieCode === UMSPANNWERK_CODE ? "umspannwerke" : "firmen";
}

/** On a change: the counter that has to take one more, or null. */
export function neuGezaehlt(vorher: FirmaStand, nachher: FirmaStand): "firmen" | "umspannwerke" | null {
  const neu = zaehlerFuerFirma(nachher);
  return neu && neu !== zaehlerFuerFirma(vorher) ? neu : null;
}
