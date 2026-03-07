import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]).optional(),
  taxBehavior: z.enum(["TAXABLE_19", "TAXABLE_7", "EXEMPT", "INPUT_TAX", "OUTPUT_TAX", "NONE"]).optional(),
  parentNumber: z.string().max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PUT /api/buchhaltung/accounts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const account = await prisma.ledgerAccount.findFirst({
      where: { id, tenantId: check.tenantId },
    });

    if (!account) {
      return NextResponse.json({ error: "Konto nicht gefunden" }, { status: 404 });
    }

    if (account.isSystem && parsed.data.isActive === false) {
      return NextResponse.json(
        { error: "Systemkonten koennen nicht deaktiviert werden" },
        { status: 400 }
      );
    }

    const updated = await prisma.ledgerAccount.update({
      where: { id, tenantId: check.tenantId! },
      data: parsed.data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error updating ledger account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// DELETE /api/buchhaltung/accounts/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:delete");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const account = await prisma.ledgerAccount.findFirst({
      where: { id, tenantId: check.tenantId },
    });

    if (!account) {
      return NextResponse.json({ error: "Konto nicht gefunden" }, { status: 404 });
    }

    if (account.isSystem) {
      return NextResponse.json(
        { error: "Systemkonten koennen nicht geloescht werden" },
        { status: 400 }
      );
    }

    await prisma.ledgerAccount.delete({ where: { id, tenantId: check.tenantId! } });

    return NextResponse.json({ message: "Konto geloescht" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting ledger account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
