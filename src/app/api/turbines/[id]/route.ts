import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logDeletion } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

const turbineUpdateSchema = z.object({
  designation: z.string().min(1, "Bezeichnung ist erforderlich").optional(),
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
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  technicalData: z.record(z.any()).optional(),
  technischeBetriebsführung: z.string().optional().nullable(),
  kaufmaennischeBetriebsführung: z.string().optional().nullable(),
  operatorFundId: z.string().uuid().optional().nullable(),
});

// GET /api/turbines/[id] - Einzelne Anlage laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const turbine = await prisma.turbine.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId!,
        },
      },
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
        operatorHistory: {
          where: { status: "ACTIVE", validTo: null },
          take: 1,
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
        serviceEvents: {
          orderBy: { eventDate: "desc" },
          take: 20,
          include: {
            _count: {
              select: { documents: true },
            },
          },
        },
        contracts: {
          where: { status: { not: "TERMINATED" } },
          orderBy: { endDate: "asc" },
        },
        documents: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: { serviceEvents: true, documents: true, contracts: true },
        },
      },
    });

    if (!turbine) {
      return NextResponse.json(
        { error: "Anlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(turbine);
  } catch (error) {
    logger.error({ err: error }, "Error fetching turbine");
    return NextResponse.json(
      { error: "Fehler beim Laden der Anlage" },
      { status: 500 }
    );
  }
}

// PUT /api/turbines/[id] - Anlage aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Prüfe ob Anlage existiert und zum Tenant gehört
    const existingTurbine = await prisma.turbine.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId!,
        },
      },
    });

    if (!existingTurbine) {
      return NextResponse.json(
        { error: "Anlage nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = turbineUpdateSchema.parse(body);

    // Extract operatorFundId before passing to prisma (not a Turbine field)
    const { operatorFundId, ...turbineData } = validatedData;

    // Turbine update + Operator-Historie-Änderungen atomar in einer Transaktion
    const turbine = await prisma.$transaction(async (tx) => {
      const updatedTurbine = await tx.turbine.update({
        where: { id },
        data: {
          ...turbineData,
          commissioningDate: turbineData.commissioningDate
            ? new Date(turbineData.commissioningDate)
            : turbineData.commissioningDate === null
              ? null
              : undefined,
          warrantyEndDate: turbineData.warrantyEndDate
            ? new Date(turbineData.warrantyEndDate)
            : turbineData.warrantyEndDate === null
              ? null
              : undefined,
        },
      });

      // Handle TurbineOperator updates if operatorFundId was provided in the request
      if (operatorFundId !== undefined) {
        // Find current active operator for this turbine
        const currentOperator = await tx.turbineOperator.findFirst({
          where: {
            turbineId: id,
            status: "ACTIVE",
            validTo: null,
          },
        });

        if (operatorFundId) {
          // A new operator fund was specified
          if (!currentOperator || currentOperator.operatorFundId !== operatorFundId) {
            // Set old operator to HISTORICAL if it exists and is different
            if (currentOperator) {
              await tx.turbineOperator.update({
                where: { id: currentOperator.id },
                data: {
                  status: "HISTORICAL",
                  validTo: new Date(),
                },
              });
            }

            // Create new active TurbineOperator
            await tx.turbineOperator.create({
              data: {
                turbineId: id,
                operatorFundId,
                validFrom: new Date(),
                status: "ACTIVE",
                ownershipPercentage: 100.00,
              },
            });
          }
          // If same operator, do nothing
        } else {
          // operatorFundId is null/empty -- remove current operator
          if (currentOperator) {
            await tx.turbineOperator.update({
              where: { id: currentOperator.id },
              data: {
                status: "HISTORICAL",
                validTo: new Date(),
              },
            });
          }
        }
      }

      return updatedTurbine;
    });

    return NextResponse.json(turbine);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating turbine");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Anlage" },
      { status: 500 }
    );
  }
}

// DELETE /api/turbines/[id] - Anlage unwiderruflich löschen (Hard-Delete)
// Nur ADMIN und SUPERADMIN dürfen löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_DELETE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Prüfe ob Anlage existiert und zum Tenant gehört
    const existingTurbine = await prisma.turbine.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId!,
        },
      },
      include: {
        _count: {
          select: {
            serviceEvents: true,
            documents: true,
            contracts: true,
          },
        },
      },
    });

    if (!existingTurbine) {
      return NextResponse.json(
        { error: "Anlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Prüfe auf aktive Verknüpfungen
    if (existingTurbine._count.contracts > 0) {
      return NextResponse.json(
        { error: "Anlage hat noch aktive Verträge und kann nicht gelöscht werden" },
        { status: 400 }
      );
    }

    // Hard-Delete: Anlage unwiderruflich löschen
    // Zugehörige Service-Events und Dokumente werden durch Cascade-Delete entfernt
    await prisma.turbine.delete({
      where: { id },
    });

    // Log the deletion for audit trail
    await logDeletion("Turbine", id, existingTurbine as Record<string, unknown>);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting turbine");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Anlage" },
      { status: 500 }
    );
  }
}
