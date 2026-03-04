/**
 * POST /api/cost-centers/sync
 * Auto-creates cost centers for all parks and turbines that don't have one yet.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

async function postHandler() {
  try {
    const check = await requirePermission("wirtschaftsplan:create");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    const [parks, turbines, existingCostCenters] = await Promise.all([
      prisma.park.findMany({
        where: { tenantId, status: "ACTIVE" },
        select: { id: true, name: true, shortName: true },
      }),
      prisma.turbine.findMany({
        where: { park: { tenantId }, status: "ACTIVE" },
        select: { id: true, designation: true, parkId: true },
      }),
      prisma.costCenter.findMany({
        where: { tenantId },
        select: { parkId: true, turbineId: true },
      }),
    ]);

    const existingParkIds = new Set(
      existingCostCenters.filter((c) => c.parkId).map((c) => c.parkId!)
    );
    const existingTurbineIds = new Set(
      existingCostCenters.filter((c) => c.turbineId).map((c) => c.turbineId!)
    );

    const parksToCreate = parks.filter((p) => !existingParkIds.has(p.id));
    const turbinesToCreate = turbines.filter((t) => !existingTurbineIds.has(t.id));

    // Create park cost centers first
    const parkCostCenters = await Promise.all(
      parksToCreate.map((park) =>
        prisma.costCenter.create({
          data: {
            tenantId,
            code: `PARK-${park.shortName?.toUpperCase().replace(/\s+/g, "-") ?? park.id.slice(0, 8).toUpperCase()}`,
            name: park.name,
            type: "PARK",
            parkId: park.id,
          },
        })
      )
    );

    // Build a map: parkId -> costCenter id (including newly created ones)
    const allParkCostCenters = await prisma.costCenter.findMany({
      where: { tenantId, type: "PARK", parkId: { not: null } },
      select: { id: true, parkId: true },
    });
    const parkToCostCenter = new Map(
      allParkCostCenters.map((c) => [c.parkId!, c.id])
    );

    // Create turbine cost centers, linking to their park's cost center as parent
    const turbineCostCenters = await Promise.all(
      turbinesToCreate.map((turbine) =>
        prisma.costCenter.create({
          data: {
            tenantId,
            code: `TURB-${turbine.designation.toUpperCase().replace(/\s+/g, "-")}`,
            name: turbine.designation,
            type: "TURBINE",
            turbineId: turbine.id,
            parkId: turbine.parkId,
            parentId: parkToCostCenter.get(turbine.parkId) ?? null,
          },
        })
      )
    );

    return NextResponse.json({
      created: {
        parks: parkCostCenters.length,
        turbines: turbineCostCenters.length,
      },
      skipped: {
        parks: existingParkIds.size,
        turbines: existingTurbineIds.size,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error syncing cost centers");
    return NextResponse.json({ error: "Fehler beim Auto-Sync der Kostenstellen" }, { status: 500 });
  }
}

export const POST = withMonitoring(postHandler);
