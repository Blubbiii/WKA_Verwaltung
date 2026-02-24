import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { DistributionMode, EnergySettlementStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für neue Stromabrechnung
 * Validiert alle erforderlichen Felder für einen EnergySettlement-Eintrag
 */
const settlementCreateSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional().nullable(),
  netOperatorRevenueEur: z.number().nonnegative("Erlös muss >= 0 sein"),
  netOperatorReference: z.string().max(100).optional().nullable(),
  totalProductionKwh: z.number().nonnegative("Produktion muss >= 0 sein"),
  eegProductionKwh: z.number().nonnegative().optional().nullable(),
  eegRevenueEur: z.number().nonnegative().optional().nullable(),
  dvProductionKwh: z.number().nonnegative().optional().nullable(),
  dvRevenueEur: z.number().nonnegative().optional().nullable(),
  distributionMode: z.enum(["PROPORTIONAL", "SMOOTHED", "TOLERATED"]).default("SMOOTHED"),
  smoothingFactor: z.number().min(0).max(1).optional().nullable(),
  tolerancePercentage: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// =============================================================================
// GET /api/energy/settlements - Alle Stromabrechnungen mit Filtern
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

    // Optionale Filter hinzufügen
    if (year) {
      where.year = parseInt(year, 10);
    }
    if (month) {
      where.month = parseInt(month, 10);
    }
    if (parkId) {
      where.parkId = parkId;
    }
    if (status && ["DRAFT", "CALCULATED", "INVOICED", "CLOSED"].includes(status)) {
      where.status = status as EnergySettlementStatus;
    }

    // Parallele Abfragen: Daten + Gesamtanzahl
    const [settlements, total] = await Promise.all([
      prisma.energySettlement.findMany({
        where,
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
              recipientFund: {
                select: {
                  id: true,
                  name: true,
                  fundCategory: { select: { id: true, name: true, code: true, color: true } },
                },
              },
              turbine: {
                select: {
                  id: true,
                  designation: true,
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                },
              },
            },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: [
          { year: "desc" },
          { month: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.energySettlement.count({ where }),
    ]);

    // Aggregationen berechnen (Summen für gefilterte Daten)
    const aggregations = await prisma.energySettlement.aggregate({
      where,
      _sum: {
        netOperatorRevenueEur: true,
        totalProductionKwh: true,
      },
    });

    return NextResponse.json({
      data: settlements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      aggregations: {
        totalRevenueEur: aggregations._sum.netOperatorRevenueEur || 0,
        totalProductionKwh: aggregations._sum.totalProductionKwh || 0,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching settlements");
    return NextResponse.json(
      { error: "Fehler beim Laden der Stromabrechnungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/settlements - Neue Stromabrechnung erstellen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = settlementCreateSchema.parse(body);

    // Validierung: Park gehoert zum Tenant + Default-Konfiguration laden
    const park = await prisma.park.findFirst({
      where: {
        id: validatedData.parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        defaultDistributionMode: true,
        defaultTolerancePercent: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Prüfung auf Duplikat (unique constraint: parkId + year + month + tenantId)
    const existing = await prisma.energySettlement.findUnique({
      where: {
        parkId_year_month_tenantId: {
          parkId: validatedData.parkId,
          year: validatedData.year,
          month: validatedData.month ?? 0, // 0 für Jahresabrechnungen
          tenantId: check.tenantId!,
        },
      },
    });

    if (existing) {
      const periodLabel = validatedData.month
        ? `${validatedData.month}/${validatedData.year}`
        : `Jahr ${validatedData.year}`;
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Für Park ${park.name} existiert bereits eine Stromabrechnung für ${periodLabel}`,
        },
        { status: 409 }
      );
    }

    // Park-Defaults verwenden, wenn nicht explizit angegeben
    // distributionMode: Explizit angegeben > Park-Default > SMOOTHED
    const effectiveDistributionMode = (validatedData.distributionMode ||
      park.defaultDistributionMode ||
      "SMOOTHED") as DistributionMode;

    // tolerancePercentage: Explizit angegeben > Park-Default (nur für TOLERATED)
    const effectiveTolerancePercent =
      validatedData.tolerancePercentage ??
      (effectiveDistributionMode === "TOLERATED" && park.defaultTolerancePercent
        ? Number(park.defaultTolerancePercent)
        : null);

    // Stromabrechnung erstellen (Status immer DRAFT bei Erstellung)
    const settlement = await prisma.energySettlement.create({
      data: {
        parkId: validatedData.parkId,
        year: validatedData.year,
        month: validatedData.month ?? null,
        netOperatorRevenueEur: validatedData.netOperatorRevenueEur,
        netOperatorReference: validatedData.netOperatorReference ?? null,
        totalProductionKwh: validatedData.totalProductionKwh,
        eegProductionKwh: validatedData.eegProductionKwh ?? null,
        eegRevenueEur: validatedData.eegRevenueEur ?? null,
        dvProductionKwh: validatedData.dvProductionKwh ?? null,
        dvRevenueEur: validatedData.dvRevenueEur ?? null,
        distributionMode: effectiveDistributionMode,
        smoothingFactor: validatedData.smoothingFactor ?? null,
        tolerancePercentage: effectiveTolerancePercent,
        status: "DRAFT",
        notes: validatedData.notes ?? null,
        tenantId: check.tenantId!,
        updatedAt: new Date(),
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

    // Invalidate dashboard caches after settlement creation
    invalidate.onEnergySettlementChange(
      check.tenantId!, settlement.id, 'create', validatedData.parkId
    ).catch((err) => {
      logger.warn({ err }, '[Settlements] Cache invalidation error after create');
    });

    return NextResponse.json(settlement, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating settlement");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Stromabrechnung" },
      { status: 500 }
    );
  }
}
