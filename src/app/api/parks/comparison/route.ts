/**
 * Park-Comparison API — aggregiert Monatsproduktion mehrerer Parks für Vergleichs-Chart.
 *
 * GET /api/parks/comparison?parkIds=a,b,c&year=2026
 * Response: { parks: [{ id, name, months: [{ month: 1..12, productionKwh }] }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

const MAX_PARKS = 5;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const parkIdsParam = searchParams.get("parkIds") ?? "";
    const yearParam = searchParams.get("year");

    const parkIds = parkIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parkIds.length === 0) {
      return apiError("BAD_REQUEST", 400, {
        message: "Mindestens eine parkId erforderlich",
      });
    }
    if (parkIds.length > MAX_PARKS) {
      return apiError("BAD_REQUEST", 400, {
        message: `Maximal ${MAX_PARKS} Parks gleichzeitig vergleichbar`,
      });
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiges Jahr" });
    }

    // Parks (mit Tenant-Filter) laden
    const parks = await prisma.park.findMany({
      where: {
        id: { in: parkIds },
        tenantId: check.tenantId,
      },
      select: { id: true, name: true },
    });

    // Aggregierte Produktion pro Park × Monat (Join über Turbine → parkId).
    // groupBy mit Filter über Relation gibt's nicht direkt — wir bauen pro Park.
    const result = await Promise.all(
      parks.map(async (park) => {
        const grouped = await prisma.turbineProduction.groupBy({
          by: ["month"],
          where: {
            tenantId: check.tenantId!,
            year,
            turbine: { parkId: park.id },
          },
          _sum: { productionKwh: true },
        });

        // Auf 12 Monate normalisieren (fehlende Monate = 0)
        const byMonth = new Map<number, number>();
        for (const g of grouped) {
          byMonth.set(g.month, Number(g._sum.productionKwh ?? 0));
        }
        const months = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          productionKwh: byMonth.get(i + 1) ?? 0,
        }));

        return { id: park.id, name: park.name, months };
      }),
    );

    return NextResponse.json({ year, parks: result });
  } catch (error) {
    logger.error({ err: error }, "Error in park-comparison endpoint");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Laden des Park-Vergleichs",
    });
  }
}
