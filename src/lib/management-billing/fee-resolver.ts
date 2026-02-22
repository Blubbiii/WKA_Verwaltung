// Fee Percentage Resolver for Management Billing
// Resolves the applicable fee percentage for a stakeholder and billing period,
// checking StakeholderFeeHistory first with fallback to ParkStakeholder.feePercentage.

import { prisma } from "@/lib/prisma";

/**
 * Resolves the applicable fee percentage for a stakeholder and period.
 * Checks StakeholderFeeHistory first for a matching entry; falls back to
 * the current stakeholder.feePercentage if no history entry applies.
 *
 * @param stakeholderId - The ParkStakeholder ID
 * @param year - Billing year
 * @param month - Billing month (null for annual billing)
 * @returns The fee percentage as a number (e.g., 1.86 for 1.86%)
 */
export async function resolveFeePercentage(
  stakeholderId: string,
  year: number,
  month: number | null
): Promise<number> {
  // Determine the period end date for lookup
  const periodEnd = month
    ? new Date(year, month, 0, 23, 59, 59) // Last day of the given month
    : new Date(year, 11, 31, 23, 59, 59); // Dec 31 for annual billing

  // Check fee history for the most recent entry valid at periodEnd
  const historyEntry = await prisma.stakeholderFeeHistory.findFirst({
    where: {
      stakeholderId,
      validFrom: { lte: periodEnd },
      OR: [{ validUntil: null }, { validUntil: { gte: periodEnd } }],
    },
    orderBy: { validFrom: "desc" },
  });

  if (historyEntry) {
    return Number(historyEntry.feePercentage);
  }

  // Fallback to current stakeholder fee percentage
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id: stakeholderId },
    select: { feePercentage: true },
  });

  return stakeholder?.feePercentage ? Number(stakeholder.feePercentage) : 0;
}
