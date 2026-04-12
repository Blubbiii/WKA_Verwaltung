import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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
    const where: Prisma.ScadaTurbineMappingWhereInput = {
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der SCADA-Zuordnungen" });
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
      return apiError("MISSING_FIELD", undefined, { message: "locationCode ist erforderlich und muss ein String sein" });
    }

    if (!locationCode.startsWith("Loc_")) {
      return apiError("BAD_REQUEST", undefined, { message: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" });
    }

    if (plantNo == null || typeof plantNo !== "number" || !Number.isInteger(plantNo) || plantNo < 1 || plantNo > 99) {
      return apiError("BAD_REQUEST", undefined, { message: "plantNo muss eine ganze Zahl zwischen 1 und 99 sein" });
    }

    if (!parkId || typeof parkId !== "string") {
      return apiError("MISSING_FIELD", undefined, { message: "parkId ist erforderlich" });
    }

    const deviceType = body.deviceType || "WEA";
    if (!["WEA", "PARKRECHNER", "NVP"].includes(deviceType)) {
      return apiError("BAD_REQUEST", undefined, { message: "deviceType muss WEA, PARKRECHNER oder NVP sein" });
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
      return apiError("FORBIDDEN", 404, { message: "Park nicht gefunden oder keine Berechtigung" });
    }

    let resolvedTurbineId = turbineId;

    if (deviceType === "WEA") {
      // WEA: turbineId is required and must exist in the park
      if (!turbineId || typeof turbineId !== "string") {
        return apiError("MISSING_FIELD", undefined, { message: "turbineId ist erforderlich für WEA-Zuordnungen" });
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
        return apiError("NOT_FOUND", undefined, { message: "Turbine nicht gefunden oder gehoert nicht zum angegebenen Park" });
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

    // Duplikat-Prüfung (unique constraint: tenantId + locationCode + plantNo)
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
      return apiError("ALREADY_EXISTS", undefined, { message: "Duplikat erkannt", details: `Zuordnung für ${locationCode} / Anlage ${plantNo} existiert bereits` });
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
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der SCADA-Zuordnung" });
  }
}
