import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(100),
  code: z.string().min(1, "Code erforderlich").max(20),
  description: z.string().max(500).optional().nullable(),
  calculationType: z.enum(["FIXED_RATE", "MARKET_PRICE", "MANUAL"]).default("FIXED_RATE"),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  hasTax: z.boolean().default(true),
  taxRate: z.number().min(0).max(100).optional().nullable(),
  sortOrder: z.number().int().default(0),
});

// GET /api/admin/revenue-types
export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const revenueTypes = await prisma.energyRevenueType.findMany({
      where: { tenantId: check.tenantId! },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: revenueTypes });
  } catch (error) {
    logger.error({ err: error }, "Error fetching revenue types");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vergütungsarten" },
      { status: 500 }
    );
  }
}

// POST /api/admin/revenue-types
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    // Check duplicate code
    const existing = await prisma.energyRevenueType.findFirst({
      where: { code: parsed.data.code, tenantId: check.tenantId! },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Code "${parsed.data.code}" existiert bereits` },
        { status: 409 }
      );
    }

    const revenueType = await prisma.energyRevenueType.create({
      data: {
        ...parsed.data,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(revenueType, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating revenue type");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Vergütungsart" },
      { status: 500 }
    );
  }
}
