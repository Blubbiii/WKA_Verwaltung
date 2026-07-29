/**
 * Contract Auto-Renewal Service
 *
 * Checks for contracts eligible for automatic renewal and creates
 * renewal drafts. Designed to be idempotent - running multiple times
 * will not create duplicate renewals.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { addMonthsSafe } from "@/lib/date-utils";
import { calculateNoticeDeadline } from "@/lib/contracts/notice-deadline";

const renewalLogger = logger.child({ module: "contract-renewal" });

export interface AutoRenewalResult {
  processed: number;
  renewalsCreated: number;
  errors: { contractId: string; error: string }[];
}

/**
 * Find contracts eligible for auto-renewal and create renewal drafts.
 *
 * Eligibility criteria:
 * - autoRenewal = true
 * - status is ACTIVE or EXPIRING
 * - endDate is within the next 30 days
 * - No existing renewal draft already created (idempotency check)
 *
 * @param tenantId - Optional tenant filter (when called from API with session context)
 */
export async function processAutoRenewals(
  tenantId?: string
): Promise<AutoRenewalResult> {
  const result: AutoRenewalResult = {
    processed: 0,
    renewalsCreated: 0,
    errors: [],
  };

  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Find all contracts eligible for auto-renewal
  const eligibleContracts = await prisma.contract.findMany({
    where: {
      autoRenewal: true,
      status: { in: ["ACTIVE", "EXPIRING"] },
      endDate: {
        not: null,
        lte: thirtyDaysFromNow,
        gte: now,
      },
      ...(tenantId ? { tenantId } : {}),
    },
    orderBy: { endDate: "asc" },
  });

  renewalLogger.info(
    { count: eligibleContracts.length, tenantId: tenantId ?? "all" },
    "Found contracts eligible for auto-renewal"
  );

  for (const contract of eligibleContracts) {
    result.processed++;

    try {
      const renewalTitle = `${contract.title} (Verlängerung)`;

      // Idempotency check: skip if a renewal draft already exists
      const existingRenewal = await prisma.contract.findFirst({
        where: {
          tenantId: contract.tenantId,
          title: renewalTitle,
        },
        select: { id: true },
      });

      if (existingRenewal) {
        renewalLogger.debug(
          { contractId: contract.id, existingRenewalId: existingRenewal.id },
          "Renewal already exists, skipping"
        );
        continue;
      }

      // Calculate new dates
      const oldEndDate = contract.endDate!;
      const newStartDate = new Date(oldEndDate);
      newStartDate.setDate(newStartDate.getDate() + 1);

      const renewalMonths = contract.renewalPeriodMonths ?? 12;
      // addMonthsSafe clamps the target day to the length of the target month.
      // newStartDate is oldEndDate + 1 day, so it lands on a 29th/30th/31st
      // whenever the old contract ended on the 28th/29th/30th. A plain
      // setMonth(+n) would then roll over ("30 February" → 2 March) and push
      // the renewal period a few days past the intended month end.
      const newEndDate = addMonthsSafe(newStartDate, renewalMonths);

      // Calculate notice deadline from new end date.
      // Backwards arithmetic overflows the same way: 31 March − 1 month is
      // "31 February" → 3 March, which would report a *later* deadline than the
      // correct 28 February and thus a notice period that is too short.
      let newNoticeDeadline: Date | null = null;
      if (contract.noticePeriodMonths) {
        newNoticeDeadline = calculateNoticeDeadline(
          newEndDate,
          contract.noticePeriodMonths
        );
      }

      // Build the note referencing the original contract
      const contractRef = contract.contractNumber
        ? contract.contractNumber
        : contract.id;
      const note = `Automatisch verlängerter Vertrag (Original: ${contractRef})`;

      // Create renewal draft
      await prisma.contract.create({
        data: {
          contractType: contract.contractType,
          title: renewalTitle,
          startDate: newStartDate,
          endDate: newEndDate,
          noticePeriodMonths: contract.noticePeriodMonths,
          noticeDeadline: newNoticeDeadline,
          autoRenewal: contract.autoRenewal,
          renewalPeriodMonths: contract.renewalPeriodMonths,
          annualValue: contract.annualValue,
          paymentTerms: contract.paymentTerms,
          status: "DRAFT",
          reminderDays: contract.reminderDays,
          notes: note,
          tenantId: contract.tenantId,
          parkId: contract.parkId,
          turbineId: contract.turbineId,
          fundId: contract.fundId,
          partnerId: contract.partnerId,
        },
      });

      result.renewalsCreated++;

      renewalLogger.info(
        {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          renewalTitle,
          newStartDate: newStartDate.toISOString(),
          newEndDate: newEndDate.toISOString(),
        },
        "Created renewal draft"
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unbekannter Fehler";

      result.errors.push({
        contractId: contract.id,
        error: errorMessage,
      });

      renewalLogger.error(
        { contractId: contract.id, err },
        "Failed to create renewal draft"
      );
    }
  }

  renewalLogger.info(
    {
      processed: result.processed,
      renewalsCreated: result.renewalsCreated,
      errorCount: result.errors.length,
    },
    "Auto-renewal processing complete"
  );

  return result;
}
