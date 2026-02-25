import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const turbineCreateSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  designation: z.string().min(1, "Bezeichnung ist erforderlich"),
  serialNumber: z.string().optional().nullable(),
  mastrNumber: z.string().optional().nullable(),
  netzgesellschaftFundId: z.string().uuid().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  ratedPowerKw: z.number().optional().nullable(),
  hubHeightM: z.number().optional().nullable(),
  rotorDiameterM: z.number().optional().nullable(),
  commissioningDate: z.string().optional().nullable(),
  warrantyEndDate: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  technicalData: z.record(z.any()).optional(),
  technischeBetriebsfuehrung: z.string().optional().nullable(),
  kaufmaennischeBetriebsfuehrung: z.string().optional().nullable(),
  operatorFundId: z.string().uuid().optional().nullable(),

  // Per-turbine lease overrides
  minimumRent: z.number().optional().nullable(),
  weaSharePercentage: z.number().min(0).max(100).optional().nullable(),
  poolSharePercentage: z.number().min(0).max(100).optional().nullable(),
});

// GET /api/turbines - Liste aller Anlagen
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where = {
      park: {
        tenantId: check.tenantId!,
      },
      ...(parkId && { parkId }),
      ...(search && {
        OR: [
          { designation: { contains: search, mode: "insensitive" as const } },
          { manufacturer: { contains: search, mode: "insensitive" as const } },
          { model: { contains: search, mode: "insensitive" as const } },
          { serialNumber: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
    };

    const [turbines, total] = await Promise.all([
      prisma.turbine.findMany({
        where,
        include: {
          park: {
            select: { id: true, name: true, shortName: true },
          },
          netzgesellschaftFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
              fundCategory: { select: { id: true, name: true, code: true, color: true } },
            },
          },
          _count: {
            select: { serviceEvents: true, documents: true },
          },
        },
        orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.turbine.count({ where }),
    ]);

    return NextResponse.json({
      data: turbines,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching turbines");
    return NextResponse.json(
      { error: "Fehler beim Laden der Anlagen" },
      { status: 500 }
    );
  }
}

// POST /api/turbines - Anlage erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = turbineCreateSchema.parse(body);

    // Extract operatorFundId before passing to prisma (not a Turbine field)
    const { operatorFundId, ...turbineData } = validatedData;

    // Prüfe ob Park zum Tenant gehört
    const park = await prisma.park.findFirst({
      where: {
        id: turbineData.parkId,
        tenantId: check.tenantId!,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    const commissioningDate = turbineData.commissioningDate
      ? new Date(turbineData.commissioningDate)
      : null;

    const turbine = await prisma.turbine.create({
      data: {
        ...turbineData,
        commissioningDate,
        warrantyEndDate: turbineData.warrantyEndDate
          ? new Date(turbineData.warrantyEndDate)
          : null,
        technicalData: turbineData.technicalData || {},
      },
    });

    // If operatorFundId is provided, create a TurbineOperator record
    if (operatorFundId) {
      await prisma.turbineOperator.create({
        data: {
          turbineId: turbine.id,
          operatorFundId,
          validFrom: commissioningDate || new Date(),
          status: "ACTIVE",
          ownershipPercentage: 100.00,
        },
      });
    }

    return NextResponse.json(turbine, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating turbine");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Anlage" },
      { status: 500 }
    );
  }
}
