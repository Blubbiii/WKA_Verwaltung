import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/energy/market-prices?year=2026
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const prices = await prisma.marketPrice.findMany({
      where: { year },
      orderBy: { month: "asc" },
    });

    return NextResponse.json({
      data: prices.map((p) => ({
        year: p.year,
        month: p.month,
        avgPriceEurMwh: Number(p.avgPriceEurMwh),
        minPriceEurMwh: p.minPriceEurMwh ? Number(p.minPriceEurMwh) : null,
        maxPriceEurMwh: p.maxPriceEurMwh ? Number(p.maxPriceEurMwh) : null,
        source: p.source,
        dataPoints: p.dataPoints,
        updatedAt: p.updatedAt.toISOString(),
      })),
      meta: { year, count: prices.length },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching market prices");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Marktdaten" });
  }
}
