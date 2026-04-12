import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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
      return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
    }

    const phases = await prisma.parkRevenuePhase.findMany({
      where: { parkId: id },
      orderBy: { phaseNumber: "asc" },
    });

    return NextResponse.json(phases);
  } catch (error) {
    logger.error({ err: error }, "Error fetching revenue phases");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Vergütungsphasen" });
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
      return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
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
    return handleApiError(error, "Fehler beim Speichern der Vergütungsphasen");
  }
}
