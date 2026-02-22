import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import {
  createLeaseRevenueSettlementSchema,
  LeaseRevenueSettlementStatus,
  SettlementPeriodType,
} from "@/types/billing";
import { z } from "zod";

// =============================================================================
// GET /api/leases/settlement - List all LeaseRevenueSettlements (paginated)
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
    const periodType = searchParams.get("periodType");

    // Pagination
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // Build where clause with multi-tenancy filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (parkId) {
      where.parkId = parkId;
    }
    if (year) {
      where.year = parseInt(year, 10);
    }
    if (
      status &&
      Object.values(LeaseRevenueSettlementStatus).includes(
        status as LeaseRevenueSettlementStatus
      )
    ) {
      where.status = status;
    }
    if (
      periodType &&
      Object.values(SettlementPeriodType).includes(
        periodType as (typeof SettlementPeriodType)[keyof typeof SettlementPeriodType]
      )
    ) {
      where.periodType = periodType;
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
        orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaseRevenueSettlement.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      serializePrisma({
        data: settlements,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        // Also return flat fields for wizard/other consumers
        settlements,
        total,
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
// POST /api/leases/settlement - Create a new LeaseRevenueSettlement
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = createLeaseRevenueSettlementSchema.parse(body);

    // For ADVANCE: require advanceInterval and derive month if not provided
    if (validatedData.periodType === "ADVANCE") {
      if (!validatedData.advanceInterval) {
        return NextResponse.json(
          {
            error: "Validierungsfehler",
            details: "Bei Vorschuss-Abrechnungen muss ein Abrechnungsintervall angegeben werden (advanceInterval)",
          },
          { status: 400 }
        );
      }

      // Derive month from advanceInterval if not explicitly set
      if (validatedData.month == null) {
        switch (validatedData.advanceInterval) {
          case "YEARLY":
            // Yearly advance: month is null (whole year)
            break;
          case "QUARTERLY":
          case "MONTHLY":
            return NextResponse.json(
              {
                error: "Validierungsfehler",
                details: "Bei quartalsweisen oder monatlichen Vorschuessen muss der Monat (month) angegeben werden",
              },
              { status: 400 }
            );
        }
      }
    }

    // Validate park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: validatedData.parkId,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
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

    // Check unique constraint: [tenantId, parkId, year, periodType, month]
    const existing = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        tenantId: check.tenantId!,
        parkId: validatedData.parkId,
        year: validatedData.year,
        periodType: validatedData.periodType || "FINAL",
        month: validatedData.month ?? null,
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
      },
    });

    if (existing) {
      // If not yet finalized (OPEN or CALCULATED), reuse the existing settlement
      if (existing.status === "OPEN" || existing.status === "CALCULATED") {
        // Update mutable fields if provided
        const updated = await prisma.leaseRevenueSettlement.update({
          where: { id: existing.id },
          data: {
            advanceInterval: validatedData.advanceInterval ?? existing.advanceInterval,
            linkedEnergySettlementId: validatedData.linkedEnergySettlementId ?? existing.linkedEnergySettlementId,
            advanceDueDate: validatedData.advanceDueDate
              ? new Date(validatedData.advanceDueDate)
              : existing.advanceDueDate,
            settlementDueDate: validatedData.settlementDueDate
              ? new Date(validatedData.settlementDueDate)
              : existing.settlementDueDate,
            notes: validatedData.notes ?? existing.notes,
          },
          include: {
            park: {
              select: { id: true, name: true, shortName: true },
            },
          },
        });
        return NextResponse.json(
          { settlement: serializePrisma(updated) },
          { status: 200 }
        );
      }

      // Already finalized — block duplicate
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Fuer Park "${park.name}" existiert bereits eine abgeschlossene Abrechnung fuer diesen Zeitraum (${validatedData.year}, ${validatedData.periodType || "FINAL"}, Monat: ${validatedData.month ?? "ganzjaehrig"})`,
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
        periodType: validatedData.periodType || "FINAL",
        advanceInterval: validatedData.advanceInterval ?? null,
        month: validatedData.month ?? null,
        linkedEnergySettlementId: validatedData.linkedEnergySettlementId ?? null,
        advanceDueDate: validatedData.advanceDueDate
          ? new Date(validatedData.advanceDueDate)
          : null,
        settlementDueDate: validatedData.settlementDueDate
          ? new Date(validatedData.settlementDueDate)
          : null,
        notes: validatedData.notes ?? null,
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
      },
    });

    return NextResponse.json(
      { settlement: serializePrisma(settlement) },
      { status: 201 }
    );
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
