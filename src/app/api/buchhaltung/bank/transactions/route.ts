import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/buchhaltung/bank/transactions — List bank transactions
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const batchId = searchParams.get("batchId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = { tenantId: check.tenantId! };
    if (status) where.matchStatus = status;
    if (batchId) where.importBatchId = batchId;

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { bookingDate: "desc" },
        take: limit,
        skip: offset,
        include: {
          matchedInvoice: {
            select: { id: true, invoiceNumber: true, grossAmount: true, recipientName: true },
          },
        },
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return NextResponse.json({ data: transactions, total });
  } catch (error) {
    logger.error({ err: error }, "Error listing bank transactions");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
