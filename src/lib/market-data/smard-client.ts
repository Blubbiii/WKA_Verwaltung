import { logger } from "@/lib/logger";

// SMARD (Bundesnetzagentur) API for German Day-Ahead electricity prices
// Documentation: https://smard.api.bund.dev/
// Free, no registration required

const SMARD_BASE_URL = "https://www.smard.de/app/chart_data";

// Filter ID 4169001 = Day-Ahead Preise Deutschland
const PRICE_FILTER = "4169001";
const REGION = "DE";

interface SmardTimeSeries {
  meta_data: { version: number };
  series: [number, number | null][]; // [timestamp_ms, price_eur_mwh]
}

/**
 * Fetch available timestamps (index) from SMARD
 */
async function fetchIndex(): Promise<number[]> {
  const url = `${SMARD_BASE_URL}/${PRICE_FILTER}/${REGION}/index_month.json`;
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
  if (!res.ok) throw new Error(`SMARD index fetch failed: ${res.status}`);
  const data = await res.json();
  return data.timestamps || [];
}

/**
 * Fetch monthly price data from SMARD for a specific timestamp range
 */
async function fetchPriceData(timestamp: number): Promise<SmardTimeSeries> {
  const url = `${SMARD_BASE_URL}/${PRICE_FILTER}/${REGION}/${PRICE_FILTER}_${REGION}_month_${timestamp}.json`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`SMARD data fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Aggregate hourly prices to monthly averages for a given year
 */
export interface MonthlyMarketPrice {
  year: number;
  month: number;
  avgPriceEurMwh: number;
  minPriceEurMwh: number;
  maxPriceEurMwh: number;
  dataPoints: number;
}

export async function fetchMonthlyPricesForYear(year: number): Promise<MonthlyMarketPrice[]> {
  try {
    // Get available timestamps
    const timestamps = await fetchIndex();

    // Find timestamps that cover our target year
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();

    // Filter timestamps relevant to our year (SMARD uses weekly chunks)
    const relevantTimestamps = timestamps.filter((ts) => {
      // Each timestamp covers a ~month of data
      return ts >= yearStart - 31 * 86400000 && ts < yearEnd + 31 * 86400000;
    });

    if (relevantTimestamps.length === 0) {
      logger.warn({ year }, "No SMARD timestamps found for year");
      return [];
    }

    // Fetch all relevant data chunks
    const allPrices: { timestamp: Date; price: number }[] = [];

    for (const ts of relevantTimestamps) {
      try {
        const data = await fetchPriceData(ts);
        for (const [tsMs, price] of data.series) {
          if (price === null || price < -500 || price > 5000) continue; // skip invalid
          const date = new Date(tsMs);
          if (date.getFullYear() === year) {
            allPrices.push({ timestamp: date, price });
          }
        }
      } catch (err) {
        logger.warn({ timestamp: ts, err }, "Failed to fetch SMARD chunk, skipping");
      }
    }

    // Group by month
    const monthlyData = new Map<number, number[]>();
    for (const { timestamp, price } of allPrices) {
      const month = timestamp.getMonth() + 1; // 1-12
      if (!monthlyData.has(month)) monthlyData.set(month, []);
      monthlyData.get(month)!.push(price);
    }

    // Calculate averages
    const results: MonthlyMarketPrice[] = [];
    for (const [month, prices] of monthlyData) {
      if (prices.length === 0) continue;
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);

      results.push({
        year,
        month,
        avgPriceEurMwh: Math.round(avg * 100) / 100,
        minPriceEurMwh: Math.round(min * 100) / 100,
        maxPriceEurMwh: Math.round(max * 100) / 100,
        dataPoints: prices.length,
      });
    }

    results.sort((a, b) => a.month - b.month);
    return results;
  } catch (error) {
    logger.error({ err: error, year }, "Failed to fetch SMARD market prices");
    throw error;
  }
}
