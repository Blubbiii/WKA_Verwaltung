import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const matchSchema = z.object({
  action: z.enum(["match", "ignore", "unmatch"]),
  invoiceId: z.uuid().optional(),
});

// PATCH /api/buchhaltung/bank/transactions/[id] — Match/Ignore/Unmatch
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { action, invoiceId } = matchSchema.parse(body);

    const tx = await prisma.bankTransaction.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!tx) {
      return apiError("NOT_FOUND", 404, { message: "Transaktion nicht gefunden" });
    }

    let updateData: Record<string, unknown>;

    switch (action) {
      case "match":
        if (!invoiceId) {
          return apiError("BAD_REQUEST", 400, { message: "invoiceId erforderlich" });
        }
        // Verify invoice belongs to the same tenant
        const invoice = await prisma.invoice.findFirst({
          where: { id: invoiceId, tenantId: check.tenantId! },
        });
        if (!invoice) {
          return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
        }
        updateData = {
          matchStatus: "MATCHED",
          matchedInvoiceId: invoiceId,
          matchConfidence: 1.0,
        };
        // Mark invoice as paid
        await prisma.invoice.update({
          where: { id: invoiceId, tenantId: check.tenantId! },
          data: {
            status: "PAID",
            paidAt: tx.bookingDate,
            paymentReference: tx.reference?.slice(0, 140) || "Bank-Import",
          },
        });
        break;

      case "ignore":
        updateData = { matchStatus: "IGNORED", matchedInvoiceId: null, matchConfidence: null };
        break;

      case "unmatch":
        updateData = { matchStatus: "UNMATCHED", matchedInvoiceId: null, matchConfidence: null };
        break;
    }

    const updated = await prisma.bankTransaction.update({
      where: { id, tenantId: check.tenantId! },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Banktransaktion");
  }
}
