import { NextRequest, NextResponse } from "next/server";
import { productionCreateSchema } from "@/lib/energy/production-schemas";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { handleApiError, parsePaginationParams } from "@/lib/api-utils";
import { ProductionDataSource, ProductionStatus, Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für neue Produktionsdaten
 * Validiert alle erforderlichen Felder für einen TurbineProduction-Eintrag
 */

// =============================================================================
// GET /api/energy/productions - Alle Produktionsdaten mit Filtern
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    // URL-Parameter extrahieren
    const { searchParams } = new URL(request.url);

    // Filter-Parameter
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const turbineId = searchParams.get("turbineId");
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status");

    // Paginierung
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50 });

    // Where-Clause mit Multi-Tenancy Filter
    const where: Prisma.TurbineProductionWhereInput = {
      tenantId: check.tenantId!,
    };

    // Optionale Filter hinzufügen
    if (year) {
      where.year = parseInt(year, 10);
    }
    if (month) {
      where.month = parseInt(month, 10);
    }
    if (turbineId) {
      where.turbineId = turbineId;
    }
    if (status && ["DRAFT", "CONFIRMED", "INVOICED"].includes(status)) {
      where.status = status as ProductionStatus;
    }

    // Park-Filter erfordert Join über Turbine
    if (parkId) {
      where.turbine = {
        parkId: parkId,
      };
    }

    // Parallele Abfragen: Daten + Gesamtanzahl
    const [productions, total] = await Promise.all([
      prisma.turbineProduction.findMany({
        where,
        include: {
          revenueType: { select: { id: true, name: true, code: true } },
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
        },
        orderBy: [
          { year: "desc" },
          { month: "desc" },
          { turbine: { designation: "asc" } },
        ],
        skip,
        take: limit,
      }),
      prisma.turbineProduction.count({ where }),
    ]);

    // Aggregationen berechnen (Summen für gefilterte Daten)
    const aggregations = await prisma.turbineProduction.aggregate({
      where,
      _sum: {
        productionKwh: true,
      },
    });

    return NextResponse.json({
      data: productions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      aggregations: {
        totalProductionKwh: aggregations._sum.productionKwh || 0,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching productions");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Produktionsdaten" });
  }
}

// =============================================================================
// POST /api/energy/productions - Neue Produktionsdaten erstellen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = productionCreateSchema.parse(body);

    // A revenue type of another tenant must not be linkable.
    if (validatedData.revenueTypeId) {
      const art = await prisma.energyRevenueType.findFirst({
        where: { id: validatedData.revenueTypeId, tenantId: check.tenantId! },
        select: { id: true },
      });
      if (!art) return apiError("VALIDATION_FAILED", 400, { message: "Unbekannte Erlösart" });
    }


    // Validierung: Turbine gehoert zum Tenant
    const turbine = await prisma.turbine.findFirst({
      where: {
        id: validatedData.turbineId,
        park: {
          tenantId: check.tenantId!,
        },
      },
      select: { id: true, designation: true },
    });

    if (!turbine) {
      return apiError("FORBIDDEN", 404, { message: "Turbine nicht gefunden oder keine Berechtigung" });
    }

    // Prüfung auf Duplikat (unique constraint: turbineId + year + month + tenantId)
    const existing = await prisma.turbineProduction.findUnique({
      where: {
        turbineId_year_month_tenantId: {
          turbineId: validatedData.turbineId,
          year: validatedData.year,
          month: validatedData.month,
          tenantId: check.tenantId!,
        },
      },
    });

    if (existing) {
      return apiError("ALREADY_EXISTS", undefined, { message: "Duplikat erkannt", details: `Für Turbine ${turbine.designation} existieren bereits Produktionsdaten für ${validatedData.month}/${validatedData.year}` });
    }

    // Produktionsdaten erstellen
    const production = await prisma.turbineProduction.create({
      data: {
        turbineId: validatedData.turbineId,
        year: validatedData.year,
        month: validatedData.month,
        productionKwh: validatedData.productionKwh,
        operatingHours: validatedData.operatingHours ?? null,
        availabilityPct: validatedData.availabilityPct ?? null,
        source: validatedData.source as ProductionDataSource,
        status: validatedData.status as ProductionStatus,
        notes: validatedData.notes ?? null,
        revenueEur: validatedData.revenueEur ?? null,
        revenueTypeId: validatedData.revenueTypeId ?? null,
        tenantId: check.tenantId!,
      },
      include: {
        revenueType: { select: { id: true, name: true, code: true } },
        turbine: {
          select: {
            id: true,
            designation: true,
            park: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return NextResponse.json(production, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Produktionsdaten");
  }
}
