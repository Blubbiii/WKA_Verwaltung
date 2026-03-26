import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
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
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/kassenbuch — Create cash book entry
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createEntrySchema.parse(body);

    // Calculate running balance
    const lastEntry = await prisma.cashBookEntry.findFirst({
      where: { tenantId: check.tenantId! },
      orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
      select: { runningBalance: true, entryNumber: true },
    });

    const prevBalance = lastEntry ? Number(lastEntry.runningBalance) : 0;
    const nextNumber = (lastEntry?.entryNumber ?? 0) + 1;
    const runningBalance = prevBalance + parsed.amount;

    const entry = await prisma.cashBookEntry.create({
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

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    logger.error({ err: error }, "Error creating cash book entry");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
