import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { ProductionDataSource, ProductionStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für Aktualisierung von Produktionsdaten
 * Alle Felder sind optional - nur mitgeschickte Felder werden aktualisiert
 */
const productionUpdateSchema = z.object({
  productionKwh: z.number().nonnegative("Produktion muss >= 0 sein").optional(),
  operatingHours: z.number().nonnegative("Betriebsstunden muessen >= 0 sein").optional().nullable(),
  availabilityPct: z.number().min(0).max(100, "Verfügbarkeit muss zwischen 0 und 100 liegen").optional().nullable(),
  source: z.enum(["MANUAL", "CSV_IMPORT", "EXCEL_IMPORT", "SCADA"]).optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "INVOICED"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
  // Jahr/Monat/Turbine sind NICHT aenderbar (unique constraint)
});

// =============================================================================
// GET /api/energy/productions/[id] - Einzelne Produktionsdaten abrufen
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Produktionsdaten mit allen Relationen laden
    const production = await prisma.turbineProduction.findUnique({
      where: { id },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            serialNumber: true,
            manufacturer: true,
            model: true,
            ratedPowerKw: true,
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
    });

    if (!production) {
      return NextResponse.json(
        { error: "Produktionsdaten nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung
    if (production.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(production);
  } catch (error) {
    logger.error({ err: error }, "Error fetching production");
    return NextResponse.json(
      { error: "Fehler beim Laden der Produktionsdaten" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/energy/productions/[id] - Produktionsdaten aktualisieren
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
    const validatedData = productionUpdateSchema.parse(body);

    // Existenz und Tenant prüfen
    const existing = await prisma.turbineProduction.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        turbine: {
          select: { designation: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Produktionsdaten nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Status-Prüfung: INVOICED-Einträge können nicht bearbeitet werden
    if (existing.status === "INVOICED") {
      return NextResponse.json(
        {
          error: "Bereits abgerechnete Produktionsdaten können nicht bearbeitet werden",
          details: "Status ist INVOICED - bitte zuerst die zugehoerige Rechnung stornieren"
        },
        { status: 400 }
      );
    }

    // Update durchfuehren
    const production = await prisma.turbineProduction.update({
      where: { id },
      data: {
        ...(validatedData.productionKwh !== undefined && {
          productionKwh: validatedData.productionKwh,
        }),
        ...(validatedData.operatingHours !== undefined && {
          operatingHours: validatedData.operatingHours,
        }),
        ...(validatedData.availabilityPct !== undefined && {
          availabilityPct: validatedData.availabilityPct,
        }),
        ...(validatedData.source !== undefined && {
          source: validatedData.source as ProductionDataSource,
        }),
        ...(validatedData.status !== undefined && {
          status: validatedData.status as ProductionStatus,
        }),
        ...(validatedData.notes !== undefined && {
          notes: validatedData.notes,
        }),
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            park: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return NextResponse.json(production);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating production");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Produktionsdaten" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/energy/productions/[id] - Produktionsdaten löschen
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:delete");
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur MANAGER, ADMIN oder SUPERADMIN duerfen löschen
    const user = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { role: true },
    });

    if (!user || !["MANAGER", "ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Löschen von Produktionsdaten" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Existenz und Tenant prüfen
    const existing = await prisma.turbineProduction.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        year: true,
        month: true,
        productionKwh: true,
        turbine: {
          select: { designation: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Produktionsdaten nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Status-Prüfung: INVOICED-Einträge können nicht gelöscht werden
    if (existing.status === "INVOICED") {
      return NextResponse.json(
        {
          error: "Bereits abgerechnete Produktionsdaten können nicht gelöscht werden",
          details: "Status ist INVOICED - bitte zuerst die zugehoerige Rechnung stornieren"
        },
        { status: 400 }
      );
    }

    // Löschen
    await prisma.turbineProduction.delete({ where: { id } });

    // Audit Log
    await logDeletion("TurbineProduction", id, {
      turbine: existing.turbine.designation,
      period: `${existing.month}/${existing.year}`,
      productionKwh: existing.productionKwh.toString(),
    });

    return NextResponse.json({
      success: true,
      message: `Produktionsdaten für ${existing.turbine.designation} (${existing.month}/${existing.year}) gelöscht`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting production");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Produktionsdaten" },
      { status: 500 }
    );
  }
}
