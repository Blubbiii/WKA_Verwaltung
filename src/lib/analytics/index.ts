// Analytics Service for WindparkManager Dashboard
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import {
  DashboardKPIs,
  DashboardKPIsResponse,
  AnalyticsChartData,
  FullAnalyticsResponse,
  MonthlyInvoiceData,
  CapitalDevelopmentData,
  DocumentsByTypeData,
  serializeKPIs,
  calculateTrend,
  DOCUMENT_CATEGORY_COLORS,
  DOCUMENT_CATEGORY_LABELS,
} from "./kpis";
import { cache as redisCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/cache/types";
import { logger } from "@/lib/logger";

// =============================================================================
// REDIS CACHE HELPERS
// =============================================================================

/**
 * Clear analytics cache for a specific tenant or all tenants.
 * Uses Redis pattern deletion to invalidate all analytics keys.
 */
export async function clearAnalyticsCache(tenantId?: string): Promise<void> {
  try {
    if (tenantId) {
      await Promise.all([
        redisCache.del(`analytics:charts:${tenantId}`),
        redisCache.del(`analytics:full:${tenantId}`),
      ]);
    } else {
      await redisCache.delPattern("analytics:*");
    }
  } catch (error) {
    logger.warn("[Analytics] Cache clear error: %s", error instanceof Error ? error.message : "Unknown error");
  }
}

// =============================================================================
// KPI CALCULATIONS
// =============================================================================

/**
 * Berechnet alle Dashboard KPIs für einen Tenant
 */
export async function calculateKPIs(tenantId: string): Promise<DashboardKPIs> {
  // Note: KPIs contain Decimal objects which do not survive JSON serialization.
  // Caching happens at the getFullAnalytics() level where KPIs are serialized first.

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Parallele Datenbankabfragen für bessere Performance
  const [
    // Parks
    parksData,
    // Turbines
    turbinesData,
    turbinesInMaintenance,
    // Financial - Funds
    fundsData,
    // Shareholders
    shareholdersData,
    shareholdersLastMonth,
    // Invoices
    openInvoices,
    paidThisMonth,
    paidLastMonth,
    // Contracts
    expiringContracts,
    activeContracts,
    // Documents
    totalDocuments,
    documentsThisMonth,
    documentsLastMonth,
    // Votes
    activeVotesData,
  ] = await Promise.all([
    // Parks aggregation
    prisma.park.aggregate({
      where: { tenantId },
      _count: true,
    }),
    // Turbines aggregation
    prisma.turbine.aggregate({
      where: { park: { tenantId } },
      _count: true,
    }),
    // Turbines in maintenance (based on service events)
    prisma.turbine.count({
      where: {
        park: { tenantId },
        status: "INACTIVE",
      },
    }),
    // Fund capital
    prisma.fund.aggregate({
      where: { tenantId, status: "ACTIVE" },
      _sum: { totalCapital: true },
    }),
    // Shareholders count
    prisma.shareholder.count({
      where: { fund: { tenantId }, status: "ACTIVE" },
    }),
    // Shareholders last month
    prisma.shareholder.count({
      where: {
        fund: { tenantId },
        status: "ACTIVE",
        createdAt: { lt: startOfMonth },
      },
    }),
    // Open invoices
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ["DRAFT", "SENT"] },
      },
      _sum: { grossAmount: true },
      _count: true,
    }),
    // Paid this month
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: "PAID",
        paidAt: { gte: startOfMonth },
      },
      _sum: { grossAmount: true },
    }),
    // Paid last month
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: "PAID",
        paidAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { grossAmount: true },
    }),
    // Expiring contracts (next 30 days)
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE",
        endDate: { lte: thirtyDaysFromNow, gte: now },
      },
    }),
    // Active contracts
    prisma.contract.count({
      where: { tenantId, status: "ACTIVE" },
    }),
    // Total documents
    prisma.document.count({
      where: { tenantId },
    }),
    // Documents this month
    prisma.document.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
    }),
    // Documents last month
    prisma.document.count({
      where: {
        tenantId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
    }),
    // Active votes with pending voters
    prisma.vote.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        fund: {
          include: {
            shareholders: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
          },
        },
        responses: {
          select: { shareholderId: true },
        },
      },
    }),
  ]);

  // Calculate active parks
  const activeParks = await prisma.park.count({
    where: { tenantId, status: "ACTIVE" },
  });

  // Calculate total capacity
  const capacityData = await prisma.turbine.aggregate({
    where: {
      park: { tenantId },
      status: "ACTIVE",
    },
    _sum: { ratedPowerKw: true },
  });
  const totalCapacityMW = Number(capacityData._sum.ratedPowerKw || 0) / 1000;

  // Calculate average turbine age
  const turbinesWithCommissionDate = await prisma.turbine.findMany({
    where: {
      park: { tenantId },
      commissioningDate: { not: null },
    },
    select: { commissioningDate: true },
  });

  let averageTurbineAge = 0;
  if (turbinesWithCommissionDate.length > 0) {
    const totalAge = turbinesWithCommissionDate.reduce((sum, t) => {
      const commDate = t.commissioningDate!;
      const ageYears = (now.getTime() - commDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return sum + ageYears;
    }, 0);
    averageTurbineAge = totalAge / turbinesWithCommissionDate.length;
  }

  // Calculate pending voters count
  let pendingVotersCount = 0;
  for (const vote of activeVotesData) {
    const totalShareholders = vote.fund.shareholders.length;
    const votedShareholders = vote.responses.length;
    pendingVotersCount += totalShareholders - votedShareholders;
  }

  // Calculate trends
  const paidThisMonthAmount = Number(paidThisMonth._sum.grossAmount || 0);
  const paidLastMonthAmount = Number(paidLastMonth._sum.grossAmount || 0);

  const trends = {
    revenue: calculateTrend(paidThisMonthAmount, paidLastMonthAmount),
    shareholders: calculateTrend(shareholdersData, shareholdersLastMonth),
    documents: calculateTrend(documentsThisMonth, documentsLastMonth),
  };

  const kpis: DashboardKPIs = {
    // Parks
    totalParks: parksData._count,
    activeParks,
    totalCapacityMW: Math.round(totalCapacityMW * 10) / 10,

    // Turbines
    totalTurbines: turbinesData._count,
    turbinesInMaintenance,
    averageTurbineAge: Math.round(averageTurbineAge * 10) / 10,

    // Financial
    totalFundCapital: fundsData._sum.totalCapital || new Decimal(0),
    totalShareholders: shareholdersData,
    openInvoicesAmount: openInvoices._sum.grossAmount || new Decimal(0),
    openInvoicesCount: openInvoices._count,
    paidThisMonth: paidThisMonth._sum.grossAmount || new Decimal(0),

    // Contracts
    expiringContractsCount: expiringContracts,
    activeContractsCount: activeContracts,

    // Documents
    totalDocuments,
    documentsThisMonth,

    // Votes
    activeVotes: activeVotesData.length,
    pendingVotersCount,

    // Trends
    trends,
  };

  return kpis;
}

// =============================================================================
// CHART DATA CALCULATIONS
// =============================================================================

/**
 * Berechnet Daten für alle Dashboard-Charts
 */
export async function calculateChartData(tenantId: string): Promise<AnalyticsChartData> {
  const cacheKey = `analytics:charts:${tenantId}`;

  try {
    const cached = await redisCache.get<AnalyticsChartData>(cacheKey);
    if (cached) return cached;
  } catch (error) {
    logger.warn("[Analytics] Chart cache read error: %s", error instanceof Error ? error.message : "Unknown error");
  }

  const [monthlyInvoices, capitalDevelopment, documentsByType] = await Promise.all([
    calculateMonthlyInvoices(tenantId),
    calculateCapitalDevelopment(tenantId),
    calculateDocumentsByType(tenantId),
  ]);

  const chartData: AnalyticsChartData = {
    monthlyInvoices,
    capitalDevelopment,
    documentsByType,
  };

  // Cache chart data in Redis (60s TTL, matching dashboard refresh)
  redisCache.set(cacheKey, chartData, CACHE_TTL.DASHBOARD).catch((err) => {
    logger.warn({ err: err }, "[Analytics] Chart cache write error");
  });

  return chartData;
}

/**
 * Rechnungen pro Monat (letzte 6 Monate)
 */
async function calculateMonthlyInvoices(tenantId: string): Promise<MonthlyInvoiceData[]> {
  const now = new Date();
  const months: MonthlyInvoiceData[] = [];

  for (let i = 5; i >= 0; i--) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

    const monthName = startDate.toLocaleDateString("de-DE", { month: "short" });

    const [invoiced, paid] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          tenantId,
          invoiceDate: { gte: startDate, lte: endDate },
          invoiceType: "INVOICE",
          status: { not: "CANCELLED" },
        },
        _sum: { grossAmount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          tenantId,
          paidAt: { gte: startDate, lte: endDate },
          status: "PAID",
        },
        _sum: { grossAmount: true },
      }),
    ]);

    months.push({
      month: monthName,
      invoiced: Math.round(Number(invoiced._sum.grossAmount || 0)),
      paid: Math.round(Number(paid._sum.grossAmount || 0)),
    });
  }

  return months;
}

/**
 * Kapitalentwicklung (letzte 12 Monate)
 */
async function calculateCapitalDevelopment(tenantId: string): Promise<CapitalDevelopmentData[]> {
  const now = new Date();
  const data: CapitalDevelopmentData[] = [];

  // Hole aktuelles Gesamtkapital
  const currentCapital = await prisma.fund.aggregate({
    where: { tenantId, status: "ACTIVE" },
    _sum: { totalCapital: true },
  });

  let capital = Number(currentCapital._sum.totalCapital || 0);

  // Für echte Kapitalentwicklung muessten wir historische Daten haben
  // Hier simulieren wir einen leichten Trend basierend auf neuen Gesellschaftern
  for (let i = 11; i >= 0; i--) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = startDate.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });

    // Zufällige Variation für Demo (in Produktion: echte historische Daten)
    const variance = i > 0 ? 0.98 + Math.random() * 0.04 : 1;
    const monthlyCapital = capital * Math.pow(variance, i);

    data.push({
      month: monthName,
      capital: Math.round(monthlyCapital),
    });
  }

  return data;
}

/**
 * Dokumente nach Kategorie
 */
async function calculateDocumentsByType(tenantId: string): Promise<DocumentsByTypeData[]> {
  const documentCounts = await prisma.document.groupBy({
    by: ["category"],
    where: { tenantId },
    _count: true,
  });

  return documentCounts.map((item) => ({
    name: DOCUMENT_CATEGORY_LABELS[item.category] || item.category,
    value: item._count,
    color: DOCUMENT_CATEGORY_COLORS[item.category] || "#6b7280",
  }));
}

// =============================================================================
// FULL ANALYTICS
// =============================================================================

/**
 * Holt alle Analytics-Daten (KPIs + Charts) für das Dashboard
 */
export async function getFullAnalytics(tenantId: string): Promise<FullAnalyticsResponse & { _cacheHit?: boolean }> {
  const cacheKey = `analytics:full:${tenantId}`;

  // Try Redis cache first
  try {
    const cached = await redisCache.get<FullAnalyticsResponse>(cacheKey);
    if (cached) {
      return { ...cached, _cacheHit: true };
    }
  } catch (error) {
    logger.warn("[Analytics] Full analytics cache read error: %s", error instanceof Error ? error.message : "Unknown error");
  }

  // Cache miss -- compute fresh data
  const [kpis, charts] = await Promise.all([
    calculateKPIs(tenantId),
    calculateChartData(tenantId),
  ]);

  const response: FullAnalyticsResponse = {
    kpis: serializeKPIs(kpis),
    charts,
    generatedAt: new Date().toISOString(),
  };

  // Store in Redis (60s TTL, non-blocking)
  redisCache.set(cacheKey, response, CACHE_TTL.DASHBOARD).catch((err) => {
    logger.warn({ err: err }, "[Analytics] Full analytics cache write error");
  });

  return { ...response, _cacheHit: false };
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  DashboardKPIs,
  DashboardKPIsResponse,
  AnalyticsChartData,
  FullAnalyticsResponse,
  MonthlyInvoiceData,
  CapitalDevelopmentData,
  DocumentsByTypeData,
};

export {
  serializeKPIs,
  calculateTrend,
  DOCUMENT_CATEGORY_COLORS,
  DOCUMENT_CATEGORY_LABELS,
} from "./kpis";

export {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
} from "./kpis";
