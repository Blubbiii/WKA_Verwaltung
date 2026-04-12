import { NextRequest, NextResponse, after } from "next/server";
import { requirePermissionWithResources } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logDeletion } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { apiError } from "@/lib/api-errors";

const parkUpdateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").optional(),
  shortName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  commissioningDate: z.string().optional().nullable(),
  totalCapacityKw: z.number().optional().nullable(),
  operatorFundId: z.uuid().optional().nullable(),
  technischeBetriebsfuehrung: z.string().optional().nullable(),
  kaufmaennischeBetriebsfuehrung: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),

  // Pacht-Konfiguration
  minimumRentPerTurbine: z.number().optional().nullable(),
  weaSharePercentage: z.number().min(0).max(100).optional().nullable(),
  poolSharePercentage: z.number().min(0).max(100).optional().nullable(),
  wegCompensationPerSqm: z.number().optional().nullable(),
  ausgleichCompensationPerSqm: z.number().optional().nullable(),
  kabelCompensationPerM: z.number().optional().nullable(),

  // Stromabrechnung-Konfiguration (DULDUNG)
  defaultDistributionMode: z.enum(["PROPORTIONAL", "SMOOTHED", "TOLERATED"]).optional(),
  defaultTolerancePercent: z.number().min(0).max(100).optional().nullable(),
  billingEntityFundId: z.uuid().optional().nullable(),

  // Pachtabrechnungs-Konfiguration
  settlementArticles: z.array(z.object({
    type: z.string(),
    label: z.string(),
    taxRate: z.number().min(0).max(100),
    accountNumber: z.string(),
  })).optional().nullable(),
  defaultPaymentDay: z.number().int().min(1).max(28).optional().nullable(),

  // Report cover image
  reportCoverImageKey: z.string().optional().nullable(),

  // Notes
  notes: z.string().optional().nullable(),
});

// GET /api/parks/[id] - Einzelnen Park laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermissionWithResources(PERMISSIONS.PARKS_READ, "Park");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Resource-level check: deny access if user is restricted and park not in allowed list
    if (check.resourceRestricted && check.allowedResourceIds?.length && !check.allowedResourceIds.includes(id)) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Park" });
    }

    const park = await prisma.park.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        turbines: {
          orderBy: { designation: "asc" },
          include: {
            netzgesellschaftFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
                childHierarchies: {
                  where: { validTo: null },
                  select: {
                    ownershipPercentage: true,
                    childFundId: true,
                  },
                },
              },
            },
            operatorHistory: {
              where: { validTo: null, status: "ACTIVE" },
              include: {
                operatorFund: {
                  select: {
                    id: true,
                    name: true,
                    legalForm: true,
                    fundCategory: { select: { id: true, name: true, code: true, color: true } },
                  },
                },
              },
            },
          },
        },
        fundParks: {
          include: {
            fund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
              },
            },
          },
        },
        plots: {
          include: {
            plotAreas: true,
            leasePlots: {
              include: {
                lease: {
                  include: {
                    lessor: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        companyName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        contracts: {
          where: { status: { not: "TERMINATED" } },
          orderBy: { endDate: "asc" },
          include: {
            documents: {
              where: { isArchived: false },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                title: true,
                fileName: true,
                fileUrl: true,
                mimeType: true,
              },
            },
          },
        },
        documents: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        weatherData: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
        revenuePhases: {
          orderBy: { phaseNumber: "asc" },
        },
        billingEntityFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
          },
        },
        operatorFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
          },
        },
        _count: {
          select: {
            turbines: true,
            documents: true,
            contracts: true,
            plots: true,
          },
        },
      },
    });

    if (!park) {
      return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
    }

    // Berechne Statistiken (nur echte WEAs, keine NVP/Parkrechner)
    const activeTurbines = park.turbines.filter((t) => t.status === "ACTIVE");
    const activeWEAs = activeTurbines.filter((t) => (t.deviceType ?? "WEA") === "WEA");
    const totalCapacity = activeWEAs.reduce(
      (sum, t) => sum + (Number(t.ratedPowerKw) || 0),
      0
    );

    const stats = {
      turbineCount: park._count.turbines,
      activeTurbineCount: activeWEAs.length,
      calculatedCapacityKw: totalCapacity,
      documentCount: park._count.documents,
      contractCount: park._count.contracts,
      plotCount: park._count.plots,
    };

    return NextResponse.json(serializePrisma({ ...park, stats }));
  } catch (error) {
    logger.error({ err: error }, "Error fetching park");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Parks" });
  }
}

// PUT /api/parks/[id] - Park aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermissionWithResources(PERMISSIONS.PARKS_UPDATE, "Park");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Resource-level check
    if (check.resourceRestricted && check.allowedResourceIds?.length && !check.allowedResourceIds.includes(id)) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Park" });
    }

    // Prüfe ob Park existiert und zum Tenant gehört
    const existingPark = await prisma.park.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingPark) {
      return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
    }

    const body = await request.json();
    const validatedData = parkUpdateSchema.parse(body);

    // Build update data explicitly to satisfy Prisma's Exact type
    const updateData: Record<string, unknown> = { ...validatedData };
    if (validatedData.commissioningDate !== undefined) {
      updateData.commissioningDate = validatedData.commissioningDate
        ? new Date(validatedData.commissioningDate)
        : null;
    }

    const park = await prisma.park.update({
      where: { id },
      data: updateData as Parameters<typeof prisma.park.update>[0]["data"],
    });

    // Invalidate dashboard caches after park update
    invalidate.onParkChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Parks] Cache invalidation error after update');
    });

    return NextResponse.json(park);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren des Parks");
  }
}

// DELETE /api/parks/[id] - Park unwiderruflich löschen (Hard-Delete)
// Nur ADMIN und SUPERADMIN dürfen löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermissionWithResources(PERMISSIONS.PARKS_DELETE, "Park");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Resource-level check
    if (check.resourceRestricted && check.allowedResourceIds?.length && !check.allowedResourceIds.includes(id)) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Park" });
    }

    // Prüfe ob Park existiert und zum Tenant gehört
    const existingPark = await prisma.park.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        _count: {
          select: {
            turbines: true,
            plots: true,
            contracts: true,
          },
        },
      },
    });

    if (!existingPark) {
      return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
    }

    // Prüfe auf aktive Verknüpfungen
    if (existingPark._count.turbines > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Park hat noch Anlagen und kann nicht gelöscht werden. Bitte zuerst alle Anlagen entfernen." });
    }

    if (existingPark._count.plots > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Park hat noch Flurstücke und kann nicht gelöscht werden. Bitte zuerst alle Flurstücke entfernen." });
    }

    if (existingPark._count.contracts > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Park hat noch Verträge und kann nicht gelöscht werden. Bitte zuerst alle Verträge entfernen." });
    }

    // Hard-Delete: Park unwiderruflich löschen
    await prisma.park.delete({
      where: { id },
    });

    // Log the deletion for audit trail (deferred: runs after response is sent)
    const parkSnapshot = existingPark as Record<string, unknown>;
    after(async () => {
      await logDeletion("Park", id, parkSnapshot);
    });

    // Invalidate dashboard caches after park deletion
    invalidate.onParkChange(check.tenantId!, id, 'delete').catch((err) => {
      logger.warn({ err }, '[Parks] Cache invalidation error after delete');
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting park");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Parks" });
  }
}
