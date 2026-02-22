import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "Anomalie nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { acknowledged, notes, resolvedAt } = body;

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
      return NextResponse.json(
        { error: "Keine Aenderungen angegeben" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der SCADA-Anomalie" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Anomalie nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ anomaly });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Anomalie");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Anomalie" },
      { status: 500 }
    );
  }
}
