import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { DistributionMode } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für Stromabrechnung-Updates
 * Alle Felder optional, da nur geänderte Werte übergeben werden
 */
const settlementUpdateSchema = z.object({
  netOperatorRevenueEur: z.number().nonnegative("Erlös muss >= 0 sein").optional(),
  netOperatorReference: z.string().max(100).optional().nullable(),
  totalProductionKwh: z.number().nonnegative("Produktion muss >= 0 sein").optional(),
  eegProductionKwh: z.number().nonnegative().optional().nullable(),
  eegRevenueEur: z.number().nonnegative().optional().nullable(),
  dvProductionKwh: z.number().nonnegative().optional().nullable(),
  dvRevenueEur: z.number().nonnegative().optional().nullable(),
  distributionMode: z.enum(["PROPORTIONAL", "SMOOTHED", "TOLERATED"]).optional(),
  smoothingFactor: z.number().min(0).max(1).optional().nullable(),
  tolerancePercentage: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// =============================================================================
// GET /api/energy/settlements/[id] - Einzelne Stromabrechnung mit Details
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const settlement = await prisma.energySettlement.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
            totalCapacityKw: true,
          },
        },
        items: {
          include: {
            recipientFund: {
              select: {
                id: true,
                name: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
                legalForm: true,
                address: true,
                bankDetails: true,
              },
            },
            turbine: {
              select: {
                id: true,
                designation: true,
                ratedPowerKw: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                status: true,
                grossAmount: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Stromabrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant-Check
    if (settlement.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(settlement);
  } catch (error) {
    logger.error({ err: error }, "Error fetching settlement");
    return NextResponse.json(
      { error: "Fehler beim Laden der Stromabrechnung" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/energy/settlements/[id] - Stromabrechnung aktualisieren
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = settlementUpdateSchema.parse(body);

    // Pruefe ob Settlement existiert und zum Tenant gehoert
    const existing = await prisma.energySettlement.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        netOperatorRevenueEur: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Stromabrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Nur DRAFT-Status ist bearbeitbar
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        {
          error: "Nur Entwuerfe können bearbeitet werden",
          details: `Aktuelle Status: ${existing.status}. Setze Status zurück auf DRAFT um zu bearbeiten.`,
        },
        { status: 400 }
      );
    }

    // Baue Update-Daten
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const updateData: any = {};

    // Änderung von netOperatorRevenueEur setzt Status zurück auf DRAFT
    // (redundant da wir schon DRAFT prüfen, aber für zukuenftige Erweiterungen)
    if (validatedData.netOperatorRevenueEur !== undefined) {
      updateData.netOperatorRevenueEur = validatedData.netOperatorRevenueEur;
      // Bei Änderung des Erlös-Betrags muss neu berechnet werden
      updateData.status = "DRAFT";
      updateData.calculationDetails = null; // Reset calculation
    }

    if (validatedData.netOperatorReference !== undefined) {
      updateData.netOperatorReference = validatedData.netOperatorReference;
    }

    if (validatedData.totalProductionKwh !== undefined) {
      updateData.totalProductionKwh = validatedData.totalProductionKwh;
      // Bei Änderung der Produktion muss neu berechnet werden
      updateData.status = "DRAFT";
      updateData.calculationDetails = null;
    }

    if (validatedData.eegProductionKwh !== undefined) {
      updateData.eegProductionKwh = validatedData.eegProductionKwh;
    }
    if (validatedData.eegRevenueEur !== undefined) {
      updateData.eegRevenueEur = validatedData.eegRevenueEur;
    }
    if (validatedData.dvProductionKwh !== undefined) {
      updateData.dvProductionKwh = validatedData.dvProductionKwh;
    }
    if (validatedData.dvRevenueEur !== undefined) {
      updateData.dvRevenueEur = validatedData.dvRevenueEur;
    }

    if (validatedData.distributionMode !== undefined) {
      updateData.distributionMode = validatedData.distributionMode as DistributionMode;
      // Bei Änderung des Verteilmodus muss neu berechnet werden
      updateData.status = "DRAFT";
      updateData.calculationDetails = null;
    }

    if (validatedData.smoothingFactor !== undefined) {
      updateData.smoothingFactor = validatedData.smoothingFactor;
    }

    if (validatedData.tolerancePercentage !== undefined) {
      updateData.tolerancePercentage = validatedData.tolerancePercentage;
    }

    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes;
    }

    // Update durchfuehren
    const settlement = await prisma.energySettlement.update({
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
        items: {
          include: {
            recipientFund: {
              select: {
                id: true,
                name: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
              },
            },
            turbine: {
              select: {
                id: true,
                designation: true,
              },
            },
          },
        },
      },
    });

    // Invalidate dashboard caches after settlement update
    invalidate.onEnergySettlementChange(
      check.tenantId!, id, 'update', settlement.park?.id
    ).catch((err) => {
      logger.warn({ err }, '[Settlements] Cache invalidation error after update');
    });

    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating settlement");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Stromabrechnung" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/energy/settlements/[id] - Stromabrechnung löschen
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:delete");
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur ADMIN oder SUPERADMIN duerfen löschen
    const session = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { role: true },
    });

    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json(
        { error: "Nur Administratoren duerfen Stromabrechnungen löschen" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await prisma.energySettlement.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        year: true,
        month: true,
        park: { select: { name: true } },
        items: {
          select: {
            invoiceId: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Stromabrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Pruefe ob bereits Gutschriften erstellt wurden
    const hasInvoices = existing.items.some((item) => item.invoiceId !== null);
    if (hasInvoices) {
      return NextResponse.json(
        {
          error: "Löschen nicht moeglich",
          details: "Es wurden bereits Gutschriften aus dieser Abrechnung erstellt. Bitte zuerst die Gutschriften stornieren.",
        },
        { status: 400 }
      );
    }

    // Hard-delete: Abrechnung und zugehoerige Items löschen (CASCADE)
    await prisma.energySettlement.delete({ where: { id } });

    // Log deletion for audit trail
    await logDeletion("EnergySettlement", id, {
      year: existing.year,
      month: existing.month,
      park: existing.park.name,
      status: existing.status,
    });

    // Invalidate dashboard caches after settlement deletion
    invalidate.onEnergySettlementChange(check.tenantId!, id, 'delete').catch((err) => {
      logger.warn({ err }, '[Settlements] Cache invalidation error after delete');
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting settlement");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Stromabrechnung" },
      { status: 500 }
    );
  }
}
