import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { fetchMonthlyPricesForYear } from "@/lib/market-data/smard-client";

// POST /api/energy/market-prices/sync
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error!;

    const body = await request.json().catch(() => ({}));
    const year = body.year ?? new Date().getFullYear();
    const forceRefresh = body.forceRefresh ?? false;

    logger.info({ year, forceRefresh }, "Starting market price sync from SMARD");

    // Fetch from SMARD API
    const monthlyPrices = await fetchMonthlyPricesForYear(year);

    if (monthlyPrices.length === 0) {
      return NextResponse.json({
        inserted: 0,
        updated: 0,
        skipped: 0,
        source: "SMARD",
        message: `Keine Marktdaten für ${year} verfügbar`,
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const mp of monthlyPrices) {
      try {
        if (forceRefresh) {
          // Upsert: update if exists, create if not
          await prisma.marketPrice.upsert({
            where: {
              year_month_source: { year: mp.year, month: mp.month, source: "SMARD" },
            },
            update: {
              avgPriceEurMwh: mp.avgPriceEurMwh,
              minPriceEurMwh: mp.minPriceEurMwh,
              maxPriceEurMwh: mp.maxPriceEurMwh,
              dataPoints: mp.dataPoints,
            },
            create: {
              year: mp.year,
              month: mp.month,
              avgPriceEurMwh: mp.avgPriceEurMwh,
              minPriceEurMwh: mp.minPriceEurMwh,
              maxPriceEurMwh: mp.maxPriceEurMwh,
              source: "SMARD",
              dataPoints: mp.dataPoints,
            },
          });
          updated++;
        } else {
          // Only create if not exists
          const existing = await prisma.marketPrice.findUnique({
            where: {
              year_month_source: { year: mp.year, month: mp.month, source: "SMARD" },
            },
          });
          if (existing) {
            skipped++;
          } else {
            await prisma.marketPrice.create({
              data: {
                year: mp.year,
                month: mp.month,
                avgPriceEurMwh: mp.avgPriceEurMwh,
                minPriceEurMwh: mp.minPriceEurMwh,
                maxPriceEurMwh: mp.maxPriceEurMwh,
                source: "SMARD",
                dataPoints: mp.dataPoints,
              },
            });
            inserted++;
          }
        }
      } catch (err) {
        logger.warn({ month: mp.month, err }, "Failed to save market price");
        skipped++;
      }
    }

    logger.info({ year, inserted, updated, skipped }, "Market price sync completed");

    return NextResponse.json({
      inserted,
      updated,
      skipped,
      source: "SMARD",
      period: { year, months: monthlyPrices.length },
    });
  } catch (error) {
    logger.error({ err: error }, "Error syncing market prices");
    return NextResponse.json({ error: "Fehler beim Synchronisieren der Marktdaten" }, { status: 500 });
  }
}
