import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const leaseUpdateSchema = z.object({
  plotIds: z.array(z.string().uuid()).optional(),
  lessorId: z.string().uuid().optional(),
  signedDate: z.string().nullable().optional(), // Vertragsabschluss (Unterschrift)
  startDate: z.string().optional(), // Vertragsbeginn (Baubeginn)
  endDate: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"]).optional(),
  // Verlängerungsoption
  hasExtensionOption: z.boolean().optional(),
  extensionDetails: z.string().nullable().optional(),
  // Wartegeld
  hasWaitingMoney: z.boolean().optional(),
  waitingMoneyAmount: z.number().nullable().optional(),
  waitingMoneyUnit: z.enum(["pauschal", "ha"]).nullable().optional(),
  waitingMoneySchedule: z.enum(["monthly", "yearly", "once"]).nullable().optional(),
  // Nutzungsarten
  usageTypes: z.array(z.string()).optional(),
  usageTypesWithSize: z.array(z.object({
    id: z.string(),
    sizeSqm: z.string(),
  })).optional(),
  // Abrechnungsintervall
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]).optional(),
  linkedTurbineId: z.string().uuid().nullable().optional(),
  // Vertragspartner (Paechter-Gesellschaft)
  contractPartnerFundId: z.string().uuid().nullable().optional(),
  // Stichtag fuer Gutschriften (Tag im Monat, ueberschreibt Park-Default)
  paymentDay: z.number().int().min(1).max(28).nullable().optional(),
  // Anhänge & Notizen
  contractDocumentUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/leases/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const lease = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                    city: true,
                  },
                },
                plotAreas: true,
              },
            },
          },
        },
        lessor: true,
        contractPartnerFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json(
        { error: "Pachtvertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Transform to include plots array
    const transformedLease = {
      ...lease,
      plots: lease.leasePlots.map((lp) => lp.plot),
    };

    return NextResponse.json(transformedLease);
  } catch (error) {
    logger.error({ err: error }, "Error fetching lease");
    return NextResponse.json(
      { error: "Fehler beim Laden des Pachtvertrags" },
      { status: 500 }
    );
  }
}

// PATCH /api/leases/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify lease exists and belongs to tenant
    const existingLease = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingLease) {
      return NextResponse.json(
        { error: "Pachtvertrag nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = leaseUpdateSchema.parse(body);

    // Extract plotIds for separate handling
    const { plotIds, ...leaseData } = validatedData;

    // Convert dates if provided
    const updateData: Record<string, unknown> = { ...leaseData };
    if (leaseData.signedDate !== undefined) {
      updateData.signedDate = leaseData.signedDate ? new Date(leaseData.signedDate) : null;
    }
    if (leaseData.startDate) {
      updateData.startDate = new Date(leaseData.startDate);
    }
    if (leaseData.endDate !== undefined) {
      updateData.endDate = leaseData.endDate ? new Date(leaseData.endDate) : null;
    }

    // Update in transaction if plots are being updated
    const lease = await prisma.$transaction(async (tx) => {
      // Update lease data
      await tx.lease.update({
        where: { id },
        data: updateData,
      });

      // Update plots if provided
      if (plotIds) {
        // Verify all plots belong to tenant
        const plots = await tx.plot.findMany({
          where: {
            id: { in: plotIds },
            tenantId: check.tenantId,
          },
        });

        if (plots.length !== plotIds.length) {
          throw new Error("Ein oder mehrere Flurstücke nicht gefunden");
        }

        // Delete existing plot relations
        await tx.leasePlot.deleteMany({
          where: { leaseId: id },
        });

        // Create new plot relations
        await tx.leasePlot.createMany({
          data: plotIds.map((plotId) => ({
            leaseId: id,
            plotId,
          })),
        });
      }

      // Return updated lease with relations
      return tx.lease.findUnique({
        where: { id },
        include: {
          leasePlots: {
            include: {
              plot: {
                include: {
                  park: {
                    select: {
                      id: true,
                      name: true,
                      shortName: true,
                    },
                  },
                },
              },
            },
          },
          lessor: true,
          contractPartnerFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
            },
          },
        },
      });
    });

    // Transform response
    const transformedLease = {
      ...lease,
      plots: lease?.leasePlots.map((lp) => lp.plot) || [],
    };

    return NextResponse.json(transformedLease);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating lease");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Pachtvertrags" },
      { status: 500 }
    );
  }
}

// DELETE /api/leases/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Before delete, get the full data for audit log
    const leaseToDelete = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!leaseToDelete) {
      return NextResponse.json(
        { error: "Pachtvertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Perform the deletion
    await prisma.lease.delete({
      where: { id },
    });

    // Log the deletion
    await logDeletion("Lease", id, leaseToDelete as Record<string, unknown>);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting lease");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Pachtvertrags" },
      { status: 500 }
    );
  }
}
