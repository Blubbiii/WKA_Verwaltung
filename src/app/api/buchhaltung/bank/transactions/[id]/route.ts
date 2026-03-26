import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const matchSchema = z.object({
  action: z.enum(["match", "ignore", "unmatch"]),
  invoiceId: z.string().uuid().optional(),
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
      return NextResponse.json({ error: "Transaktion nicht gefunden" }, { status: 404 });
    }

    let updateData: Record<string, unknown>;

    switch (action) {
      case "match":
        if (!invoiceId) {
          return NextResponse.json({ error: "invoiceId erforderlich" }, { status: 400 });
        }
        // Verify invoice belongs to the same tenant
        const invoice = await prisma.invoice.findFirst({
          where: { id: invoiceId, tenantId: check.tenantId! },
        });
        if (!invoice) {
          return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    logger.error({ err: error }, "Error updating bank transaction");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
