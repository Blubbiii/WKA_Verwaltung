import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE_MAX } from "@/lib/config/pagination";

// GET /api/buchhaltung/bank/transactions — List bank transactions
//
// M-10 Perf: Unterstützt sowohl klassische offset/limit-Pagination (alte Clients)
// als auch cursor-basierte Pagination. Cursor liefert konstant performante
// Queries auch bei hohen Offsets (Audit: skip=10000 → Full-Scan).
//
// Cursor-Modus: ?cursor=<uuid>&limit=50 → Response enthält nextCursor.
// Offset-Modus: ?offset=N&limit=50 → Response enthält total (existing behavior).
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const batchId = searchParams.get("batchId");
    const cursor = searchParams.get("cursor");
    const useCursor = searchParams.has("cursor") || searchParams.get("mode") === "cursor";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || String(PAGE_SIZE_MAX)) || PAGE_SIZE_MAX, 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0") || 0, 0);

    const where: Prisma.BankTransactionWhereInput = { tenantId: check.tenantId! };
    if (status) where.matchStatus = status as Prisma.EnumBankTxStatusFilter<"BankTransaction">;
    if (batchId) where.importBatchId = batchId;

    const include = {
      matchedInvoice: {
        select: { id: true, invoiceNumber: true, grossAmount: true, recipientName: true },
      },
    } as const;

    if (useCursor) {
      // Cursor-Modus — take: limit+1 um zu erkennen ob mehr Rows existieren.
      // Order MUSS deterministisch sein: bookingDate ist nicht unique, daher
      // Sekundär-Sort auf id, und Cursor auf id (eindeutig).
      const rows = await prisma.bankTransaction.findMany({
        where,
        orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include,
      });

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return NextResponse.json({ data, nextCursor });
    }

    // Backward-Compat: klassischer offset/limit + total-count.
    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { bookingDate: "desc" },
        take: limit,
        skip: offset,
        include,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return NextResponse.json({ data: transactions, total });
  } catch (error) {
    logger.error({ err: error }, "Error listing bank transactions");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
