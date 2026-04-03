import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

const MAX_BATCH_SIZE = 50;

// PATCH /api/invoices/batch-status - Rechnungsstatus in Bulk ändern
export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    // Parse and validate request body
    let body: { invoiceIds?: unknown; status?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungueltiger Request Body" },
        { status: 400 }
      );
    }

    const { invoiceIds, status } = body;

    // Only DRAFT → SENT transition is allowed
    if (status !== "SENT") {
      return NextResponse.json(
        { error: "Nur der Status-Übergang DRAFT → SENT ist erlaubt" },
        { status: 400 }
      );
    }

    // Validate invoiceIds is a non-empty string array
    if (
      !Array.isArray(invoiceIds) ||
      invoiceIds.length === 0 ||
      !invoiceIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return NextResponse.json(
        { error: "invoiceIds muss ein nicht-leeres Array von Strings sein" },
        { status: 400 }
      );
    }

    if (invoiceIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          error: `Maximal ${MAX_BATCH_SIZE} Rechnungen pro Batch erlaubt (erhalten: ${invoiceIds.length})`,
        },
        { status: 400 }
      );
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(invoiceIds as string[])];

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
    return NextResponse.json(
      {
        error: "Fehler beim Batch-Status-Update",
        details:
          error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
