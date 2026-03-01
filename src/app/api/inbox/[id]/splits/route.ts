import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const splitItemSchema = z.object({
  fundId: z.string().uuid(),
  splitPercent: z.number().min(0).max(100).optional().nullable(),
  splitAmount: z.number().min(0).optional().nullable(),
  description: z.string().max(200).optional().nullable(),
  datevAccount: z.string().max(20).optional().nullable(),
});

const splitsSchema = z.object({
  splits: z.array(splitItemSchema).min(1),
});

// POST /api/inbox/[id]/splits  — Replace all splits for an invoice
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

    const invoice = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = splitsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    // Delete existing splits that have no outgoing invoice yet
    await prisma.incomingInvoiceSplit.deleteMany({
      where: { invoiceId: id, outgoingInvoiceId: null },
    });

    // Create new splits
    const newSplits = await Promise.all(
      parsed.data.splits.map((s, i) =>
        prisma.incomingInvoiceSplit.create({
          data: {
            invoiceId: id,
            position: i + 1,
            fundId: s.fundId,
            splitPercent: s.splitPercent,
            splitAmount: s.splitAmount,
            description: s.description,
            datevAccount: s.datevAccount,
          },
          include: { fund: { select: { id: true, name: true } } },
        })
      )
    );

    return NextResponse.json(serializePrisma(newSplits));
  } catch (error) {
    logger.error({ err: error }, "Error saving inbox splits");
    return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
  }
}
