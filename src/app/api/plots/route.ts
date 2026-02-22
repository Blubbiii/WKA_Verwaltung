import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const plotCreateSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID").optional(),
  // Geografische Zuordnung (Reihenfolge)
  county: z.string().optional(),           // Landkreis
  municipality: z.string().optional(),     // Gemeinde
  cadastralDistrict: z.string().min(1, "Gemarkung ist erforderlich"), // Gemarkung (Pflichtfeld)
  fieldNumber: z.string().default("0"),    // Flur (0 wenn nicht vorhanden)
  plotNumber: z.string().min(1, "Flurstücknummer ist erforderlich"), // Flurstück (Pflichtfeld)
  areaSqm: z.number().optional(),
  usageType: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  mapImageUrl: z.string().url().optional(),
  mapDocumentUrl: z.string().url().optional(),
  notes: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

// GET /api/plots
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const noPark = searchParams.get("noPark") === "true";
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const areaType = searchParams.get("areaType") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const validAreaTypes = ["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"];

    const where = {
      tenantId: check.tenantId,
      ...(noPark ? { parkId: null } : parkId ? { parkId } : {}),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
      ...(areaType && validAreaTypes.includes(areaType) && {
        plotAreas: {
          some: {
            areaType: areaType as "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL",
          },
        },
      }),
      ...(search && {
        OR: [
          { cadastralDistrict: { contains: search, mode: "insensitive" as const } },
          { fieldNumber: { contains: search, mode: "insensitive" as const } },
          { plotNumber: { contains: search, mode: "insensitive" as const } },
          { county: { contains: search, mode: "insensitive" as const } },
          { municipality: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    // Check if we should include lease information
    const includeLeases = searchParams.get("includeLeases") === "true";
    // Check if we should include GeoJSON geometry (for map view)
    const includeGeometry = searchParams.get("includeGeometry") === "true";

    // Lease/lessor include fragment (shared by includeLeases and includeGeometry)
    const leaseIncludeFragment = {
      include: {
        lease: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            lessor: {
              select: {
                id: true,
                personType: true,
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
          },
        },
      },
    };

    // Determine whether lease data should be loaded (for table or map view)
    const needLeaseData = includeLeases || includeGeometry;

    // Build include object based on query parameters
    const includeObject = {
      park: {
        select: { id: true, name: true, shortName: true },
      },
      plotAreas: true,
      _count: {
        select: { leasePlots: true, plotAreas: true },
      },
      ...(needLeaseData && { leasePlots: leaseIncludeFragment }),
    };

    const [plots, total] = await Promise.all([
      prisma.plot.findMany({
        where,
        include: includeObject,
        orderBy: [
          { county: "asc" },
          { municipality: "asc" },
          { cadastralDistrict: "asc" },
          { fieldNumber: "asc" },
          { plotNumber: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.plot.count({ where }),
    ]);

    // Type for leasePlot with lease relation (when includeLeases is true)
    interface LeaseWithLessor {
      id: string;
      status: string;
      startDate: Date;
      endDate: Date | null;
      lessor: {
        id: string;
        personType: string;
        firstName: string | null;
        lastName: string | null;
        companyName: string | null;
      };
    }

    interface LeasePlotWithLease {
      id: string;
      leaseId: string;
      plotId: string;
      createdAt: Date;
      lease: LeaseWithLessor;
    }

    // Helper to derive a display name from a lessor object
    function getLessorName(lessor: LeaseWithLessor["lessor"]): string | null {
      if (lessor.personType === "legal") {
        return lessor.companyName ?? null;
      }
      return [lessor.firstName, lessor.lastName].filter(Boolean).join(" ") || null;
    }

    // Transform plots: extract activeLease info and optionally strip geometry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedPlots = plots.map((plot: any) => {
      // Destructure: separate geometry and leasePlots from the rest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { geometry, leasePlots, ...basePlot } = plot;

      // Build the output object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output: Record<string, any> = { ...basePlot };

      // Only include GeoJSON geometry when explicitly requested (saves bandwidth)
      if (includeGeometry) {
        output.geometry = geometry ?? null;
      }

      // Compute activeLease summary when lease data was loaded
      if (needLeaseData && leasePlots) {
        const typedLeasePlots = leasePlots as LeasePlotWithLease[];
        const leaseCount = typedLeasePlots.length;

        const activeLeasePlot = typedLeasePlots.find(
          (lp) =>
            lp.lease.status === "ACTIVE" || lp.lease.status === "EXPIRING",
        );

        // Fallback: pick the first lease (any status) when no active lease exists
        const fallbackLeasePlot =
          !activeLeasePlot && leaseCount > 0 ? typedLeasePlots[0] : null;
        const effectiveLease = activeLeasePlot ?? fallbackLeasePlot;

        output.leaseCount = leaseCount;

        if (effectiveLease) {
          output.activeLease = {
            leaseId: effectiveLease.lease.id,
            status: effectiveLease.lease.status,
            lessorName: getLessorName(effectiveLease.lease.lessor),
            // Include full lessor object when geometry is requested (for map color coding)
            ...(includeGeometry && { lessor: effectiveLease.lease.lessor }),
          };
        } else {
          output.activeLease = null;
        }
      }

      return output;
    });

    return NextResponse.json({
      data: transformedPlots,
      plots: transformedPlots, // Also return as 'plots' for compatibility
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching plots");
    return NextResponse.json(
      { error: "Fehler beim Laden der Flurstücke" },
      { status: 500 }
    );
  }
}

// POST /api/plots
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = plotCreateSchema.parse(body);

    // Verify park belongs to tenant if parkId provided
    if (validatedData.parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: validatedData.parkId,
          tenantId: check.tenantId,
        },
      });

      if (!park) {
        return NextResponse.json(
          { error: "Park nicht gefunden" },
          { status: 404 }
        );
      }
    }

    // Check for duplicate (unique constraint: tenantId + cadastralDistrict + fieldNumber + plotNumber)
    const existing = await prisma.plot.findFirst({
      where: {
        tenantId: check.tenantId,
        cadastralDistrict: validatedData.cadastralDistrict,
        fieldNumber: validatedData.fieldNumber || "0",
        plotNumber: validatedData.plotNumber,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ein Flurstück mit dieser Kombination (Gemarkung, Flur, Flurstück) existiert bereits" },
        { status: 409 }
      );
    }

    const plot = await prisma.plot.create({
      data: {
        ...validatedData,
        tenantId: check.tenantId!,
        fieldNumber: validatedData.fieldNumber || "0",
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
      },
    });

    return NextResponse.json(plot, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating plot");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Flurstücks" },
      { status: 500 }
    );
  }
}
