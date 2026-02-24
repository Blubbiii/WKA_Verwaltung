import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "SCADA-Zuordnung nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(mapping);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Zuordnung");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Zuordnung" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "SCADA-Zuordnung nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { locationCode, plantNo, parkId, turbineId, description, status } = body;

    // Update-Daten zusammenstellen (nur übergebene Felder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const updateData: any = {};

    if (locationCode !== undefined) {
      if (typeof locationCode !== "string" || !locationCode.startsWith("Loc_")) {
        return NextResponse.json(
          { error: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" },
          { status: 400 }
        );
      }
      updateData.locationCode = locationCode;
    }

    if (plantNo !== undefined) {
      if (typeof plantNo !== "number" || !Number.isInteger(plantNo) || plantNo < 1 || plantNo > 10) {
        return NextResponse.json(
          { error: "plantNo muss eine ganze Zahl zwischen 1 und 10 sein" },
          { status: 400 }
        );
      }
      updateData.plantNo = plantNo;
    }

    if (parkId !== undefined) {
      if (typeof parkId !== "string") {
        return NextResponse.json(
          { error: "parkId muss ein String sein" },
          { status: 400 }
        );
      }
      // Validierung: Park gehoert zum Tenant
      const park = await prisma.park.findFirst({
        where: { id: parkId, tenantId: check.tenantId! },
        select: { id: true },
      });
      if (!park) {
        return NextResponse.json(
          { error: "Park nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }
      updateData.parkId = parkId;
    }

    if (turbineId !== undefined) {
      if (typeof turbineId !== "string") {
        return NextResponse.json(
          { error: "turbineId muss ein String sein" },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: "Turbine nicht gefunden oder gehoert nicht zum angegebenen Park" },
          { status: 404 }
        );
      }
      updateData.turbineId = turbineId;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return NextResponse.json(
          { error: "Status muss 'ACTIVE' oder 'INACTIVE' sein" },
          { status: 400 }
        );
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
        return NextResponse.json(
          {
            error: "Duplikat erkannt",
            details: `Zuordnung für ${checkCode} / Anlage ${checkPlantNo} existiert bereits`,
          },
          { status: 409 }
        );
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der SCADA-Zuordnung" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "SCADA-Zuordnung nicht gefunden" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Deaktivieren der SCADA-Zuordnung" },
      { status: 500 }
    );
  }
}
