import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const paySchema = z.object({
  paidAt: z.string().datetime().optional(),
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
      return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
    }
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
    }

    if (existing.status === "PAID") {
      return NextResponse.json({ error: "Rechnung bereits als bezahlt markiert" }, { status: 409 });
    }

    const raw = await request.json();
    const parsed = paySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
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
    return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
  }
}
