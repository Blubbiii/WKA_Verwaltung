import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
    }
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
    }

    if (!["REVIEW", "INBOX"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Rechnung kann von Status "${existing.status}" nicht genehmigt werden` },
        { status: 409 }
      );
    }

    const updated = await prisma.incomingInvoice.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error approving inbox invoice");
    return NextResponse.json({ error: "Fehler beim Genehmigen" }, { status: 500 });
  }
}
