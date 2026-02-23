import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { createCostAllocationSchema } from "@/types/billing";
import { executeCostAllocation } from "@/lib/lease-revenue/allocator";
import { z } from "zod";

// =============================================================================
// GET /api/leases/cost-allocation - List all ParkCostAllocations
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Filter parameters
    const settlementId = searchParams.get("settlementId");
    const status = searchParams.get("status");
    const parkId = searchParams.get("parkId");

    // Pagination
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build where clause with multi-tenancy filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId: check.tenantId!,
    };

    if (settlementId) {
      where.leaseRevenueSettlementId = settlementId;
    }
    if (status && ["DRAFT", "INVOICED", "CLOSED"].includes(status)) {
      where.status = status;
    }
    if (parkId) {
      where.leaseRevenueSettlement = { parkId };
    }

    const [allocations, total] = await Promise.all([
      prisma.parkCostAllocation.findMany({
        where,
        include: {
          leaseRevenueSettlement: {
            select: {
              id: true,
              year: true,
              status: true,
              park: {
                select: {
                  id: true,
                  name: true,
                  shortName: true,
                },
              },
            },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.parkCostAllocation.count({ where }),
    ]);

    return NextResponse.json(
      serializePrisma({
        data: allocations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching cost allocations");
    return NextResponse.json(
      { error: "Fehler beim Laden der Kostenaufteilungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/leases/cost-allocation - Create a new cost allocation
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = createCostAllocationSchema.parse(body);

    // Execute cost allocation (loads data, calculates, and persists)
    const { allocation, result } = await executeCostAllocation(
      check.tenantId!,
      validatedData.leaseRevenueSettlementId,
      validatedData.periodLabel ?? undefined,
      validatedData.notes ?? undefined
    );

    // Load the created allocation with full details for the response
    const created = await prisma.parkCostAllocation.findUnique({
      where: { id: allocation.id },
      include: {
        leaseRevenueSettlement: {
          select: {
            id: true,
            year: true,
            park: {
              select: { id: true, name: true, shortName: true },
            },
          },
        },
        items: {
          include: {
            operatorFund: {
              select: { id: true, name: true, legalForm: true },
            },
          },
        },
      },
    });

    return NextResponse.json(
      serializePrisma({ allocation: created, calculation: result }),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    // Business logic errors
    if (
      message.includes("nicht gefunden") ||
      message.includes("berechnet") ||
      message.includes("Betreibergesellschaften")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    logger.error({ err: error }, "Error creating cost allocation");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Kostenaufteilung" },
      { status: 500 }
    );
  }
}
