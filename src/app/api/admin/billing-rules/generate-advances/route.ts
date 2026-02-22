/**
 * API Route: /api/admin/billing-rules/generate-advances
 *
 * POST: Manually trigger lease advance generation for a specific month.
 *
 * This endpoint bypasses the BillingRule/executor system and directly uses
 * the LeaseAdvanceHandler for ad-hoc generation. It supports:
 * - Generating advances for a specific month/year
 * - Optional park filter
 * - Dry-run mode (preview without creating)
 *
 * Request body:
 * {
 *   month: number (1-12),
 *   year: number,
 *   parkId?: string,
 *   dryRun?: boolean,
 *   taxType?: "STANDARD" | "REDUCED" | "EXEMPT",
 *   dueDays?: number
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { leaseAdvanceHandler } from "@/lib/billing/rules/lease-advance";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const generateAdvancesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  parkId: z.string().uuid().optional(),
  dryRun: z.boolean().optional().default(false),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  dueDays: z.number().int().min(1).max(365).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("leases:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = generateAdvancesSchema.parse(body);

    const { month, year, parkId, dryRun, taxType, dueDays } = validatedData;

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        month,
        year,
        parkId,
        dryRun,
      },
      "Generating lease advances"
    );

    // Execute the handler directly
    const result = await leaseAdvanceHandler.execute(
      check.tenantId!,
      {
        month,
        year,
        parkId,
        taxType,
        dueDays,
      },
      {
        dryRun,
        forceRun: true,
      }
    );

    // Build response
    const monthNames = [
      "Januar",
      "Februar",
      "Maerz",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];

    const response = {
      success: result.status === "success" || result.status === "partial",
      status: result.status,
      dryRun,
      period: {
        month,
        year,
        monthName: monthNames[month - 1],
        label: `${monthNames[month - 1]} ${year}`,
      },
      summary: {
        invoicesCreated: result.invoicesCreated,
        totalAmount: result.totalAmount,
        totalProcessed: result.details.summary.totalProcessed,
        successful: result.details.summary.successful,
        failed: result.details.summary.failed,
        skipped: result.details.summary.skipped,
      },
      errorMessage: result.errorMessage,
      invoices: result.details.invoices.map((inv) => ({
        success: inv.success,
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        recipientName: inv.recipientName,
        amount: inv.amount,
        error: inv.error,
      })),
    };

    const statusCode = result.status === "failed" ? 422 : 200;
    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validierungsfehler",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error generating lease advances");

    const errorMessage =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: errorMessage,
        summary: {
          invoicesCreated: 0,
          totalAmount: 0,
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
        invoices: [],
      },
      { status: 500 }
    );
  }
}
