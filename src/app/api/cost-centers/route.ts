import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(["PARK", "TURBINE", "FUND", "OVERHEAD", "CUSTOM"]),
  description: z.string().optional(),
  parkId: z.string().optional().nullable(),
  turbineId: z.string().optional().nullable(),
  fundId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const activeOnly = searchParams.get("activeOnly") !== "false";
    const parkId = searchParams.get("parkId");

    const where: Record<string, unknown> = { tenantId: check.tenantId };
    if (activeOnly) where.isActive = true;
    if (type) where.type = type;
    if (parkId) where.parkId = parkId;

    const costCenters = await prisma.costCenter.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        fund: { select: { id: true, name: true } },
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { budgetLines: true, children: true } },
      },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });

    return NextResponse.json(costCenters);
  } catch (error) {
    logger.error({ err: error }, "Error fetching cost centers");
    return NextResponse.json({ error: "Fehler beim Laden der Kostenstellen" }, { status: 500 });
  }
}

async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission("wirtschaftsplan:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const data = createSchema.parse(body);

    const costCenter = await prisma.costCenter.create({
      data: {
        ...data,
        tenantId: check.tenantId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        fund: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.errors }, { status: 400 });
    }
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Kostenstellen-Code bereits vergeben" }, { status: 409 });
    }
    logger.error({ err: error }, "Error creating cost center");
    return NextResponse.json({ error: "Fehler beim Erstellen der Kostenstelle" }, { status: 500 });
  }
}

export const GET = withMonitoring(getHandler);
export const POST = withMonitoring(postHandler);
