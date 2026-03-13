import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const bankAccountSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  iban: z.string().min(15).max(34),
  bic: z.string().max(11).optional().nullable(),
  bankName: z.string().max(200).optional().nullable(),
  currency: z.string().length(3).default("EUR"),
  fundId: z.string().uuid().optional().nullable(),
  currentBalance: z.number().optional().nullable(),
});

// GET /api/buchhaltung/bank/accounts
export async function GET() {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId: check.tenantId!, isActive: true },
      include: {
        fund: { select: { id: true, name: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: accounts });
  } catch (error) {
    logger.error({ err: error }, "Error listing bank accounts");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/bank/accounts
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = bankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    const account = await prisma.bankAccount.create({
      data: {
        tenantId: check.tenantId!,
        name: data.name,
        iban: data.iban.replace(/\s/g, "").toUpperCase(),
        bic: data.bic || null,
        bankName: data.bankName || null,
        currency: data.currency,
        fundId: data.fundId || null,
        currentBalance: data.currentBalance ?? null,
        balanceDate: data.currentBalance != null ? new Date() : null,
      },
    });

    return NextResponse.json({ data: account }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating bank account");
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "IBAN bereits vorhanden" }, { status: 409 });
    }
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
