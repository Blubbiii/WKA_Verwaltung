import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/leases/cost-allocation/[id] - Single cost allocation with full details
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const allocation = await prisma.parkCostAllocation.findUnique({
      where: { id },
      include: {
        leaseRevenueSettlement: {
          select: {
            id: true,
            year: true,
            status: true,
            actualFeeEur: true,
            totalParkRevenueEur: true,
            revenueSharePercent: true,
            usedMinimum: true,
            park: {
              select: {
                id: true,
                name: true,
                shortName: true,
              },
            },
          },
        },
        items: {
          include: {
            operatorFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
              },
            },
            vatInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
              },
            },
            exemptInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
              },
            },
          },
          orderBy: { operatorFund: { name: "asc" } },
        },
      },
    });

    if (!allocation) {
      return NextResponse.json(
        { error: "Kostenaufteilung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant check
    if (allocation.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(serializePrisma(allocation));
  } catch (error) {
    logger.error(
      { err: error },
      "Error fetching cost allocation"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Kostenaufteilung" },
      { status: 500 }
    );
  }
}
