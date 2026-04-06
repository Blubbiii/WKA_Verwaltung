import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getForecastForPark } from "@/lib/weather/forecast";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/weather/[parkId]/forecast
// 7-day wind forecast + estimated production for a park

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { parkId } = await params;

    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        totalCapacityKw: true,
        _count: { select: { turbines: true } },
      },
    });

    if (!park) {
      return NextResponse.json({ error: "Park nicht gefunden" }, { status: 404 });
    }

    const lat = Number(park.latitude);
    const lng = Number(park.longitude);

    if (!lat || !lng || lat === 0 || lng === 0) {
      return NextResponse.json(
        { error: "Keine Koordinaten für diesen Park hinterlegt" },
        { status: 400 }
      );
    }

    const forecast = await getForecastForPark(
      park.id,
      park.name,
      lat,
      lng,
      Number(park.totalCapacityKw ?? 0) / (park._count.turbines || 1), // per-turbine rated power
      park._count.turbines
    );

    return NextResponse.json(forecast);
  } catch (error) {
    logger.error({ err: error }, "Fehler bei Wetterprognose");
    return NextResponse.json(
      { error: "Fehler bei Wetterprognose" },
      { status: 500 }
    );
  }
}
