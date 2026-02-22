import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/mappings - Alle SCADA-Turbine-Zuordnungen
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const locationCode = searchParams.get("locationCode");

    // Where-Clause mit Multi-Tenancy Filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
      tenantId: check.tenantId!,
    };

    // Optionaler Filter nach locationCode
    if (locationCode) {
      where.locationCode = locationCode;
    }

    const mappings = await prisma.scadaTurbineMapping.findMany({
      where,
      include: {
        park: {
          select: {
            id: true,
            name: true,
          },
        },
        turbine: {
          select: {
            id: true,
            designation: true,
            deviceType: true,
          },
        },
      },
      orderBy: [
        { locationCode: "asc" },
        { plantNo: "asc" },
      ],
    });

    return NextResponse.json({ data: mappings });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Zuordnungen");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Zuordnungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/scada/mappings - Neue SCADA-Turbine-Zuordnung erstellen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { locationCode, plantNo, parkId, turbineId, description } = body;

    // --- Validierung ---

    if (!locationCode || typeof locationCode !== "string") {
      return NextResponse.json(
        { error: "locationCode ist erforderlich und muss ein String sein" },
        { status: 400 }
      );
    }

    if (!locationCode.startsWith("Loc_")) {
      return NextResponse.json(
        { error: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" },
        { status: 400 }
      );
    }

    if (plantNo == null || typeof plantNo !== "number" || !Number.isInteger(plantNo) || plantNo < 1 || plantNo > 99) {
      return NextResponse.json(
        { error: "plantNo muss eine ganze Zahl zwischen 1 und 99 sein" },
        { status: 400 }
      );
    }

    if (!parkId || typeof parkId !== "string") {
      return NextResponse.json(
        { error: "parkId ist erforderlich" },
        { status: 400 }
      );
    }

    const deviceType = body.deviceType || "WEA";
    if (!["WEA", "PARKRECHNER", "NVP"].includes(deviceType)) {
      return NextResponse.json(
        { error: "deviceType muss WEA, PARKRECHNER oder NVP sein" },
        { status: 400 }
      );
    }

    // Validierung: Park gehoert zum Tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: { id: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    let resolvedTurbineId = turbineId;

    if (deviceType === "WEA") {
      // WEA: turbineId is required and must exist in the park
      if (!turbineId || typeof turbineId !== "string") {
        return NextResponse.json(
          { error: "turbineId ist erforderlich fuer WEA-Zuordnungen" },
          { status: 400 }
        );
      }

      const turbine = await prisma.turbine.findFirst({
        where: {
          id: turbineId,
          parkId: parkId,
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
    } else {
      // PARKRECHNER or NVP: auto-create or reuse a virtual turbine entry
      const designationLabel = deviceType === "PARKRECHNER" ? "Parkrechner" : "Netzverknuepfungspunkt";

      let virtualTurbine = await prisma.turbine.findFirst({
        where: {
          parkId,
          deviceType,
          park: { tenantId: check.tenantId! },
        },
        select: { id: true },
      });

      if (!virtualTurbine) {
        virtualTurbine = await prisma.turbine.create({
          data: {
            designation: designationLabel,
            deviceType,
            parkId,
            status: "ACTIVE",
            technicalData: {},
          },
          select: { id: true },
        });
      }

      resolvedTurbineId = virtualTurbine.id;
    }

    // Duplikat-Pruefung (unique constraint: tenantId + locationCode + plantNo)
    const existing = await prisma.scadaTurbineMapping.findUnique({
      where: {
        tenantId_locationCode_plantNo: {
          tenantId: check.tenantId!,
          locationCode,
          plantNo,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Zuordnung fuer ${locationCode} / Anlage ${plantNo} existiert bereits`,
        },
        { status: 409 }
      );
    }

    // Zuordnung erstellen
    const mapping = await prisma.scadaTurbineMapping.create({
      data: {
        locationCode,
        plantNo,
        parkId,
        turbineId: resolvedTurbineId,
        description: description || null,
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

    return NextResponse.json(mapping, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Erstellen der SCADA-Zuordnung");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der SCADA-Zuordnung" },
      { status: 500 }
    );
  }
}
