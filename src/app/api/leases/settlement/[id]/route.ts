import { NextRequest, NextResponse, after } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { logDeletion } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { updateLeaseRevenueSettlementSchema } from "@/types/billing";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/leases/settlement/[id] - Settlement detail with items + allocations
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const settlement = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
            leaseSettlementMode: true,
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            lessorPerson: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
            lease: {
              select: {
                id: true,
                startDate: true,
                endDate: true,
              },
            },
            directBillingFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
              },
            },
            advanceInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
                sentAt: true,
                printedAt: true,
                emailedAt: true,
                emailedTo: true,
              },
            },
            settlementInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
                sentAt: true,
                printedAt: true,
                emailedAt: true,
                emailedTo: true,
              },
            },
          },
          orderBy: { lessorPerson: { lastName: "asc" } },
        },
        costAllocations: {
          include: {
            items: {
              include: {
                operatorFund: {
                  select: {
                    id: true,
                    name: true,
                    legalForm: true,
                  },
                },
                vatInvoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                  },
                },
                exemptInvoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", undefined, { message: "Nutzungsentgelt-Abrechnung nicht gefunden" });
    }

    return NextResponse.json({
      settlement: serializePrisma(settlement),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Error fetching lease revenue settlement detail"
    );
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Nutzungsentgelt-Abrechnung" });
  }
}

// =============================================================================
// PUT /api/leases/settlement/[id] - Update settlement (dates, notes, linked energy)
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateLeaseRevenueSettlementSchema.parse(body);

    // Check settlement exists and belongs to tenant
    const existing = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        tenantId: true,
        status: true,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nutzungsentgelt-Abrechnung nicht gefunden" });
    }

    // Only allow updates when status is OPEN or CALCULATED
    if (existing.status !== "OPEN" && existing.status !== "CALCULATED") {
      return apiError("BAD_REQUEST", undefined, { message: "Änderungen nicht moeglich", details: `Nur Abrechnungen im Status 'Offen' oder 'Berechnet' können bearbeitet werden. Aktueller Status: ${existing.status}` });
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (validatedData.advanceDueDate !== undefined) {
      updateData.advanceDueDate = validatedData.advanceDueDate
        ? new Date(validatedData.advanceDueDate)
        : null;
    }
    if (validatedData.settlementDueDate !== undefined) {
      updateData.settlementDueDate = validatedData.settlementDueDate
        ? new Date(validatedData.settlementDueDate)
        : null;
    }
    if (validatedData.linkedEnergySettlementId !== undefined) {
      updateData.linkedEnergySettlementId =
        validatedData.linkedEnergySettlementId ?? null;
    }
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes;
    }

    const settlement = await prisma.leaseRevenueSettlement.update({
      where: { id, tenantId: check.tenantId! },
      data: updateData,
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });

    return NextResponse.json({
      settlement: serializePrisma(settlement),
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Nutzungsentgelt-Abrechnung");
  }
}

// =============================================================================
// DELETE /api/leases/settlement/[id] - Delete settlement (only if OPEN)
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_DELETE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.leaseRevenueSettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        tenantId: true,
        status: true,
        year: true,
        periodType: true,
        month: true,
        park: { select: { name: true } },
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nutzungsentgelt-Abrechnung nicht gefunden" });
    }

    // Only allow deletion if status is OPEN
    if (existing.status !== "OPEN") {
      return apiError("BAD_REQUEST", undefined, { message: "Löschen nicht moeglich", details: `Nur Abrechnungen im Status 'Offen' können gelöscht werden. Aktueller Status: ${existing.status}` });
    }

    // Delete settlement (items cascade via onDelete: Cascade in schema)
    await prisma.leaseRevenueSettlement.delete({ where: { id, tenantId: check.tenantId! } });

    // Log deletion for audit trail (deferred: runs after response is sent)
    const leaseSettlementDeletionData = {
      year: existing.year,
      park: existing.park.name,
      periodType: existing.periodType,
      month: existing.month,
      status: existing.status,
    };
    after(async () => {
      await logDeletion("LeaseRevenueSettlement", id, leaseSettlementDeletionData);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      { err: error },
      "Error deleting lease revenue settlement"
    );
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Nutzungsentgelt-Abrechnung" });
  }
}
