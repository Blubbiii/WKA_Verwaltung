import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/scada/mappings/[id] - Einzelne SCADA-Zuordnung
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const mapping = await prisma.scadaTurbineMapping.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
      },
    });

    if (!mapping) {
      return apiError("NOT_FOUND", undefined, { message: "SCADA-Zuordnung nicht gefunden" });
    }

    return NextResponse.json(mapping);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Zuordnung");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der SCADA-Zuordnung" });
  }
}

// =============================================================================
// PATCH /api/energy/scada/mappings/[id] - SCADA-Zuordnung aktualisieren
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Existenz- und Tenant-Prüfung
    const existing = await prisma.scadaTurbineMapping.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "SCADA-Zuordnung nicht gefunden" });
    }

    const body = await request.json();
    const { locationCode, plantNo, parkId, turbineId, description, status } = body;

    // Update-Daten zusammenstellen (nur übergebene Felder)
     

    const updateData: Prisma.ScadaTurbineMappingUncheckedUpdateInput = {};

    if (locationCode !== undefined) {
      if (typeof locationCode !== "string" || !locationCode.startsWith("Loc_")) {
        return apiError("BAD_REQUEST", undefined, { message: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" });
      }
      updateData.locationCode = locationCode;
    }

    if (plantNo !== undefined) {
      if (typeof plantNo !== "number" || !Number.isInteger(plantNo) || plantNo < 1 || plantNo > 10) {
        return apiError("BAD_REQUEST", undefined, { message: "plantNo muss eine ganze Zahl zwischen 1 und 10 sein" });
      }
      updateData.plantNo = plantNo;
    }

    if (parkId !== undefined) {
      if (typeof parkId !== "string") {
        return apiError("BAD_REQUEST", undefined, { message: "parkId muss ein String sein" });
      }
      // Validierung: Park gehoert zum Tenant
      const park = await prisma.park.findFirst({
        where: { id: parkId, tenantId: check.tenantId! },
        select: { id: true },
      });
      if (!park) {
        return apiError("FORBIDDEN", 404, { message: "Park nicht gefunden oder keine Berechtigung" });
      }
      updateData.parkId = parkId;
    }

    if (turbineId !== undefined) {
      if (typeof turbineId !== "string") {
        return apiError("BAD_REQUEST", undefined, { message: "turbineId muss ein String sein" });
      }
      // Validierung: Turbine gehoert zum richtigen Park
      const targetParkId = (parkId as string) || existing.parkId;
      const turbine = await prisma.turbine.findFirst({
        where: {
          id: turbineId,
          parkId: targetParkId,
          park: { tenantId: check.tenantId! },
        },
        select: { id: true },
      });
      if (!turbine) {
        return apiError("NOT_FOUND", undefined, { message: "Turbine nicht gefunden oder gehoert nicht zum angegebenen Park" });
      }
      updateData.turbineId = turbineId;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return apiError("BAD_REQUEST", undefined, { message: "Status muss 'ACTIVE' oder 'INACTIVE' sein" });
      }
      updateData.status = status;
    }

    // Duplikat-Prüfung bei Änderung von locationCode oder plantNo
    if (updateData.locationCode || updateData.plantNo) {
      const checkCode = (updateData.locationCode as string) || existing.locationCode;
      const checkPlantNo = (updateData.plantNo as number) || existing.plantNo;

      const duplicate = await prisma.scadaTurbineMapping.findFirst({
        where: {
          tenantId: check.tenantId!,
          locationCode: checkCode,
          plantNo: checkPlantNo,
          id: { not: id },
        },
      });

      if (duplicate) {
        return apiError("ALREADY_EXISTS", undefined, { message: "Duplikat erkannt", details: `Zuordnung für ${checkCode} / Anlage ${checkPlantNo} existiert bereits` });
      }
    }

    const updated = await prisma.scadaTurbineMapping.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren der SCADA-Zuordnung");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der SCADA-Zuordnung" });
  }
}

// =============================================================================
// DELETE /api/energy/scada/mappings/[id] - SCADA-Zuordnung deaktivieren
// (Soft-Delete: setzt status auf INACTIVE)
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:delete");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Existenz- und Tenant-Prüfung
    const existing = await prisma.scadaTurbineMapping.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "SCADA-Zuordnung nicht gefunden" });
    }

    // Soft-Delete: Status auf INACTIVE setzen
    const deactivated = await prisma.scadaTurbineMapping.update({
      where: { id },
      data: { status: "INACTIVE" },
      include: {
        park: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
      },
    });

    return NextResponse.json({
      message: "SCADA-Zuordnung wurde deaktiviert",
      data: deactivated,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Deaktivieren der SCADA-Zuordnung");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Deaktivieren der SCADA-Zuordnung" });
  }
}
