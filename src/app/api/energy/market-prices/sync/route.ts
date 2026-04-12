import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { fetchMonthlyPricesForYear } from "@/lib/market-data/smard-client";
import { apiError } from "@/lib/api-errors";

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

    if (forceRefresh) {
      // Upsert all — still needs loop due to composite unique key
      for (const mp of monthlyPrices) {
        try {
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
        } catch (err) {
          logger.warn({ month: mp.month, err }, "Failed to save market price");
          skipped++;
        }
      }
    } else {
      // Batch-lookup existing records (1 query instead of N)
      const existing = await prisma.marketPrice.findMany({
        where: { year, source: "SMARD" },
        select: { month: true },
      });
      const existingMonths = new Set(existing.map((e) => e.month));

      const toCreate = monthlyPrices.filter((mp) => !existingMonths.has(mp.month));
      skipped = monthlyPrices.length - toCreate.length;

      if (toCreate.length > 0) {
        const result = await prisma.marketPrice.createMany({
          data: toCreate.map((mp) => ({
            year: mp.year,
            month: mp.month,
            avgPriceEurMwh: mp.avgPriceEurMwh,
            minPriceEurMwh: mp.minPriceEurMwh,
            maxPriceEurMwh: mp.maxPriceEurMwh,
            source: "SMARD",
            dataPoints: mp.dataPoints,
          })),
          skipDuplicates: true,
        });
        inserted = result.count;
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
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Synchronisieren der Marktdaten" });
  }
}
