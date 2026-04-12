import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const patchAnomalySchema = z.object({
  acknowledged: z.boolean().optional(),
  notes: z.string().optional(),
  resolvedAt: z.string().nullable().optional(),
});

// =============================================================================
// PATCH /api/energy/scada/anomalies/[id] - Acknowledge or update anomaly
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const userId = check.userId!;
    const { id } = await params;

    // Verify anomaly belongs to this tenant
    const existing = await prisma.scadaAnomaly.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Anomalie nicht gefunden" });
    }

    const body = await request.json();
    const parsed = patchAnomalySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { acknowledged, notes, resolvedAt } = parsed.data;

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (typeof acknowledged === "boolean") {
      updateData.acknowledged = acknowledged;
      if (acknowledged) {
        updateData.acknowledgedById = userId;
        updateData.acknowledgedAt = new Date();
      } else {
        updateData.acknowledgedById = null;
        updateData.acknowledgedAt = null;
      }
    }

    if (typeof notes === "string") {
      updateData.notes = notes;
    }

    if (resolvedAt !== undefined) {
      updateData.resolvedAt = resolvedAt ? new Date(resolvedAt) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Änderungen angegeben" });
    }

    const updated = await prisma.scadaAnomaly.update({
      where: { id },
      data: updateData,
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            park: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        acknowledgedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({ anomaly: updated });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren der SCADA-Anomalie");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der SCADA-Anomalie" });
  }
}

// =============================================================================
// GET /api/energy/scada/anomalies/[id] - Get single anomaly detail
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { id } = await params;

    const anomaly = await prisma.scadaAnomaly.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            manufacturer: true,
            model: true,
            ratedPowerKw: true,
            park: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        acknowledgedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!anomaly) {
      return apiError("NOT_FOUND", undefined, { message: "Anomalie nicht gefunden" });
    }

    return NextResponse.json({ anomaly });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Anomalie");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der SCADA-Anomalie" });
  }
}
