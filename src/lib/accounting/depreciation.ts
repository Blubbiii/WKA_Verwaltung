/**
 * Fixed Asset Depreciation (AfA) calculation.
 * Supports linear and declining balance methods.
 */

import { prisma } from "@/lib/prisma";
import { MS_PER_DAY } from "@/lib/constants/time";

export interface DepreciationScheduleItem {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  bookValueAfter: number;
}

/**
 * Calculate monthly linear depreciation for an asset.
 */
export function calculateLinearDepreciation(
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number,
  alreadyDepreciated: number
): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciableAmount = acquisitionCost - residualValue;
  if (depreciableAmount <= 0) return 0;
  const totalRemaining = depreciableAmount - alreadyDepreciated;
  if (totalRemaining <= 0) return 0;
  const monthlyAmount = depreciableAmount / usefulLifeMonths;
  return Math.min(monthlyAmount, totalRemaining);
}

/**
 * Run depreciation for all active assets of a tenant for a given period.
 * Creates FixedAssetDepreciation records and optionally JournalEntry postings.
 */
export async function runDepreciation(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  userId: string,
  createPostings: boolean = false
): Promise<{ processedCount: number; totalAmount: number }> {
  const assets = await prisma.fixedAsset.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: {
      depreciations: {
        orderBy: { periodEnd: "desc" },
      },
    },
  });

  let processedCount = 0;
  let totalAmount = 0;

  for (const asset of assets) {
    // Skip if this period was already depreciated for this asset
    const alreadyRun = asset.depreciations.some(
      (d) => d.periodStart.getTime() === periodStart.getTime() && d.periodEnd.getTime() === periodEnd.getTime()
    );
    if (alreadyRun) continue;

    const alreadyDepreciated = asset.depreciations.reduce(
      (sum, d) => sum + Number(d.amount), 0
    );
    const acquisitionCost = Number(asset.acquisitionCost);
    const residualValue = Number(asset.residualValue);

    // Calculate months in period (day-based, rounded up)
    const daysDiff = (periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY + 1;
    const months = Math.max(1, Math.round(daysDiff / 30.44));

    let periodAmount: number;
    if (asset.depreciationMethod === "LINEAR") {
      const monthly = calculateLinearDepreciation(
        acquisitionCost, residualValue, asset.usefulLifeMonths, alreadyDepreciated
      );
      periodAmount = monthly * months;
    } else {
      // Declining balance: 2x linear rate applied to book value
      if (asset.usefulLifeMonths <= 0) continue;
      const linearRate = 1 / (asset.usefulLifeMonths / 12);
      const decliningRate = Math.min(linearRate * 2, 0.3); // max 30%
      const bookValue = acquisitionCost - alreadyDepreciated;
      periodAmount = bookValue * decliningRate * (months / 12);
      // Cannot go below residual value
      periodAmount = Math.min(periodAmount, bookValue - residualValue);
    }

    if (periodAmount <= 0) continue;

    const bookValueAfter = acquisitionCost - alreadyDepreciated - periodAmount;

    await prisma.fixedAssetDepreciation.create({
      data: {
        assetId: asset.id,
        periodStart,
        periodEnd,
        amount: periodAmount,
        bookValue: Math.max(bookValueAfter, residualValue),
      },
    });

    // Mark fully depreciated
    if (bookValueAfter <= residualValue) {
      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { status: "FULLY_DEPRECIATED" },
      });
    }

    // Optional: create journal entry for the depreciation
    if (createPostings && asset.depAccountNumber && asset.accountNumber) {
      await prisma.journalEntry.create({
        data: {
          tenantId,
          entryDate: periodEnd,
          description: `AfA: ${asset.name} (${periodStart.toISOString().slice(0, 7)} - ${periodEnd.toISOString().slice(0, 7)})`.slice(0, 200),
          status: "POSTED",
          source: "AUTO",
          referenceType: "FixedAsset",
          referenceId: asset.id,
          createdById: userId,
          lines: {
            create: [
              { lineNumber: 1, account: asset.depAccountNumber, description: `AfA ${asset.name}`, debitAmount: periodAmount, creditAmount: null },
              { lineNumber: 2, account: asset.accountNumber, description: `AfA ${asset.name}`, debitAmount: null, creditAmount: periodAmount },
            ],
          },
        },
      });
    }

    processedCount++;
    totalAmount += periodAmount;
  }

  return { processedCount, totalAmount };
}
