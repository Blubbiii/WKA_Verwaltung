import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const revenuePhaseSchema = z.object({
  phaseNumber: z.number().min(1),
  startYear: z.number().min(1),
  endYear: z.number().nullable().optional(),
  revenueSharePercentage: z.number().min(0).max(100),
  description: z.string().optional().nullable(),
});

const revenuePhasesArraySchema = z.array(revenuePhaseSchema);

// GET /api/parks/[id]/revenue-phases
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    const phases = await prisma.parkRevenuePhase.findMany({
      where: { parkId: id },
      orderBy: { phaseNumber: "asc" },
    });

    return NextResponse.json(phases);
  } catch (error) {
    logger.error({ err: error }, "Error fetching revenue phases");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vergütungsphasen" },
      { status: 500 }
    );
  }
}

// POST /api/parks/[id]/revenue-phases - Create or replace all phases
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PARKS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedPhases = revenuePhasesArraySchema.parse(body);

    // Delete existing phases and create new ones in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing phases
      await tx.parkRevenuePhase.deleteMany({
        where: { parkId: id },
      });

      // Create new phases
      if (validatedPhases.length > 0) {
        await tx.parkRevenuePhase.createMany({
          data: validatedPhases.map((phase) => ({
            ...phase,
            parkId: id,
          })),
        });
      }
    });

    // Return updated phases
    const phases = await prisma.parkRevenuePhase.findMany({
      where: { parkId: id },
      orderBy: { phaseNumber: "asc" },
    });

    return NextResponse.json(phases, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error saving revenue phases");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Vergütungsphasen" },
      { status: 500 }
    );
  }
}
