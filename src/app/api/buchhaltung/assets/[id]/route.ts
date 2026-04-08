import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const putAssetSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  accountNumber: z.string().optional(),
  depAccountNumber: z.string().optional(),
  disposalDate: z.string().optional(),
  disposalProceeds: z.number().optional(),
});

// GET /api/buchhaltung/assets/[id] — Asset details with depreciation history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const asset = await prisma.fixedAsset.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        depreciations: { orderBy: { periodStart: "asc" } },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: "Anlage nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: asset });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fixed asset");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// PUT /api/buchhaltung/assets/[id] — Update asset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const parsed = putAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const asset = await prisma.fixedAsset.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!asset) {
      return NextResponse.json({ error: "Anlage nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.fixedAsset.update({
      where: { id, tenantId: check.tenantId! },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        notes: data.notes,
        accountNumber: data.accountNumber,
        depAccountNumber: data.depAccountNumber,
        ...(data.disposalDate && {
          disposalDate: new Date(data.disposalDate),
          disposalProceeds: data.disposalProceeds,
          status: "DISPOSED",
        }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error updating fixed asset");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
