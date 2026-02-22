import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/leases/settlement/[id]/close - Close/complete a settlement
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Load settlement and verify tenant ownership
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        id,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Only SETTLED or APPROVED settlements can be closed
    if (settlement.status !== "SETTLED" && settlement.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: "Abschliessen nicht moeglich",
          details: `Nur abgerechnete oder freigegebene Abrechnungen koennen abgeschlossen werden. Aktueller Status: ${settlement.status}`,
        },
        { status: 400 }
      );
    }

    // Update status to CLOSED
    const updated = await prisma.leaseRevenueSettlement.update({
      where: { id },
      data: { status: "CLOSED" },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        items: {
          include: {
            lessorPerson: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
            lease: {
              select: {
                id: true,
                startDate: true,
                endDate: true,
              },
            },
          },
          orderBy: { lessorPerson: { lastName: "asc" } },
        },
      },
    });

    logger.info(
      {
        settlementId: id,
        parkId: settlement.parkId,
        year: settlement.year,
        previousStatus: settlement.status,
      },
      "Lease revenue settlement closed"
    );

    return NextResponse.json({
      settlement: serializePrisma(updated),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Error closing lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Abschliessen der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
  }
}
