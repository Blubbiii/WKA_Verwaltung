import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runDepreciation } from "@/lib/accounting/depreciation";
import { z } from "zod";

const depreciationSchema = z.object({
  action: z.literal("depreciate"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Ungültiges Datumsformat"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Ungültiges Datumsformat"),
  createPostings: z.boolean().optional().default(false),
});

const createAssetSchema = z.object({
  assetNumber: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  acquisitionDate: z.string(),
  acquisitionCost: z.number().positive(),
  usefulLifeMonths: z.number().int().positive(),
  depreciationMethod: z.enum(["LINEAR", "DECLINING_BALANCE"]).default("LINEAR"),
  residualValue: z.number().min(0).default(0),
  accountNumber: z.string().optional(),
  depAccountNumber: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/buchhaltung/assets — List fixed assets
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Prisma.FixedAssetWhereInput = { tenantId: check.tenantId! };
    if (status) where.status = status as Prisma.EnumAssetStatusFilter<"FixedAsset">;

    const assets = await prisma.fixedAsset.findMany({
      where,
      orderBy: { assetNumber: "asc" },
      include: {
        _count: { select: { depreciations: true } },
        depreciations: {
          orderBy: { periodEnd: "desc" },
          take: 1,
          select: { bookValue: true, periodEnd: true },
        },
      },
    });

    return NextResponse.json({ data: assets });
  } catch (error) {
    logger.error({ err: error }, "Error listing fixed assets");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/assets — Create asset OR run depreciation
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();

    // Special action: run depreciation
    if (body.action === "depreciate") {
      const parsed = depreciationSchema.parse(body);
      const result = await runDepreciation(
        check.tenantId!,
        new Date(parsed.periodStart),
        new Date(parsed.periodEnd),
        check.userId!,
        parsed.createPostings
      );
      return NextResponse.json(result);
    }

    const parsed = createAssetSchema.parse(body);

    // Check duplicate
    const existing = await prisma.fixedAsset.findUnique({
      where: { tenantId_assetNumber: { tenantId: check.tenantId!, assetNumber: parsed.assetNumber } },
    });

    if (existing) {
      return NextResponse.json({ error: "Anlagennummer existiert bereits" }, { status: 409 });
    }

    const asset = await prisma.fixedAsset.create({
      data: {
        tenantId: check.tenantId!,
        ...parsed,
        acquisitionDate: new Date(parsed.acquisitionDate),
      },
    });

    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Anlage");
  }
}
