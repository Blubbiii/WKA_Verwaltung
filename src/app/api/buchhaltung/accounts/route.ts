import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const createAccountSchema = z.object({
  accountNumber: z.string().min(1).max(10),
  name: z.string().min(1).max(200),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  taxBehavior: z.enum(["TAXABLE_19", "TAXABLE_7", "EXEMPT", "INPUT_TAX", "OUTPUT_TAX", "NONE"]).default("NONE"),
  parentNumber: z.string().max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

// GET /api/buchhaltung/accounts — List all accounts for tenant
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const activeOnly = searchParams.get("active") !== "false";

    const where: Prisma.LedgerAccountWhereInput = {
      tenantId: check.tenantId,
    };

    if (activeOnly) where.isActive = true;
    if (category) where.category = category as Prisma.EnumAccountCategoryFilter<"LedgerAccount">;
    if (search) {
      where.OR = [
        { accountNumber: { contains: search } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      orderBy: { accountNumber: "asc" },
    });

    return NextResponse.json({ data: accounts });
  } catch (error) {
    logger.error({ err: error }, "Error fetching ledger accounts");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/accounts — Create a new account
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Check for duplicate account number
    const existing = await prisma.ledgerAccount.findUnique({
      where: {
        tenantId_accountNumber: {
          tenantId: check.tenantId!,
          accountNumber: parsed.data.accountNumber,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Kontonummer ${parsed.data.accountNumber} existiert bereits` },
        { status: 409 }
      );
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        tenantId: check.tenantId!,
        ...parsed.data,
      },
    });

    return NextResponse.json({ data: account }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating ledger account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
