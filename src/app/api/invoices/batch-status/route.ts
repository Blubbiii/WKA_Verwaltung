import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { API_LIMITS } from "@/lib/config/api-limits";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const batchStatusSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(API_LIMITS.batchSize),
  status: z.literal("SENT"),
});

// PATCH /api/invoices/batch-status - Rechnungsstatus in Bulk ändern
export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungueltiger Request Body" });
    }

    const parsed = batchStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { invoiceIds, status } = parsed.data;

    // Deduplicate IDs
    const uniqueIds = [...new Set(invoiceIds)];

    logger.info(
      { count: uniqueIds.length, status, userId: check.userId },
      "Starting batch status update"
    );

    // Update only invoices that are currently DRAFT and belong to the tenant
    const result = await prisma.invoice.updateMany({
      where: {
        id: { in: uniqueIds },
        status: "DRAFT",
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    const updated = result.count;
    const skipped = uniqueIds.length - updated;

    logger.info(
      { updated, skipped, userId: check.userId },
      "Batch status update completed"
    );

    return NextResponse.json({ updated, skipped });
  } catch (error) {
    logger.error({ err: error }, "Error in batch status update");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Batch-Status-Update", details: error instanceof Error ? error.message : "Unbekannter Fehler" });
  }
}
