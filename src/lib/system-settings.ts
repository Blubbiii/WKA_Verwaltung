/**
 * Globale System-Settings für gesetzlich vorgegebene Werte.
 *
 * Werte stehen mandantenübergreifend in der DB (Tabelle system_settings).
 * Wenn der Gesetzgeber z.B. den GWG-Schwellbetrag von 800 € auf 1.000 €
 * ändert, sehen ALLE Tenants sofort den neuen Wert.
 *
 * Lookup-Reihenfolge:
 *   1. Redis-Cache (10 min TTL)
 *   2. DB
 *   3. Hardcoded DEFAULT (Fallback wenn DB-Tabelle leer ist)
 *
 * Die DEFAULTS hier sind die Rechtsstände vom 01.06.2026 und sind die
 * Bootstrap-Werte beim erstmaligen Seed. Sobald ein Super-Admin einen
 * Wert ändert, gilt der DB-Wert.
 */

import { prisma } from "@/lib/prisma";

/** Alle bekannten Setting-Keys mit Default + Kategorie. */
export const SYSTEM_SETTING_DEFAULTS = {
  // GWG-Schwellen §6 EStG
  GWG_SOFORT_THRESHOLD_NET_EUR: {
    value: 800 as number,
    category: "GWG",
    description: "§6 Abs. 2 EStG — Sofortabzug-Obergrenze (Netto)",
  },
  GWG_POOL_LOWER_NET_EUR: {
    value: 250 as number,
    category: "GWG",
    description: "§6 Abs. 2a EStG — Sammelposten-Untergrenze (Netto)",
  },
  GWG_POOL_UPPER_NET_EUR: {
    value: 1000 as number,
    category: "GWG",
    description: "§6 Abs. 2a EStG — Sammelposten-Obergrenze (Netto)",
  },
  GWG_POOL_YEARS: {
    value: 5 as number,
    category: "GWG",
    description: "§6 Abs. 2a EStG — Pool-Laufzeit in Jahren",
  },
  // AfA §7 EStG
  DEGRESSIVE_AFA_CUTOFF: {
    value: "2023-01-01" as string,
    category: "AFA",
    description:
      "§52 Abs. 14a EStG — Stichtag ab dem degressive AfA für Neuanschaffungen unzulässig ist",
  },
  // Gewerbesteuer §8 GewStG
  GEWST_FREIBETRAG_EUR: {
    value: 200_000 as number,
    category: "GEWST",
    description: "§8 Nr 1 GewStG — Hinzurechnungs-Freibetrag",
  },
  GEWST_HINZURECHNUNG_QUOTE: {
    value: 0.25 as number,
    category: "GEWST",
    description: "§8 Nr 1 GewStG — Hinzurechnungs-Quote (1/4)",
  },
  GEWST_QUOTE_INTEREST: {
    value: 1.0 as number,
    category: "GEWST",
    description: "§8 Nr 1a GewStG — Schuldzinsen 100%",
  },
  GEWST_QUOTE_RENT_MOVABLE: {
    value: 0.2 as number,
    category: "GEWST",
    description: "§8 Nr 1d GewStG — Miete bewegliche WG (1/5)",
  },
  GEWST_QUOTE_RENT_IMMOVABLE: {
    value: 0.5 as number,
    category: "GEWST",
    description: "§8 Nr 1e GewStG — Pacht Immobilien (1/2)",
  },
  GEWST_QUOTE_LICENSE: {
    value: 0.25 as number,
    category: "GEWST",
    description: "§8 Nr 1f GewStG — Lizenzen (1/4)",
  },
  // Verzugszinsen §288 BGB
  VERZUGSZINS_B2B_LUMP_SUM_EUR: {
    value: 40 as number,
    category: "VERZUGSZINS",
    description: "§288 Abs. 5 BGB — B2B-Pauschale",
  },
  VERZUGSZINS_B2B_SURCHARGE_POINTS: {
    value: 9 as number,
    category: "VERZUGSZINS",
    description: "§288 Abs. 2 BGB — B2B-Aufschlag auf Basiszinssatz (%-Pkt)",
  },
  VERZUGSZINS_B2C_SURCHARGE_POINTS: {
    value: 5 as number,
    category: "VERZUGSZINS",
    description: "§288 Abs. 1 BGB — B2C-Aufschlag auf Basiszinssatz (%-Pkt)",
  },
  // §33 UStDV Kleinbetragsrechnung
  KLEINBETRAG_THRESHOLD_EUR: {
    value: 250 as number,
    category: "USTG",
    description: "§33 UStDV — Brutto-Obergrenze für vereinfachte Pflichtangaben",
  },
} as const;

export type SystemSettingKey = keyof typeof SYSTEM_SETTING_DEFAULTS;

/** In-process-Cache mit 10 min TTL für die Settings. */
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { values: Record<string, unknown>; fetchedAt: number } | null = null;

/**
 * Liefert alle Settings als Record. Cached für 10 Minuten.
 * Wird beim ersten Aufruf gefüllt; fehlende Keys werden mit Defaults aufgefüllt.
 */
async function loadAllSettings(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.values;
  }

  const dbRows = await prisma.systemSetting.findMany({
    select: { key: true, value: true },
  });

  const values: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(SYSTEM_SETTING_DEFAULTS)) {
    values[key] = def.value;
  }
  for (const row of dbRows) {
    values[row.key] = row.value;
  }

  cache = { values, fetchedAt: now };
  return values;
}

/**
 * Liefert einen einzelnen Setting-Wert. Typsicher per Key.
 */
export async function getSystemSetting<K extends SystemSettingKey>(
  key: K,
): Promise<(typeof SYSTEM_SETTING_DEFAULTS)[K]["value"]> {
  const all = await loadAllSettings();
  return all[key] as (typeof SYSTEM_SETTING_DEFAULTS)[K]["value"];
}

/**
 * Invalidiert den Cache. Wird vom Super-Admin-PATCH-Handler aufgerufen
 * nach einer Änderung. Innerhalb von Tests kann der Cache zwischen Runs
 * frisch gehalten werden.
 */
export function invalidateSystemSettingsCache(): void {
  cache = null;
}

/**
 * Idempotenter Seed: füllt die DB-Tabelle mit den Default-Werten,
 * sofern noch nicht vorhanden. Wird vom Super-Admin-GET-Handler beim
 * ersten Aufruf gerufen und vom Backfill-Script.
 *
 * @returns Anzahl neu angelegter Records
 */
export async function seedSystemSettings(userId: string): Promise<number> {
  const existing = await prisma.systemSetting.findMany({
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((r) => r.key));

  let inserted = 0;
  for (const [key, def] of Object.entries(SYSTEM_SETTING_DEFAULTS)) {
    if (existingKeys.has(key)) continue;
    await prisma.systemSetting.create({
      data: {
        key,
        value: def.value as unknown as object,
        category: def.category,
        description: def.description,
        updatedById: userId,
      },
    });
    inserted++;
  }
  if (inserted > 0) invalidateSystemSettingsCache();
  return inserted;
}

// =============================================================================
// Strongly-typed Config-Bundles für die Module
// =============================================================================

export interface AfaSystemConfig {
  gwgSofortThresholdEur: number;
  gwgPoolLowerEur: number;
  gwgPoolUpperEur: number;
  gwgPoolYears: number;
  degressiveCutoff: Date;
}

export async function loadAfaConfig(): Promise<AfaSystemConfig> {
  const [a, b, c, d, e] = await Promise.all([
    getSystemSetting("GWG_SOFORT_THRESHOLD_NET_EUR"),
    getSystemSetting("GWG_POOL_LOWER_NET_EUR"),
    getSystemSetting("GWG_POOL_UPPER_NET_EUR"),
    getSystemSetting("GWG_POOL_YEARS"),
    getSystemSetting("DEGRESSIVE_AFA_CUTOFF"),
  ]);
  return {
    gwgSofortThresholdEur: a,
    gwgPoolLowerEur: b,
    gwgPoolUpperEur: c,
    gwgPoolYears: d,
    degressiveCutoff: new Date(e),
  };
}

export interface GewStSystemConfig {
  freibetragEur: number;
  hinzurechnungsQuote: number;
  quoteInterest: number;
  quoteRentMovable: number;
  quoteRentImmovable: number;
  quoteLicense: number;
}

export async function loadGewStConfig(): Promise<GewStSystemConfig> {
  const [f, h, i, m, im, l] = await Promise.all([
    getSystemSetting("GEWST_FREIBETRAG_EUR"),
    getSystemSetting("GEWST_HINZURECHNUNG_QUOTE"),
    getSystemSetting("GEWST_QUOTE_INTEREST"),
    getSystemSetting("GEWST_QUOTE_RENT_MOVABLE"),
    getSystemSetting("GEWST_QUOTE_RENT_IMMOVABLE"),
    getSystemSetting("GEWST_QUOTE_LICENSE"),
  ]);
  return {
    freibetragEur: f,
    hinzurechnungsQuote: h,
    quoteInterest: i,
    quoteRentMovable: m,
    quoteRentImmovable: im,
    quoteLicense: l,
  };
}

export interface VerzugszinsSystemConfig {
  b2bLumpSumEur: number;
  b2bSurchargePoints: number;
  b2cSurchargePoints: number;
}

export async function loadVerzugszinsConfig(): Promise<VerzugszinsSystemConfig> {
  const [a, b, c] = await Promise.all([
    getSystemSetting("VERZUGSZINS_B2B_LUMP_SUM_EUR"),
    getSystemSetting("VERZUGSZINS_B2B_SURCHARGE_POINTS"),
    getSystemSetting("VERZUGSZINS_B2C_SURCHARGE_POINTS"),
  ]);
  return { b2bLumpSumEur: a, b2bSurchargePoints: b, b2cSurchargePoints: c };
}

export interface UstgSystemConfig {
  kleinbetragThresholdEur: number;
}

export async function loadUstgConfig(): Promise<UstgSystemConfig> {
  return {
    kleinbetragThresholdEur: await getSystemSetting("KLEINBETRAG_THRESHOLD_EUR"),
  };
}
