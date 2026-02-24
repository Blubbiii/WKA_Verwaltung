import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { parsePaginationParams, parseSortParams } from "@/lib/api-utils";
import { z } from "zod";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const PARKS_SORT_FIELDS = [
  "name",
  "shortName",
  "city",
  "status",
  "createdAt",
  "updatedAt",
  "commissioningDate",
] as const;

const parkCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  shortName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().default("Deutschland"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  commissioningDate: z.string().optional().nullable(),
  totalCapacityKw: z.number().optional().nullable(),
  operatorFundId: z.string().uuid().optional().nullable(),
  technischeBetriebsführung: z.string().optional().nullable(),
  kaufmaennischeBetriebsführung: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),

  // Billing configuration (Pacht-Konfiguration)
  minimumRentPerTurbine: z.number().optional().nullable(),
  weaSharePercentage: z.number().min(0).max(100).optional().nullable(),
  poolSharePercentage: z.number().min(0).max(100).optional().nullable(),
  wegCompensationPerSqm: z.number().optional().nullable(),
  ausgleichCompensationPerSqm: z.number().optional().nullable(),
  kabelCompensationPerM: z.number().optional().nullable(),

  // Energy settlement configuration (Stromabrechnung-Konfiguration)
  defaultDistributionMode: z.enum(["PROPORTIONAL", "SMOOTHED", "TOLERATED"]).optional(),
  defaultTolerancePercent: z.number().min(0).max(100).optional().nullable(),
  billingEntityFundId: z.string().uuid().optional().nullable(),

  // Lease settlement mode (Nutzungsentgelt-Abrechnungsmodus)
  leaseSettlementMode: z.enum(["NETWORK_COMPANY", "OPERATOR_DIRECT"]).optional(),
});

// GET /api/parks - Liste aller Parks
async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PARKS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const { sortBy, sortOrder } = parseSortParams(
      searchParams,
      [...PARKS_SORT_FIELDS],
      { defaultField: "name", defaultOrder: "asc" },
    );
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const where = {
      tenantId: check.tenantId!,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { shortName: { contains: search, mode: "insensitive" as const } },
          { city: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
    };

    const [parks, total] = await Promise.all([
      prisma.park.findMany({
        where,
        include: {
          turbines: {
            select: { id: true, ratedPowerKw: true, status: true },
          },
          _count: {
            select: { turbines: true, documents: true, contracts: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.park.count({ where }),
    ]);

    // Berechne aggregierte Werte
    const parksWithStats = parks.map((park) => {
      const activeTurbines = park.turbines.filter((t) => t.status === "ACTIVE");
      const totalCapacity = activeTurbines.reduce(
        (sum, t) => sum + (Number(t.ratedPowerKw) || 0),
        0
      );

      return {
        ...park,
        turbines: undefined,
        stats: {
          turbineCount: park._count.turbines,
          activeTurbineCount: activeTurbines.length,
          totalCapacityKw: totalCapacity,
          documentCount: park._count.documents,
          contractCount: park._count.contracts,
        },
      };
    });

    return NextResponse.json({
      data: parksWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching parks");
    return NextResponse.json(
      { error: "Fehler beim Laden der Parks" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);

// POST /api/parks - Park erstellen
async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PARKS_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = parkCreateSchema.parse(body);

    // Create park and virtual infrastructure turbines atomically
    const park = await prisma.$transaction(async (tx) => {
      const newPark = await tx.park.create({
        data: {
          ...validatedData,
          commissioningDate: validatedData.commissioningDate
            ? new Date(validatedData.commissioningDate)
            : null,
          tenantId: check.tenantId!,
        },
      });

      // Auto-create virtual infrastructure turbines (NVP + Parkrechner)
      await tx.turbine.createMany({
        data: [
          {
            designation: "Netzverknuepfungspunkt",
            deviceType: "NVP",
            parkId: newPark.id,
            status: "ACTIVE",
          },
          {
            designation: "Parkrechner",
            deviceType: "PARKRECHNER",
            parkId: newPark.id,
            status: "ACTIVE",
          },
        ],
      });

      return newPark;
    });

    // Invalidate dashboard caches after park creation
    invalidate.onParkChange(check.tenantId!, park.id, 'create').catch((err) => {
      logger.warn({ err }, '[Parks] Cache invalidation error after create');
    });

    return NextResponse.json(park, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating park");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Parks" },
      { status: 500 }
    );
  }
}

export const POST = withMonitoring(postHandler);
