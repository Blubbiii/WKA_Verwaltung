import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { createLeaseRevenueSettlementSchema } from "@/types/billing";
import { z } from "zod";

// =============================================================================
// GET /api/leases/usage-fees - List all LeaseRevenueSettlements
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Filter parameters
    const parkId = searchParams.get("parkId");
    const year = searchParams.get("year");
    const status = searchParams.get("status");

    // Pagination
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build where clause with multi-tenancy filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId: check.tenantId!,
    };

    if (parkId) {
      where.parkId = parkId;
    }
    if (year) {
      where.year = parseInt(year, 10);
    }
    if (
      status &&
      ["OPEN", "ADVANCE_CREATED", "CALCULATED", "SETTLED", "CLOSED"].includes(
        status
      )
    ) {
      where.status = status;
    }

    // Parallel queries: data + total count
    const [settlements, total] = await Promise.all([
      prisma.leaseRevenueSettlement.findMany({
        where,
        include: {
          park: {
            select: {
              id: true,
              name: true,
              shortName: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: [{ year: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaseRevenueSettlement.count({ where }),
    ]);

    return NextResponse.json(
      serializePrisma({
        data: settlements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching lease revenue settlements");
    return NextResponse.json(
      { error: "Fehler beim Laden der Nutzungsentgelt-Abrechnungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/leases/usage-fees - Create a new LeaseRevenueSettlement
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = createLeaseRevenueSettlementSchema.parse(body);

    // Validate park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: validatedData.parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Check unique constraint (tenantId + parkId + year + periodType + month)
    const existing = await prisma.leaseRevenueSettlement.findUnique({
      where: {
        tenantId_parkId_year_periodType_month: {
          tenantId: check.tenantId!,
          parkId: validatedData.parkId,
          year: validatedData.year,
          periodType: "FINAL",
          month: 0,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Fuer Park ${park.name} existiert bereits eine Nutzungsentgelt-Abrechnung fuer ${validatedData.year}`,
        },
        { status: 409 }
      );
    }

    // Create settlement with status OPEN
    const settlement = await prisma.leaseRevenueSettlement.create({
      data: {
        tenantId: check.tenantId!,
        parkId: validatedData.parkId,
        year: validatedData.year,
        status: "OPEN",
        advanceDueDate: validatedData.advanceDueDate
          ? new Date(validatedData.advanceDueDate)
          : null,
        settlementDueDate: validatedData.settlementDueDate
          ? new Date(validatedData.settlementDueDate)
          : null,
        createdById: check.userId,
      },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        items: true,
      },
    });

    return NextResponse.json(serializePrisma(settlement), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error(
      { err: error },
      "Error creating lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
  }
}
