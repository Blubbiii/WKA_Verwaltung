import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  MarketComparisonMonth,
  MarketComparisonSummary,
  MarketComparisonResponse,
} from "@/types/market-data";
import { MONTH_LABELS } from "@/types/market-data";

/**
 * Calculate market value comparison for a park and year.
 * Compares EEG fixed-rate revenue vs hypothetical market revenue.
 */
export async function calculateMarketComparison(
  tenantId: string,
  parkId: string,
  year: number
): Promise<MarketComparisonResponse> {
  // Load all data in parallel
  const [park, productions, marketPrices, monthlyRates] = await Promise.all([
    prisma.park.findFirst({
      where: { id: parkId, tenantId },
      select: { id: true, name: true, shortName: true },
    }),

    // Monthly production per park (aggregated across turbines)
    prisma.turbineProduction.groupBy({
      by: ["month"],
      where: {
        turbine: { parkId },
        year,
        tenantId,
      },
      _sum: { productionKwh: true },
    }),

    // Cached market prices
    prisma.marketPrice.findMany({
      where: { year, source: "SMARD" },
      orderBy: { month: "asc" },
    }),

    // EEG rates (find the primary revenue type for this tenant)
    prisma.energyMonthlyRate.findMany({
      where: {
        tenantId,
        year,
        revenueType: { isActive: true },
      },
      include: { revenueType: { select: { code: true, name: true } } },
      orderBy: { month: "asc" },
    }),
  ]);

  if (!park) {
    throw new Error("Park nicht gefunden");
  }

  // Build lookup maps
  const productionByMonth = new Map<number, number>();
  for (const p of productions) {
    productionByMonth.set(p.month, p._sum.productionKwh ? Number(p._sum.productionKwh) : 0);
  }

  const marketByMonth = new Map<number, { avg: number; min: number | null; max: number | null }>();
  for (const mp of marketPrices) {
    marketByMonth.set(mp.month, {
      avg: Number(mp.avgPriceEurMwh),
      min: mp.minPriceEurMwh ? Number(mp.minPriceEurMwh) : null,
      max: mp.maxPriceEurMwh ? Number(mp.maxPriceEurMwh) : null,
    });
  }

  // Find EEG rate — prefer code "EEG", fallback to first active rate
  const eegRates = monthlyRates.filter((r) =>
    r.revenueType.code.toUpperCase().includes("EEG")
  );
  const rateSource = eegRates.length > 0 ? eegRates : monthlyRates;
  const rateByMonth = new Map<number, number>();
  for (const r of rateSource) {
    rateByMonth.set(r.month, Number(r.ratePerKwh));
  }

  // If no monthly rates exist, try to get a yearly average
  let fallbackRate = 0;
  if (rateByMonth.size === 0 && rateSource.length > 0) {
    fallbackRate = rateSource.reduce((s, r) => s + Number(r.ratePerKwh), 0) / rateSource.length;
  }

  // Calculate monthly comparison
  const monthly: MarketComparisonMonth[] = [];
  let totalProdKwh = 0;
  let totalEegRev = 0;
  let totalMarketRev = 0;

  for (let m = 1; m <= 12; m++) {
    const prodKwh = productionByMonth.get(m) ?? 0;
    const eegRate = rateByMonth.get(m) ?? fallbackRate; // EUR/kWh
    const marketPrice = marketByMonth.get(m);

    const eegRevenue = prodKwh * eegRate;
    const avgMarketEurMwh = marketPrice?.avg ?? 0;
    const marketRevenue = prodKwh * (avgMarketEurMwh / 1000); // MWh→kWh conversion

    const diff = marketRevenue - eegRevenue;
    const diffPct = eegRevenue > 0 ? (diff / eegRevenue) * 100 : 0;

    monthly.push({
      month: m,
      label: MONTH_LABELS[m - 1],
      productionKwh: Math.round(prodKwh),
      eegRateCtKwh: Math.round(eegRate * 10000) / 100, // EUR/kWh → ct/kWh
      eegRevenueEur: Math.round(eegRevenue * 100) / 100,
      avgMarketPriceEurMwh: Math.round(avgMarketEurMwh * 100) / 100,
      avgMarketPriceCtKwh: Math.round((avgMarketEurMwh / 10) * 100) / 100, // EUR/MWh → ct/kWh
      marketRevenueEur: Math.round(marketRevenue * 100) / 100,
      differenceEur: Math.round(diff * 100) / 100,
      differencePercent: Math.round(diffPct * 10) / 10,
    });

    totalProdKwh += prodKwh;
    totalEegRev += eegRevenue;
    totalMarketRev += marketRevenue;
  }

  // Cumulative difference
  let cumulative = 0;
  const cumulativeDifference = monthly.map((m) => {
    cumulative += m.differenceEur;
    return { month: m.month, label: m.label, cumulativeEur: Math.round(cumulative * 100) / 100 };
  });

  // Summary
  const totalDiff = totalMarketRev - totalEegRev;
  const totalDiffPct = totalEegRev > 0 ? (totalDiff / totalEegRev) * 100 : 0;

  const monthsWithRates = monthly.filter((m) => m.eegRateCtKwh > 0);
  const avgEegRate = monthsWithRates.length > 0
    ? monthsWithRates.reduce((s, m) => s + m.eegRateCtKwh, 0) / monthsWithRates.length
    : 0;

  const monthsWithMarket = monthly.filter((m) => m.avgMarketPriceEurMwh > 0);
  const avgMarketCtKwh = monthsWithMarket.length > 0
    ? monthsWithMarket.reduce((s, m) => s + m.avgMarketPriceCtKwh, 0) / monthsWithMarket.length
    : 0;

  let recommendation: "EEG" | "DIREKTVERMARKTUNG" | "NEUTRAL" = "NEUTRAL";
  if (totalDiffPct > 5) recommendation = "DIREKTVERMARKTUNG";
  else if (totalDiffPct < -5) recommendation = "EEG";

  const summary: MarketComparisonSummary = {
    totalProductionKwh: Math.round(totalProdKwh),
    totalProductionMwh: Math.round(totalProdKwh / 1000),
    totalEegRevenueEur: Math.round(totalEegRev * 100) / 100,
    totalMarketRevenueEur: Math.round(totalMarketRev * 100) / 100,
    totalDifferenceEur: Math.round(totalDiff * 100) / 100,
    totalDifferencePercent: Math.round(totalDiffPct * 10) / 10,
    avgEegRateCtKwh: Math.round(avgEegRate * 100) / 100,
    avgMarketPriceCtKwh: Math.round(avgMarketCtKwh * 100) / 100,
    recommendation,
  };

  const lastSync = marketPrices.length > 0
    ? marketPrices[marketPrices.length - 1].updatedAt.toISOString()
    : null;

  logger.info({
    parkId,
    year,
    totalProdMwh: summary.totalProductionMwh,
    diffEur: summary.totalDifferenceEur,
    recommendation,
  }, "Market comparison calculated");

  return {
    monthly,
    summary,
    cumulativeDifference,
    meta: {
      year,
      parkId,
      parkName: park.shortName || park.name,
      marketDataAvailable: marketPrices.length > 0,
      marketDataSource: "SMARD (Bundesnetzagentur)",
      lastSyncAt: lastSync,
    },
  };
}
