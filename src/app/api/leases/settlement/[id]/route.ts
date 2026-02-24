import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { logDeletion } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { updateLeaseRevenueSettlementSchema } from "@/types/billing";
import { z } from "zod";

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

    const settlement = await prisma.leaseRevenueSettlement.findUnique({
      where: { id },
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
      return NextResponse.json(
        { error: "Nutzungsentgelt-Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant check
    if (check.tenantId && settlement.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      settlement: serializePrisma(settlement),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Error fetching lease revenue settlement detail"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
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
    const existing = await prisma.leaseRevenueSettlement.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Nutzungsentgelt-Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Only allow updates when status is OPEN or CALCULATED
    if (existing.status !== "OPEN" && existing.status !== "CALCULATED") {
      return NextResponse.json(
        {
          error: "Änderungen nicht moeglich",
          details: `Nur Abrechnungen im Status 'Offen' oder 'Berechnet' können bearbeitet werden. Aktueller Status: ${existing.status}`,
        },
        { status: 400 }
      );
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
      where: { id },
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error(
      { err: error },
      "Error updating lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
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

    const existing = await prisma.leaseRevenueSettlement.findUnique({
      where: { id },
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
      return NextResponse.json(
        { error: "Nutzungsentgelt-Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Only allow deletion if status is OPEN
    if (existing.status !== "OPEN") {
      return NextResponse.json(
        {
          error: "Löschen nicht moeglich",
          details: `Nur Abrechnungen im Status 'Offen' können gelöscht werden. Aktueller Status: ${existing.status}`,
        },
        { status: 400 }
      );
    }

    // Delete settlement (items cascade via onDelete: Cascade in schema)
    await prisma.leaseRevenueSettlement.delete({ where: { id } });

    // Log deletion for audit trail
    await logDeletion("LeaseRevenueSettlement", id, {
      year: existing.year,
      park: existing.park.name,
      periodType: existing.periodType,
      month: existing.month,
      status: existing.status,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      { err: error },
      "Error deleting lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Löschen der Nutzungsentgelt-Abrechnung" },
      { status: 500 }
    );
  }
}
