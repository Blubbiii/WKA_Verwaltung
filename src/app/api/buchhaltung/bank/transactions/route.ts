import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE_MAX } from "@/lib/config/pagination";

// GET /api/buchhaltung/bank/transactions — List bank transactions
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const batchId = searchParams.get("batchId");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || String(PAGE_SIZE_MAX)) || PAGE_SIZE_MAX, 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0") || 0, 0);

    const where: Prisma.BankTransactionWhereInput = { tenantId: check.tenantId! };
    if (status) where.matchStatus = status as Prisma.EnumBankTxStatusFilter<"BankTransaction">;
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
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
