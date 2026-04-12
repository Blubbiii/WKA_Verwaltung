import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// POST /api/inbox/[id]/approve
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:approve");
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

    if (!["REVIEW", "INBOX"].includes(existing.status)) {
      return apiError("CONFLICT", 409, { message: `Rechnung kann von Status "${existing.status}" nicht genehmigt werden` });
    }

    const updated = await prisma.incomingInvoice.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error approving inbox invoice");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Genehmigen" });
  }
}
