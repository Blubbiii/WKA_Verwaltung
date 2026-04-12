import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const paySchema = z.object({
  paidAt: z.iso.datetime().optional(),
  paidAmount: z.number().positive().optional(),
});

// POST /api/inbox/[id]/pay
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:update");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("inbox.enabled", check.tenantId!, false)) {
      return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
    }
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    if (existing.status === "PAID") {
      return apiError("CONFLICT", 409, { message: "Rechnung bereits als bezahlt markiert" });
    }

    const raw = await request.json();
    const parsed = paySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const updated = await prisma.incomingInvoice.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
        paidAmount: parsed.data.paidAmount ?? existing.grossAmount,
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error marking invoice as paid");
    return apiError("SAVE_FAILED", 500, { message: "Fehler beim Speichern" });
  }
}
