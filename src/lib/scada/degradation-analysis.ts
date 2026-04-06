import { prisma } from "@/lib/prisma";

/**
 * Analyze turbine performance degradation over time.
 * Uses monthly capacity factor normalized by wind speed to detect
 * gradual performance loss (blade erosion, bearing wear, etc.).
 *
 * Method: Simple linear regression on monthly normalized capacity factors
 * over the last 12-24 months. Slope indicates degradation rate.
 */

interface DegradationPoint {
  month: string; // "2024-01", "2024-02", etc.
  capacityFactor: number; // actual CF in %
  normalizedCf: number;   // wind-speed normalized CF
  windSpeedAvg: number;   // avg wind speed that month
}

interface DegradationResult {
  turbineId: string;
  designation: string;
  dataPoints: DegradationPoint[];
  slopePerYear: number;     // CF change per year (negative = degradation)
  rSquared: number;          // regression quality (0-1)
  currentCf: number;         // latest month CF
  baselineCf: number;        // first month CF
  degradationPct: number;    // total degradation in %
  recommendation: string | null; // "inspection" | "maintenance" | null
}

interface MaintenanceRecommendation {
  turbineId: string;
  designation: string;
  type: "inspection" | "maintenance" | "critical";
  reason: string;
  details: string;
  estimatedCostEur: number | null; // rough cost based on avg production x rate x downtime
}

// Simple linear regression
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssTot += (p.y - yMean) ** 2;
    ssRes += (p.y - predicted) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared };
}

export async function analyzeDegradation(
  tenantId: string,
  parkId?: string | null,
  months: number = 24
): Promise<DegradationResult[]> {
  // Get turbines
  const whereClause = parkId
    ? { park: { tenantId, id: parkId, deletedAt: null } }
    : { park: { tenantId, deletedAt: null } };

  const turbines = await prisma.turbine.findMany({
    where: whereClause,
    select: {
      id: true,
      designation: true,
      ratedPowerKw: true,
    },
  });

  if (turbines.length === 0) return [];

  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - months, 1));
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

  const results: DegradationResult[] = [];

  for (const turbine of turbines) {
    const ratedKw = Number(turbine.ratedPowerKw ?? 0);
    if (ratedKw <= 0) continue;

    // Get monthly production data
    const productions = await prisma.turbineProduction.findMany({
      where: {
        turbineId: turbine.id,
        tenantId,
        year: { gte: from.getFullYear() },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { year: true, month: true, productionKwh: true },
    });

    // Get monthly wind speed averages from SCADA
    interface WindRow { month_start: Date; avg_wind: number | null }
    const windData = await prisma.$queryRaw<WindRow[]>`
      SELECT
        date_trunc('month', "timestamp") AS month_start,
        AVG("windSpeedMs")::float AS avg_wind
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "turbineId" = ${turbine.id}
        AND "timestamp" >= ${from}
        AND "timestamp" < ${to}
        AND "windSpeedMs" IS NOT NULL
        AND "windSpeedMs" > 0
        AND "windSpeedMs" < 50
      GROUP BY date_trunc('month', "timestamp")
      ORDER BY month_start
    `;

    const windMap = new Map<string, number>();
    for (const w of windData) {
      const d = new Date(w.month_start);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      windMap.set(key, w.avg_wind ?? 0);
    }

    const dataPoints: DegradationPoint[] = [];
    const regressionPoints: { x: number; y: number }[] = [];

    for (const prod of productions) {
      const key = `${prod.year}-${String(prod.month).padStart(2, "0")}`;
      const hoursInMonth = new Date(prod.year, prod.month, 0).getDate() * 24;
      const prodKwh = Number(prod.productionKwh);
      const cf = (prodKwh / (ratedKw * hoursInMonth)) * 100;

      const wind = windMap.get(key) ?? 0;
      // Normalize CF by wind speed (divide by wind³ proxy, simplified)
      // Higher wind → higher expected CF, so normalizing flattens seasonal variation
      const normalizedCf = wind > 3 ? cf / Math.pow(wind / 8, 1.5) : cf;

      dataPoints.push({
        month: key,
        capacityFactor: Math.round(cf * 100) / 100,
        normalizedCf: Math.round(normalizedCf * 100) / 100,
        windSpeedAvg: Math.round(wind * 10) / 10,
      });

      regressionPoints.push({
        x: regressionPoints.length, // sequential month index
        y: normalizedCf,
      });
    }

    if (dataPoints.length < 6) continue; // Need at least 6 months

    const reg = linearRegression(regressionPoints);
    const slopePerYear = reg.slope * 12; // Convert monthly slope to annual
    const currentCf = dataPoints[dataPoints.length - 1]?.normalizedCf ?? 0;
    const baselineCf = dataPoints[0]?.normalizedCf ?? 0;
    const degradationPct = baselineCf > 0
      ? Math.round(((baselineCf - currentCf) / baselineCf) * 10000) / 100
      : 0;

    let recommendation: string | null = null;
    if (slopePerYear < -5 || degradationPct > 10) {
      recommendation = "maintenance";
    } else if (slopePerYear < -2 || degradationPct > 5) {
      recommendation = "inspection";
    }

    results.push({
      turbineId: turbine.id,
      designation: turbine.designation,
      dataPoints,
      slopePerYear: Math.round(slopePerYear * 100) / 100,
      rSquared: Math.round(reg.rSquared * 1000) / 1000,
      currentCf,
      baselineCf,
      degradationPct,
      recommendation,
    });
  }

  return results.sort((a, b) => a.slopePerYear - b.slopePerYear); // worst first
}

export async function getMaintenanceRecommendations(
  tenantId: string,
  parkId?: string | null
): Promise<MaintenanceRecommendation[]> {
  const recommendations: MaintenanceRecommendation[] = [];

  // 1. Check anomaly frequency (>=3 same-type anomalies in 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  interface AnomalyCount { turbineId: string; type: string; count: bigint }
  const anomalyCounts = parkId
    ? await prisma.$queryRaw<AnomalyCount[]>`
        SELECT a."turbineId", a."type", COUNT(*)::bigint AS count
        FROM scada_anomalies a
        JOIN turbines t ON t.id = a."turbineId"
        JOIN parks p ON p.id = t."parkId"
        WHERE a."tenantId" = ${tenantId}
          AND a."detectedAt" >= ${thirtyDaysAgo}
          AND a."resolvedAt" IS NULL
          AND p.id = ${parkId}
        GROUP BY a."turbineId", a."type"
        HAVING COUNT(*) >= 3
      `
    : await prisma.$queryRaw<AnomalyCount[]>`
        SELECT a."turbineId", a."type", COUNT(*)::bigint AS count
        FROM scada_anomalies a
        WHERE a."tenantId" = ${tenantId}
          AND a."detectedAt" >= ${thirtyDaysAgo}
          AND a."resolvedAt" IS NULL
        GROUP BY a."turbineId", a."type"
        HAVING COUNT(*) >= 3
      `;

  // Get turbine designations
  const turbineIds = [...new Set(anomalyCounts.map(a => a.turbineId))];
  const turbines = turbineIds.length > 0
    ? await prisma.turbine.findMany({
        where: { id: { in: turbineIds } },
        select: { id: true, designation: true },
      })
    : [];
  const turbineMap = new Map(turbines.map(t => [t.id, t.designation]));

  const typeLabels: Record<string, string> = {
    PERFORMANCE_DROP: "Leistungsabfall",
    LOW_AVAILABILITY: "Niedrige Verfuegbarkeit",
    CURVE_DEVIATION: "Kennlinien-Abweichung",
    DATA_QUALITY: "Datenqualitaetsprobleme",
    EXTENDED_DOWNTIME: "Dauerstillstand",
  };

  for (const ac of anomalyCounts) {
    const count = Number(ac.count);
    recommendations.push({
      turbineId: ac.turbineId,
      designation: turbineMap.get(ac.turbineId) ?? "Unbekannt",
      type: count >= 5 ? "critical" : "maintenance",
      reason: `${count}x ${typeLabels[ac.type] ?? ac.type} in 30 Tagen`,
      details: `Haeufung von "${typeLabels[ac.type] ?? ac.type}"-Anomalien deutet auf systematisches Problem hin.`,
      estimatedCostEur: null,
    });
  }

  // 2. Check degradation trends
  const degradation = await analyzeDegradation(tenantId, parkId, 12);
  for (const d of degradation) {
    if (d.recommendation === "maintenance") {
      recommendations.push({
        turbineId: d.turbineId,
        designation: d.designation,
        type: "maintenance",
        reason: `Degradation ${Math.abs(d.slopePerYear).toFixed(1)} %/Jahr`,
        details: `Kapazitaetsfaktor sinkt um ${Math.abs(d.slopePerYear).toFixed(1)} Prozentpunkte pro Jahr. Gesamtverlust: ${d.degradationPct.toFixed(1)}%.`,
        estimatedCostEur: null,
      });
    } else if (d.recommendation === "inspection") {
      recommendations.push({
        turbineId: d.turbineId,
        designation: d.designation,
        type: "inspection",
        reason: `Leichte Degradation ${Math.abs(d.slopePerYear).toFixed(1)} %/Jahr`,
        details: `Kapazitaetsfaktor zeigt leicht fallenden Trend. Inspektion empfohlen.`,
        estimatedCostEur: null,
      });
    }
  }

  // Sort: critical first, then maintenance, then inspection
  const typeOrder = { critical: 0, maintenance: 1, inspection: 2 };
  return recommendations.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
}

export type { DegradationResult, DegradationPoint, MaintenanceRecommendation };
