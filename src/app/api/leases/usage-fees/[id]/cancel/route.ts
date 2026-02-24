import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const cancelSchema = z.object({
  reason: z.string().min(1, "Stornogrund ist erforderlich").max(500),
});

// =============================================================================
// POST /api/leases/usage-fees/[id]/cancel - Cancel (stornieren) a settlement
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const body = await request.json();
    const { reason } = cancelSchema.parse(body);

    // Load settlement and verify tenant ownership
    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Cannot cancel already cancelled settlements
    if (settlement.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Abrechnung ist bereits storniert" },
        { status: 400 }
      );
    }

    // Cannot cancel OPEN settlements - use delete instead
    if (settlement.status === "OPEN") {
      return NextResponse.json(
        {
          error: "Offene Abrechnungen können direkt gelöscht werden",
          details: "Stornierung ist nur für bereits berechnete oder abgerechnete Abrechnungen vorgesehen",
        },
        { status: 400 }
      );
    }

    // Store previous state for audit trail
    const previousStatus = settlement.status;
    const previousDetails = settlement.calculationDetails as Record<string, unknown> | null;

    // Update status to CANCELLED, preserve calculation details for audit trail
    const updated = await prisma.leaseRevenueSettlement.update({
      where: { id },
      data: {
        status: "CANCELLED",
        calculationDetails: {
          ...(previousDetails || {}),
          cancellation: {
            previousStatus,
            cancelledAt: new Date().toISOString(),
            cancelledBy: check.userId,
            reason,
          },
        },
      },
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
        previousStatus,
        reason,
      },
      "Lease revenue settlement cancelled"
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error(
      { err: error },
      "Error cancelling lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Stornieren der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
  }
}
