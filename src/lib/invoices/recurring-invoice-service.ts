/**
 * Recurring Invoice Service
 *
 * Handles automatic generation of invoices on a scheduled basis.
 * Recurring invoices are processed by a cron job / BullMQ worker
 * that calls processRecurringInvoices() periodically.
 */

import { prisma } from "@/lib/prisma";
import { InvoiceType, TaxType } from "@prisma/client";
import {
  getNextInvoiceNumber,
  calculateTaxAmounts,
  getTaxRateByType,
} from "@/lib/invoices/numberGenerator";
import { invalidate } from "@/lib/cache/invalidation";
import { apiLogger } from "@/lib/logger";

const logger = apiLogger.child({ component: "recurring-invoice-service" });

// ============================================================================
// Types
// ============================================================================

export interface RecurringPosition {
  description: string;
  quantity: number;
  unitPrice: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
  unit?: string;
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  invoiceIds: string[];
  errors: Array<{ recurringInvoiceId: string; error: string }>;
}

// ============================================================================
// Next Run Calculation
// ============================================================================

/**
 * Calculate the next run date based on frequency.
 * Reuses the same logic as the billing scheduler but is self-contained
 * so the recurring invoice module does not depend on the billing module.
 */
export function calculateNextRunDate(
  frequency: string,
  fromDate: Date,
  dayOfMonth?: number | null
): Date {
  const day = Math.min(Math.max(dayOfMonth || 1, 1), 28);
  const next = new Date(fromDate);
  next.setHours(2, 0, 0, 0); // Run at 02:00 to avoid timezone edge cases

  switch (frequency) {
    case "MONTHLY": {
      next.setMonth(next.getMonth() + 1);
      next.setDate(day);
      break;
    }

    case "QUARTERLY": {
      // Advance by 3 months
      next.setMonth(next.getMonth() + 3);
      next.setDate(day);
      break;
    }

    case "SEMI_ANNUAL": {
      // Advance by 6 months
      next.setMonth(next.getMonth() + 6);
      next.setDate(day);
      break;
    }

    case "ANNUAL": {
      // Advance by 1 year
      next.setFullYear(next.getFullYear() + 1);
      next.setDate(day);
      break;
    }

    default: {
      // Fallback: monthly
      next.setMonth(next.getMonth() + 1);
      next.setDate(day);
    }
  }

  return next;
}

/**
 * Calculate the initial nextRunAt based on startDate and frequency.
 * If startDate is in the future, use startDate directly.
 * If startDate is in the past, find the next valid run date from now.
 */
export function calculateInitialNextRun(
  frequency: string,
  startDate: Date,
  dayOfMonth?: number | null
): Date {
  const now = new Date();

  if (startDate > now) {
    // Start date is in the future - use it directly
    const run = new Date(startDate);
    run.setHours(2, 0, 0, 0);
    return run;
  }

  // Start date is in the past - calculate next run from now
  return calculateNextRunDate(frequency, now, dayOfMonth);
}

// ============================================================================
// Invoice Generation
// ============================================================================

/**
 * Generate a single invoice from a recurring invoice definition.
 */
async function generateInvoiceFromRecurring(
  recurringInvoice: {
    id: string;
    tenantId: string;
    createdById: string;
    recipientType: string;
    recipientId: string | null;
    recipientName: string;
    recipientAddress: string | null;
    invoiceType: string;
    positions: unknown;
    notes: string | null;
    name: string;
    fundId: string | null;
    parkId: string | null;
  }
): Promise<string> {
  const positions = recurringInvoice.positions as RecurringPosition[];

  if (!positions || !Array.isArray(positions) || positions.length === 0) {
    throw new Error("Keine Positionen in der wiederkehrenden Rechnung definiert");
  }

  // Calculate totals from positions
  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;

  const itemsData = positions.map((pos, index) => {
    const netAmount = pos.quantity * pos.unitPrice;
    const taxType = (pos.taxType || "STANDARD") as "STANDARD" | "REDUCED" | "EXEMPT";
    const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(netAmount, taxType);

    totalNet += netAmount;
    totalTax += taxAmount;
    totalGross += grossAmount;

    return {
      position: index + 1,
      description: pos.description,
      quantity: pos.quantity,
      unit: pos.unit || "pauschal",
      unitPrice: pos.unitPrice,
      netAmount,
      taxType: taxType as TaxType,
      taxRate,
      taxAmount,
      grossAmount,
    };
  });

  // Generate invoice number atomically
  const invoiceTypeEnum = recurringInvoice.invoiceType === "CREDIT_NOTE"
    ? InvoiceType.CREDIT_NOTE
    : InvoiceType.INVOICE;

  const { number: invoiceNumber } = await getNextInvoiceNumber(
    recurringInvoice.tenantId,
    invoiceTypeEnum
  );

  // Calculate due date (14 days from now)
  const invoiceDate = new Date();
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Determine service period (current month)
  const serviceStartDate = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth(), 1);
  const serviceEndDate = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + 1, 0);

  // Build shareholder/fund references if applicable
  const shareholderId = recurringInvoice.recipientType === "shareholder"
    ? recurringInvoice.recipientId
    : null;

  // Create the invoice with items
  const invoice = await prisma.invoice.create({
    data: {
      invoiceType: invoiceTypeEnum,
      invoiceNumber,
      invoiceDate,
      dueDate,
      recipientType: recurringInvoice.recipientType,
      recipientName: recurringInvoice.recipientName,
      recipientAddress: recurringInvoice.recipientAddress,
      serviceStartDate,
      serviceEndDate,
      paymentReference: invoiceNumber,
      internalReference: `Wiederkehrend: ${recurringInvoice.name}`,
      netAmount: totalNet,
      taxRate: 0, // Mixed rates across items
      taxAmount: totalTax,
      grossAmount: totalGross,
      notes: recurringInvoice.notes
        ? `${recurringInvoice.notes}\n\n(Automatisch erstellt aus: ${recurringInvoice.name})`
        : `Automatisch erstellt aus: ${recurringInvoice.name}`,
      status: "DRAFT",
      tenantId: recurringInvoice.tenantId,
      createdById: recurringInvoice.createdById,
      fundId: recurringInvoice.fundId,
      parkId: recurringInvoice.parkId,
      shareholderId,
      items: {
        create: itemsData,
      },
    },
  });

  return invoice.id;
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process all due recurring invoices.
 * This is the main entry point called by the cron job / BullMQ worker.
 *
 * Finds all enabled recurring invoices where:
 * - nextRunAt <= now
 * - endDate is null OR endDate > now
 *
 * For each, generates a real invoice and updates the schedule.
 */
export async function processRecurringInvoices(
  tenantId?: string
): Promise<ProcessResult> {
  const now = new Date();

  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    invoiceIds: [],
    errors: [],
  };

  // Find all due recurring invoices
  const dueInvoices = await prisma.recurringInvoice.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      OR: [
        { endDate: null },
        { endDate: { gt: now } },
      ],
      ...(tenantId && { tenantId }),
    },
    orderBy: { nextRunAt: "asc" },
  });

  if (dueInvoices.length === 0) {
    logger.info("No due recurring invoices found");
    return result;
  }

  logger.info(
    { count: dueInvoices.length, tenantId: tenantId || "all" },
    "Processing due recurring invoices"
  );

  for (const recurring of dueInvoices) {
    result.processed++;

    try {
      // Generate the invoice
      const invoiceId = await generateInvoiceFromRecurring(recurring);
      result.invoiceIds.push(invoiceId);

      // Calculate next run
      const nextRunAt = calculateNextRunDate(
        recurring.frequency,
        now,
        recurring.dayOfMonth
      );

      // Check if recurring invoice should be disabled (endDate reached)
      const shouldDisable = recurring.endDate && nextRunAt > recurring.endDate;

      // Update the recurring invoice
      await prisma.recurringInvoice.update({
        where: { id: recurring.id },
        data: {
          lastRunAt: now,
          nextRunAt,
          totalGenerated: { increment: 1 },
          lastInvoiceId: invoiceId,
          ...(shouldDisable && { enabled: false }),
        },
      });

      // Invalidate dashboard caches
      invalidate
        .onInvoiceChange(recurring.tenantId, invoiceId, "create")
        .catch((err) => {
          logger.warn(
            { err },
            "[RecurringInvoice] Cache invalidation error"
          );
        });

      logger.info(
        {
          recurringInvoiceId: recurring.id,
          invoiceId,
          nextRunAt: nextRunAt.toISOString(),
          disabled: shouldDisable || false,
        },
        "Recurring invoice generated successfully"
      );

      result.succeeded++;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";

      result.errors.push({
        recurringInvoiceId: recurring.id,
        error: errorMessage,
      });

      logger.error(
        {
          recurringInvoiceId: recurring.id,
          name: recurring.name,
          error: errorMessage,
        },
        "Failed to generate recurring invoice"
      );

      result.failed++;
    }
  }

  logger.info(
    {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    },
    "Recurring invoice processing completed"
  );

  return result;
}

/**
 * Get summary of upcoming recurring invoices (for dashboard/monitoring).
 */
export async function getUpcomingRecurringInvoices(
  tenantId: string,
  limit: number = 10
) {
  return prisma.recurringInvoice.findMany({
    where: {
      tenantId,
      enabled: true,
      OR: [
        { endDate: null },
        { endDate: { gt: new Date() } },
      ],
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      recipientName: true,
      frequency: true,
      nextRunAt: true,
      lastRunAt: true,
      totalGenerated: true,
      positions: true,
    },
  });
}
