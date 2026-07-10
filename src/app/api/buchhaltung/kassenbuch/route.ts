import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client-runtime-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createEntrySchema = z.object({
  entryDate: z.string(),
  description: z.string().min(1),
  amount: z.number(),
  account: z.string().optional(),
  receiptNumber: z.string().optional(),
});

// GET /api/buchhaltung/kassenbuch — List cash book entries
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.CashBookEntryWhereInput = { tenantId: check.tenantId! };
    if (from || to) {
      const entryDateFilter: Prisma.DateTimeFilter = {};
      if (from) entryDateFilter.gte = new Date(from);
      if (to) entryDateFilter.lte = new Date(to);
      where.entryDate = entryDateFilter;
    }

    const entries = await prisma.cashBookEntry.findMany({
      where,
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    logger.error({ err: error }, "Error listing cash book entries");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// POST /api/buchhaltung/kassenbuch — Create cash book entry
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createEntrySchema.parse(body);

    // P26.2 §146 AO Festschreibung: keine Einträge in gelockte Tage
    const entryDate = new Date(parsed.entryDate);
    const dayStart = new Date(entryDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(entryDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const lockedInDay = await prisma.cashBookEntry.findFirst({
      where: {
        tenantId: check.tenantId!,
        entryDate: { gte: dayStart, lte: dayEnd },
        lockedAt: { not: null },
      },
      select: { id: true },
    });
    if (lockedInDay) {
      return apiError("CONFLICT", 409, {
        message: "Kassenbuch für diesen Tag bereits abgeschlossen (Festschreibung §146 AO)",
      });
    }

    // Serializable-Transaktion: verhindert Race (zwei parallele POSTs mit
    // gleichem nextNumber). Decimal-Arithmetik statt Number-Cast, damit die
    // runningBalance nicht durch Float-Drift verrutscht.
    const entry = await prisma.$transaction(
      async (tx) => {
        const lastEntry = await tx.cashBookEntry.findFirst({
          where: { tenantId: check.tenantId! },
          orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
          select: { runningBalance: true, entryNumber: true },
        });

        const prevBalance = new Decimal(lastEntry?.runningBalance ?? 0);
        const nextNumber = (lastEntry?.entryNumber ?? 0) + 1;
        const runningBalance = prevBalance.plus(parsed.amount);

        return tx.cashBookEntry.create({
          data: {
            tenantId: check.tenantId!,
            entryDate: new Date(parsed.entryDate),
            entryNumber: nextNumber,
            description: parsed.description,
            amount: parsed.amount,
            runningBalance,
            account: parsed.account || null,
            receiptNumber: parsed.receiptNumber || null,
            createdById: check.userId!,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des Kassenbucheintrags");
  }
}
