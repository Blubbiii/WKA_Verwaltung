import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  bic: z.string().max(11).optional().nullable(),
  bankName: z.string().max(200).optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  currentBalance: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

// GET /api/buchhaltung/bank/accounts/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const account = await prisma.bankAccount.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        fund: { select: { id: true, name: true } },
        _count: { select: { transactions: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Bankkonto nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: account });
  } catch (error) {
    logger.error({ err: error }, "Error fetching bank account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// PATCH /api/buchhaltung/bank/accounts/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const existing = await prisma.bankAccount.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Bankkonto nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const account = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.bic !== undefined && { bic: data.bic }),
        ...(data.bankName !== undefined && { bankName: data.bankName }),
        ...(data.fundId !== undefined && { fundId: data.fundId }),
        ...(data.currentBalance !== undefined && {
          currentBalance: data.currentBalance,
          balanceDate: data.currentBalance != null ? new Date() : null,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json({ data: account });
  } catch (error) {
    logger.error({ err: error }, "Error updating bank account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// DELETE /api/buchhaltung/bank/accounts/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:delete");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const existing = await prisma.bankAccount.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Bankkonto nicht gefunden" }, { status: 404 });
    }

    // Soft-deactivate instead of hard delete
    await prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting bank account");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
