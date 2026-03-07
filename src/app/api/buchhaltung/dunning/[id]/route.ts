import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/buchhaltung/dunning/[id] — Get dunning run with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const run = await prisma.dunningRun.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, recipientName: true, grossAmount: true, dueDate: true },
            },
          },
          orderBy: { level: "asc" },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Mahnlauf nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: run });
  } catch (error) {
    logger.error({ err: error }, "Error fetching dunning run");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
