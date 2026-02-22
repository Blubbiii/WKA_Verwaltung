import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { ProductionDataSource, ProductionStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema fuer neue Produktionsdaten
 * Validiert alle erforderlichen Felder fuer einen TurbineProduction-Eintrag
 */
const productionCreateSchema = z.object({
  turbineId: z.string().uuid("Ungueltige Turbinen-ID"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  productionKwh: z.number().nonnegative("Produktion muss >= 0 sein"),
  operatingHours: z.number().nonnegative("Betriebsstunden muessen >= 0 sein").optional().nullable(),
  availabilityPct: z.number().min(0).max(100, "Verfuegbarkeit muss zwischen 0 und 100 liegen").optional().nullable(),
  source: z.enum(["MANUAL", "CSV_IMPORT", "EXCEL_IMPORT", "SCADA"]).default("MANUAL"),
  status: z.enum(["DRAFT", "CONFIRMED", "INVOICED"]).default("DRAFT"),
  notes: z.string().max(1000).optional().nullable(),
});

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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Where-Clause mit Multi-Tenancy Filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
      tenantId: check.tenantId!,
    };

    // Optionale Filter hinzufuegen
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

    // Park-Filter erfordert Join ueber Turbine
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.turbineProduction.count({ where }),
    ]);

    // Aggregationen berechnen (Summen fuer gefilterte Daten)
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Produktionsdaten" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Turbine nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Pruefung auf Duplikat (unique constraint: turbineId + year + month + tenantId)
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
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Fuer Turbine ${turbine.designation} existieren bereits Produktionsdaten fuer ${validatedData.month}/${validatedData.year}`,
        },
        { status: 409 }
      );
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
        tenantId: check.tenantId!,
      },
      include: {
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating production");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Produktionsdaten" },
      { status: 500 }
    );
  }
}
