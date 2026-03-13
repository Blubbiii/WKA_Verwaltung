import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/buchhaltung/angebote/[id]/send — DRAFT → SENT
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const quote = await prisma.quote.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });

    if (!quote) {
      return NextResponse.json({ error: "Angebot nicht gefunden" }, { status: 404 });
    }

    if (quote.status !== "DRAFT") {
      return NextResponse.json({ error: "Nur Entwürfe können versendet werden" }, { status: 400 });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error sending quote");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
