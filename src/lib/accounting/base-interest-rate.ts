/**
 * §247 BGB Basiszinssatz-Lookup (Phase 16).
 *
 * Liefert den am Stichtag gültigen Basiszinssatz. Die Tabelle wird
 * halbjährlich von der Bundesbank veröffentlicht (zum 1.1. und 1.7.).
 *
 * Seed-Liste hier ist eine Bootstrap-Hilfe — Tenants können die Tabelle
 * über die API (POST /api/buchhaltung/base-interest-rates) selbst pflegen.
 */

import { prisma } from "@/lib/prisma";
import type { TxClient } from "@/lib/invoices/numberGenerator";

/** Bundesbank-Basiszinssatz historisch (§247 BGB). Wird beim ersten Aufruf geseedet. */
export const BUNDESBANK_BASE_RATES: ReadonlyArray<{
  validFrom: string;
  rate: number;
  source: string;
}> = [
  { validFrom: "2020-01-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2020-07-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2021-01-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2021-07-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2022-01-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2022-07-01", rate: -0.88, source: "Bundesbank §247 BGB" },
  { validFrom: "2023-01-01", rate: 1.62, source: "Bundesbank §247 BGB" },
  { validFrom: "2023-07-01", rate: 3.12, source: "Bundesbank §247 BGB" },
  { validFrom: "2024-01-01", rate: 3.62, source: "Bundesbank §247 BGB" },
  { validFrom: "2024-07-01", rate: 3.37, source: "Bundesbank §247 BGB" },
  { validFrom: "2025-01-01", rate: 2.27, source: "Bundesbank §247 BGB" },
  { validFrom: "2025-07-01", rate: 1.27, source: "Bundesbank §247 BGB" },
  { validFrom: "2026-01-01", rate: 1.27, source: "Bundesbank §247 BGB" },
];

/**
 * Liefert den am Datum geltenden Basiszinssatz in %. Wenn die Tabelle leer
 * ist, fallen wir auf 0% zurück (konservativ — Verzugszinsen werden nur
 * mit Aufschlag berechnet). Wenn das Datum vor dem ersten Eintrag liegt,
 * nehmen wir den ältesten verfügbaren Satz.
 */
export async function getBaseRateAt(
  asOf: Date,
  tx?: TxClient,
): Promise<number> {
  const client = tx ?? prisma;
  const rate = await client.baseInterestRate.findFirst({
    where: { validFrom: { lte: asOf } },
    orderBy: { validFrom: "desc" },
  });
  if (rate === null) {
    // Falls Tabelle leer: ältesten Eintrag versuchen.
    const first = await client.baseInterestRate.findFirst({
      orderBy: { validFrom: "asc" },
    });
    if (first) return Number(first.ratePercent);
    return 0;
  }
  return Number(rate.ratePercent);
}

/**
 * Seedet die Tabelle BaseInterestRate mit den Bundesbank-Werten, falls
 * sie leer ist. Idempotent via skipDuplicates. Wird vom Backfill-Script
 * und beim ersten API-GET aufgerufen.
 */
export async function seedBundesbankRates(): Promise<number> {
  const result = await prisma.baseInterestRate.createMany({
    data: BUNDESBANK_BASE_RATES.map((r) => ({
      validFrom: new Date(r.validFrom),
      ratePercent: r.rate,
      source: r.source,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
