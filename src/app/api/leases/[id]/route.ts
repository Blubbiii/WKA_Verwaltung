import { NextRequest, NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { updateWithAudit, isEntityNotFoundError } from "@/lib/audit-update";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const leaseUpdateSchema = z.object({
  plotIds: z.array(z.uuid()).optional(),
  lessorId: z.uuid().optional(),
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
  // Abrechnungsintervall
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]).optional(),
  linkedTurbineId: z.uuid().nullable().optional(),
  // Vertragspartner (Paechter-Gesellschaft)
  contractPartnerFundId: z.uuid().nullable().optional(),
  // Stichtag für Gutschriften (Tag im Monat, überschreibt Park-Default)
  paymentDay: z.number().int().min(1).max(28).nullable().optional(),
  // Anhänge & Notizen
  contractDocumentUrl: z.url().nullable().optional(),
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
        // F4-Compliance: Soft-deleted Pachtverträge werden nicht mehr als aktive
        // Datensätze exponiert. Aufbewahrungspflicht bleibt via deletedAt-Filter.
        deletedAt: null,
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
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    // Transform to include plots array
    const transformedLease = {
      ...lease,
      plots: lease.leasePlots.map((lp) => lp.plot),
    };

    return NextResponse.json(transformedLease);
  } catch (error) {
    logger.error({ err: error }, "Error fetching lease");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Pachtvertrags" });
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
        // F4: kein PATCH auf soft-deleted Pachtverträge
        deletedAt: null,
      },
    });

    if (!existingLease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
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

    // F4-Compliance: PATCH auf Lease schreibt jetzt Audit-Log inkl. Diff über
    // updateWithAudit(). Kritische Felder wie waitingMoneyAmount, billingInterval
    // oder contractPartnerFundId sind damit vollständig rückverfolgbar (GoBD).
    const headersList = await headers();
    const ipAddress =
      headersList.get("x-forwarded-for")?.split(",")[0] ??
      headersList.get("x-real-ip") ??
      null;
    const userAgent = headersList.get("user-agent") ?? null;

    try {
      await updateWithAudit({
        entityType: "Lease",
        entityId: id,
        userId: check.userId,
        tenantId: check.tenantId!,
        ipAddress,
        userAgent,
        description: "Pachtvertrag bearbeitet",
        loadCurrent: (tx) =>
          tx.lease.findFirst({
            where: { id, tenantId: check.tenantId! },
          }) as Promise<Record<string, unknown> | null>,
        applyChange: async (tx) => {
          await tx.lease.update({
            where: { id, tenantId: check.tenantId! },
            data: updateData,
          });

          // Update plots if provided (Plot-Änderungen laufen in derselben TX;
          // Änderungen an LeasePlot-Rows selbst schreiben KEIN Audit — die
          // ausschlaggebende Änderung ist die Lease selbst).
          if (plotIds) {
            const plots = await tx.plot.findMany({
              where: {
                id: { in: plotIds },
                tenantId: check.tenantId,
              },
            });

            if (plots.length !== plotIds.length) {
              throw new Error("Ein oder mehrere Flurstücke nicht gefunden");
            }

            const currentRelations = await tx.leasePlot.findMany({
              where: { leaseId: id },
              select: { id: true, plotId: true },
            });
            const currentPlotIds = new Set(currentRelations.map((r) => r.plotId));
            const nextPlotIds = new Set(plotIds);

            const toRemove = currentRelations.filter((r) => !nextPlotIds.has(r.plotId));
            const toAdd = plotIds.filter((pid) => !currentPlotIds.has(pid));

            if (toRemove.length > 0) {
              await tx.leasePlot.deleteMany({
                where: { id: { in: toRemove.map((r) => r.id) } },
              });
            }
            if (toAdd.length > 0) {
              await tx.leasePlot.createMany({
                data: toAdd.map((plotId) => ({ leaseId: id, plotId })),
              });
            }
          }

          // Rückgabe: für Diff nur die Lease-Row (relations werden nicht in
          // Audit-Diff eingerechnet — sonst wird der oldValues-Blob riesig).
          return (await tx.lease.findUniqueOrThrow({
            where: { id },
          })) as unknown as Record<string, unknown>;
        },
      });
    } catch (err) {
      if (isEntityNotFoundError(err)) {
        return apiError("NOT_FOUND", 404, { message: "Pachtvertrag nicht gefunden" });
      }
      throw err;
    }

    // Response: aktuellen Zustand inkl. Relations laden (nach dem TX).
    const lease = await prisma.lease.findUnique({
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

    // Transform response
    const transformedLease = {
      ...lease,
      plots: lease?.leasePlots.map((lp) => lp.plot) || [],
    };

    return NextResponse.json(transformedLease);
  } catch (error) {
    if (error instanceof Error && !(error instanceof z.ZodError)) {
      return apiError("BAD_REQUEST", undefined, { message: error.message });
    }
    return handleApiError(error, "Fehler beim Aktualisieren des Pachtvertrags");
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
        // F4: bereits soft-deleted → 404, keine Doppel-Löschung
        deletedAt: null,
      },
    });

    if (!leaseToDelete) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    // F4-Compliance: Soft-Delete statt Hard-Delete. Pachtverträge unterliegen
    // §147 AO Aufbewahrungspflicht — Datensatz bleibt in der DB, wird aber aus
    // aktiven Views durch deletedAt-Filter ausgeblendet.
    await prisma.lease.update({
      where: { id, tenantId: check.tenantId! },
      data: { deletedAt: new Date() },
    });

    // Log the deletion (deferred: runs after response is sent)
    const leaseSnapshot = leaseToDelete as Record<string, unknown>;
    after(async () => {
      await logDeletion("Lease", id, leaseSnapshot);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting lease");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Pachtvertrags" });
  }
}
