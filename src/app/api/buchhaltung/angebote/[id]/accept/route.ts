import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/buchhaltung/angebote/[id]/accept — SENT → ACCEPTED
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
      return apiError("NOT_FOUND", 404, { message: "Angebot nicht gefunden" });
    }

    if (quote.status !== "SENT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur versendete Angebote können angenommen werden" });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error accepting quote");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
