import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updatePeriodSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "APPROVED", "CLOSED", "CANCELLED"]).optional(),
  periodType: z.enum(["ADVANCE", "FINAL"]).optional(),
  advanceInvoiceDate: z.string().datetime().optional().nullable(),
  settlementDate: z.string().datetime().optional().nullable(),
  totalRevenue: z.number().optional().nullable(),
  totalMinimumRent: z.number().optional().nullable(),
  totalActualRent: z.number().optional().nullable(),
  linkedEnergySettlementId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Valid status transitions for the settlement approval workflow
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PENDING_REVIEW", "OPEN", "CANCELLED"],
  PENDING_REVIEW: ["APPROVED", "IN_PROGRESS", "CANCELLED"],
  APPROVED: ["CLOSED"],
  CLOSED: [], // Terminal state - no transitions allowed
  CANCELLED: [], // Terminal state - create a new period instead
};

// GET /api/admin/settlement-periods/[id] - Einzelne Periode
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            minimumRentPerTurbine: true,
            turbines: {
              select: { id: true, designation: true, status: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceType: true,
            status: true,
            grossAmount: true,
            invoiceDate: true,
            recipientName: true,
          },
          orderBy: { invoiceDate: "desc" },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(period);
  } catch (error) {
    logger.error({ err: error }, "Error fetching settlement period");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abrechnungsperiode" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/settlement-periods/[id] - Periode aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = updatePeriodSchema.parse(body);

    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Validate status transitions using the approval workflow
    if (data.status && data.status !== period.status) {
      const allowedTransitions = VALID_STATUS_TRANSITIONS[period.status] || [];
      if (!allowedTransitions.includes(data.status)) {
        return NextResponse.json(
          {
            error: `Ungültiger Statusübergang: ${period.status} -> ${data.status}. Erlaubte Übergaenge: ${allowedTransitions.join(", ") || "keine"}`,
          },
          { status: 400 }
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.periodType !== undefined) updateData.periodType = data.periodType;
    if (data.advanceInvoiceDate !== undefined) {
      updateData.advanceInvoiceDate = data.advanceInvoiceDate
        ? new Date(data.advanceInvoiceDate)
        : null;
    }
    if (data.settlementDate !== undefined) {
      updateData.settlementDate = data.settlementDate
        ? new Date(data.settlementDate)
        : null;
    }
    if (data.totalRevenue !== undefined) updateData.totalRevenue = data.totalRevenue;
    if (data.totalMinimumRent !== undefined) updateData.totalMinimumRent = data.totalMinimumRent;
    if (data.totalActualRent !== undefined) updateData.totalActualRent = data.totalActualRent;
    if (data.linkedEnergySettlementId !== undefined) {
      updateData.linkedEnergySettlementId = data.linkedEnergySettlementId;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;

    // When submitting for review (PENDING_REVIEW), clear any previous review data
    if (data.status === "PENDING_REVIEW") {
      updateData.reviewedById = null;
      updateData.reviewedAt = null;
      updateData.reviewNotes = null;
    }

    const updated = await prisma.leaseSettlementPeriod.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: { id: true, name: true },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating settlement period");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Abrechnungsperiode" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/settlement-periods/[id] - Periode löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Abrechnungsperiode nicht gefunden" },
        { status: 404 }
      );
    }

    if (period.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (period.status !== "OPEN") {
      return NextResponse.json(
        { error: "Nur offene Perioden können gelöscht werden" },
        { status: 400 }
      );
    }

    await prisma.leaseSettlementPeriod.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Abrechnungsperiode gelöscht" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting settlement period");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Abrechnungsperiode" },
      { status: 500 }
    );
  }
}
