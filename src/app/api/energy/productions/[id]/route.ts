import { NextRequest, NextResponse, after } from "next/server";
import { productionUpdateSchema } from "@/lib/energy/production-schemas";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { requirePermission } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import { logDeletion } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { ProductionDataSource, ProductionStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für Aktualisierung von Produktionsdaten
 * Alle Felder sind optional - nur mitgeschickte Felder werden aktualisiert
 */

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
    const db = mandantDb(check.tenantId!);

    const { id } = await params;

    // Produktionsdaten mit allen Relationen laden
    const production = await db.turbineProduction.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        revenueType: { select: { id: true, name: true, code: true } },
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
      return apiError("NOT_FOUND", undefined, { message: "Produktionsdaten nicht gefunden" });
    }

    return NextResponse.json(production);
  } catch (error) {
    logger.error({ err: error }, "Error fetching production");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Produktionsdaten" });
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
    const db = mandantDb(check.tenantId!);

    const { id } = await params;
    const body = await request.json();
    const validatedData = productionUpdateSchema.parse(body);

    // A revenue type of another tenant must not be linkable.
    if (validatedData.revenueTypeId) {
      const art = await db.energyRevenueType.findFirst({
        where: { id: validatedData.revenueTypeId, tenantId: check.tenantId! },
        select: { id: true },
      });
      if (!art) return apiError("VALIDATION_FAILED", 400, { message: "Unbekannte Erlösart" });
    }


    // Existenz und Tenant prüfen
    const existing = await db.turbineProduction.findFirst({
      where: { id, tenantId: check.tenantId! },
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
      return apiError("NOT_FOUND", undefined, { message: "Produktionsdaten nicht gefunden" });
    }

    // Status-Prüfung: INVOICED-Einträge können nicht bearbeitet werden
    if (existing.status === "INVOICED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Bereits abgerechnete Produktionsdaten können nicht bearbeitet werden", details: "Status ist INVOICED - bitte zuerst die zugehoerige Rechnung stornieren" });
    }

    // Update durchfuehren
    const production = await db.turbineProduction.update({
      where: { id, tenantId: check.tenantId! },
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
        ...(validatedData.revenueEur !== undefined && {
          revenueEur: validatedData.revenueEur,
        }),
        ...(validatedData.revenueTypeId !== undefined && {
          revenueTypeId: validatedData.revenueTypeId,
        }),
      },
      include: {
        revenueType: { select: { id: true, name: true, code: true } },
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
    return handleApiError(error, "Fehler beim Aktualisieren der Produktionsdaten");
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
    const db = mandantDb(check.tenantId!);

    // Zusätzliche Prüfung: Nur MANAGER, ADMIN oder SUPERADMIN duerfen löschen
    const hierarchy = await getUserHighestHierarchy(check.userId!);
    if (hierarchy < 60) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung zum Löschen von Produktionsdaten" });
    }

    const { id } = await params;

    // Existenz und Tenant prüfen
    const existing = await db.turbineProduction.findFirst({
      where: { id, tenantId: check.tenantId! },
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
      return apiError("NOT_FOUND", undefined, { message: "Produktionsdaten nicht gefunden" });
    }

    // Status-Prüfung: INVOICED-Einträge können nicht gelöscht werden
    if (existing.status === "INVOICED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Bereits abgerechnete Produktionsdaten können nicht gelöscht werden", details: "Status ist INVOICED - bitte zuerst die zugehoerige Rechnung stornieren" });
    }

    // Löschen
    await db.turbineProduction.delete({ where: { id, tenantId: check.tenantId! } });

    // Audit Log (deferred: runs after response is sent)
    const productionDeletionData = {
      turbine: existing.turbine.designation,
      period: `${existing.month}/${existing.year}`,
      productionKwh: existing.productionKwh.toString(),
    };
    after(async () => {
      await logDeletion("TurbineProduction", id, productionDeletionData);
    });

    return NextResponse.json({
      success: true,
      message: `Produktionsdaten für ${existing.turbine.designation} (${existing.month}/${existing.year}) gelöscht`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting production");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Produktionsdaten" });
  }
}
