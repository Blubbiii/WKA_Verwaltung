/**
 * Fixed Asset Depreciation (AfA) Driver — Phase 14.
 *
 * Liest aktive Assets eines Tenants und ruft die Pure-Funktion
 * calculateAfaSchedule() für jeden Monat im Zeitraum. Persistiert pro
 * Monat eine FixedAssetDepreciation-Row (statt vorher eine Aggregat-Row
 * pro Aufruf) und optional eine JournalEntry-Buchung pro Asset+Monat.
 *
 * Idempotenz: pro (assetId, periodStart, periodEnd) prüfen wir vorher
 * gegen bestehende Records — alte Schedules bleiben unangetastet.
 *
 * Period-Lock-Gate (P9): wenn createPostings=true UND ein Monat im
 * Zeitraum gesperrt ist, wird DAS ASSET übersprungen (Schedule-Erstellung
 * + Posting bleiben atomar pro Asset).
 *
 * DECLINING_BALANCE-Check (P14): bei Anschaffungsdatum ≥ 2023-01-01 wirft
 * calculateMonthlyAfa() DegressiveNotAllowedError → wir loggen + überspringen.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { logger } from "@/lib/logger";
import { loadAfaConfig } from "@/lib/system-settings";
import { assertPeriodOpen, PeriodLockedError } from "./period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";
import {
  calculateAfaSchedule,
  DegressiveNotAllowedError,
  resolveAfaMethod,
} from "./afa";

/**
 * Kompatibilitäts-Wrapper für Alt-Aufrufer (z.B. Tests die die alte API
 * nutzen). Berechnet eine grobe monatliche LINEAR-AfA — neue Aufrufer
 * sollten calculateMonthlyAfa aus ./afa.ts nutzen.
 *
 * @deprecated P14: Nutze calculateMonthlyAfa() aus @/lib/accounting/afa.
 */
export function calculateLinearDepreciation(
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number,
  alreadyDepreciated: number,
): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciableAmount = acquisitionCost - residualValue;
  if (depreciableAmount <= 0) return 0;
  const totalRemaining = depreciableAmount - alreadyDepreciated;
  if (totalRemaining <= 0) return 0;
  const monthlyAmount = depreciableAmount / usefulLifeMonths;
  return Math.min(monthlyAmount, totalRemaining);
}

export interface DepreciationScheduleItem {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  bookValueAfter: number;
}

/**
 * Run depreciation for all active assets of a tenant for a given period.
 * P14: monatsgenaue Iteration — pro Monat im Zeitraum eine Schedule-Row.
 */
export async function runDepreciation(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  userId: string,
  createPostings: boolean = false,
): Promise<{ processedCount: number; totalAmount: number; warnings: string[] }> {
  const [assets, afaConfig] = await Promise.all([
    prisma.fixedAsset.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        depreciations: {
          orderBy: { periodEnd: "asc" },
        },
      },
    }),
    loadAfaConfig(),
  ]);

  let processedCount = 0;
  let totalAmount = 0;
  let postingsCreated = 0;
  const warnings: string[] = [];

  // P14: Cache locked-months per (year, month) — mehrere Assets teilen sich
  // dieselben Perioden, sonst wird assertPeriodOpen N×M mal gerufen.
  const periodLockCache = new Map<string, boolean>(); // "YYYY-MM" → locked?
  const isMonthLocked = async (year: number, month: number): Promise<boolean> => {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const cached = periodLockCache.get(key);
    if (cached !== undefined) return cached;
    try {
      await assertPeriodOpen(tenantId, new Date(Date.UTC(year, month - 1, 28)));
      periodLockCache.set(key, false);
      return false;
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        periodLockCache.set(key, true);
        return true;
      }
      throw err;
    }
  };

  for (const asset of assets) {
    const acquisitionCost = Number(asset.acquisitionCost);
    const residualValue = Number(asset.residualValue);
    const alreadyDepreciated = asset.depreciations.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );

    // P14: Methoden-Auflösung (Backwards-Compat).
    const method = resolveAfaMethod({
      afaMethod: asset.afaMethod,
      depreciationMethod: asset.depreciationMethod,
    });

    // Schedule für den Zeitraum berechnen (kann throw DegressiveNotAllowedError).
    let schedule;
    try {
      schedule = calculateAfaSchedule(
        {
          acquisitionDate: asset.acquisitionDate,
          acquisitionCost,
          residualValue,
          usefulLifeMonths: asset.usefulLifeMonths,
          method,
          alreadyDepreciated,
          disposalDate: asset.disposalDate,
        },
        periodStart,
        periodEnd,
        afaConfig,
      );
    } catch (err) {
      if (err instanceof DegressiveNotAllowedError) {
        warnings.push(
          `Asset ${asset.assetNumber}: degressive AfA seit 2023 unzulässig (Anschaffung ${err.acquisitionDate.toISOString().slice(0, 10)}). Bitte auf LINEAR umstellen.`,
        );
        continue;
      }
      throw err;
    }

    // P9: Wenn Posting verlangt und IRGENDEIN Monat im Schedule gesperrt ist,
    // überspringe das ganze Asset (sonst halb-konsistenter Zustand).
    // P14: nutze periodLockCache, sonst pro (Asset × Monat) 1 assertPeriodOpen.
    if (createPostings && asset.depAccountNumber && asset.accountNumber) {
      let anyLocked = false;
      for (const { year, month } of schedule) {
        if (await isMonthLocked(year, month)) {
          anyLocked = true;
          break;
        }
      }
      if (anyLocked) {
        warnings.push(
          `Asset ${asset.assetNumber}: mindestens ein Monat im Zeitraum ist gesperrt — Posting übersprungen.`,
        );
        continue;
      }
    }

    // Für jeden Monat im Schedule eine Row anlegen (idempotent prüfen).
    for (const { year, month, result } of schedule) {
      if (result.amount === 0) continue;

      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      // Letzter Tag des Monats (Date.UTC mit Tag 0 des Folgemonats).
      const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

      // Idempotenz: skip wenn für diesen Monat schon ein Schedule existiert.
      const exists = asset.depreciations.some(
        (d) =>
          d.periodStart.getUTCFullYear() === year &&
          d.periodStart.getUTCMonth() + 1 === month,
      );
      if (exists) continue;

      let journalEntryId: string | null = null;

      // Optional: Buchung anlegen.
      if (createPostings && asset.depAccountNumber && asset.accountNumber) {
        const je = await prisma.journalEntry.create({
          data: {
            tenantId,
            entryDate: monthEnd,
            description: `AfA: ${asset.name} ${year}-${String(month).padStart(2, "0")}`.slice(0, 200),
            status: "POSTED",
            source: "AUTO",
            referenceType: "FixedAsset",
            referenceId: asset.id,
            createdById: userId,
            lines: {
              create: [
                {
                  lineNumber: 1,
                  account: asset.depAccountNumber,
                  description: `AfA ${asset.name}`,
                  debitAmount: result.amount,
                  creditAmount: null,
                },
                {
                  lineNumber: 2,
                  account: asset.accountNumber,
                  description: `AfA ${asset.name}`,
                  debitAmount: null,
                  creditAmount: result.amount,
                },
              ],
            },
          },
          select: { id: true },
        });
        journalEntryId = je.id;
        postingsCreated++;
      }

      await prisma.fixedAssetDepreciation.create({
        data: {
          assetId: asset.id,
          periodStart: monthStart,
          periodEnd: monthEnd,
          amount: new Decimal(result.amount),
          bookValueBefore: new Decimal(result.bookValueBefore),
          bookValue: new Decimal(Math.max(result.bookValueAfter, residualValue)),
          journalEntryId,
        },
      });

      processedCount++;
      totalAmount += result.amount;

      // Mark fully depreciated wenn diese Buchung das Asset auf Restwert bringt.
      if (result.fullyDepreciated && asset.status !== "FULLY_DEPRECIATED") {
        await prisma.fixedAsset.update({
          where: { id: asset.id },
          data: { status: "FULLY_DEPRECIATED" },
        });
      }
    }
  }

  if (warnings.length > 0) {
    logger.warn({ warnings }, "Depreciation run completed with warnings");
  }

  // Wenn AfA-Buchungen erzeugt wurden (createPostings=true und mind.
  // ein Asset mit Konten), Reports-Cache invalidieren — Bilanz/GuV/Anlagenspiegel
  // ändern sich. Fire-and-forget.
  if (postingsCreated > 0) {
    invalidateReportsCache(tenantId).catch((err) => {
      logger.warn(
        { err, tenantId, postingsCreated },
        "[Reports-Cache] Invalidation failed after depreciation run",
      );
    });
  }

  return { processedCount, totalAmount, warnings };
}
