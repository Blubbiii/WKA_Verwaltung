import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/dashboard/energy-kpis
// Aggregated energy KPIs for dashboard widgets
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Fetch data in parallel
    const [
      productionData,
      availabilityData,
      windData,
      turbineStatusData,
      settlementData,
      leaseData,
      parkRevenueData,
    ] = await Promise.all([
      // Total energy production this year (from TurbineProduction)
      prisma.turbineProduction.aggregate({
        where: {
          tenantId,
          year: currentYear,
          status: { in: ["CONFIRMED", "INVOICED"] },
        },
        _sum: { productionKwh: true },
      }),

      // Average availability this year
      prisma.turbineProduction.aggregate({
        where: {
          tenantId,
          year: currentYear,
          status: { in: ["CONFIRMED", "INVOICED"] },
          availabilityPct: { not: null },
        },
        _avg: { availabilityPct: true },
      }),

      // Latest SCADA wind speed data (monthly avg)
      prisma.$queryRaw<{ avg_wind: number | null }[]>`
        SELECT AVG(ws."meanWindSpeedMs") as avg_wind
        FROM scada_wind_summaries ws
        JOIN turbines t ON ws."turbineId" = t.id
        JOIN parks p ON t."parkId" = p.id
        WHERE p."tenantId" = ${tenantId}
        AND ws."periodType" = 'MONTHLY'
        AND ws.date >= ${new Date(currentYear, currentMonth - 2, 1)}
      `.catch(() => [{ avg_wind: null }]),

      // Turbine status counts (EntityStatus: ACTIVE, INACTIVE, ARCHIVED)
      prisma.turbine.groupBy({
        by: ["status"],
        where: { park: { tenantId } },
        _count: { id: true },
      }),

      // Settlement data for production forecast
      prisma.energySettlement.findMany({
        where: {
          tenantId,
          year: currentYear,
          status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
        },
        select: {
          netOperatorRevenueEur: true,
          totalProductionKwh: true,
          month: true,
          park: {
            select: { name: true },
          },
        },
      }),

      // Lease payment overview
      prisma.lease.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          lessor: { select: { firstName: true, lastName: true } },
          leasePlots: {
            select: {
              plot: {
                select: {
                  park: { select: { name: true } },
                  plotAreas: {
                    select: { compensationFixedAmount: true },
                  },
                },
              },
            },
          },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),

      // Revenue by park
      prisma.$queryRaw<{ parkName: string; totalRevenue: number }[]>`
        SELECT p.name as "parkName", COALESCE(SUM(es."netOperatorRevenueEur"), 0) as "totalRevenue"
        FROM energy_settlements es
        JOIN parks p ON es."parkId" = p.id
        WHERE es."tenantId" = ${tenantId}
        AND es.year = ${currentYear}
        AND es.status IN ('CALCULATED', 'INVOICED', 'CLOSED')
        GROUP BY p.name
        ORDER BY "totalRevenue" DESC
        LIMIT 8
      `.catch(() => []),
    ]);

    // Process turbine status - map EntityStatus to dashboard categories
    const statusMap = {
      operational: 0,
      maintenance: 0,
      fault: 0,
      offline: 0,
    };
    for (const row of turbineStatusData) {
      if (row.status === "ACTIVE") {
        statusMap.operational += row._count.id;
      } else if (row.status === "INACTIVE") {
        statusMap.offline += row._count.id;
      } else if (row.status === "ARCHIVED") {
        statusMap.offline += row._count.id;
      }
    }

    // Process monthly production for forecast chart
    const monthlyProduction: { month: string; actual: number; forecast: number }[] = [];
    const monthlyMap = new Map<number, number>();
    for (const s of settlementData) {
      if (s.month != null) {
        const existing = monthlyMap.get(s.month) || 0;
        monthlyMap.set(s.month, existing + Number(s.totalProductionKwh || 0));
      }
    }
    const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    for (let m = 1; m <= 12; m++) {
      const actual = (monthlyMap.get(m) || 0) / 1000; // Convert to MWh
      // Simple forecast: slightly above actual for past months, projected for future
      const forecast = m <= currentMonth ? actual * 1.05 : actual > 0 ? actual : 0;
      monthlyProduction.push({
        month: monthNames[m - 1],
        actual: Math.round(actual * 10) / 10,
        forecast: Math.round(forecast * 10) / 10,
      });
    }

    // Process lease overview
    const leaseOverview = leaseData.map((lease) => {
      let totalAmount = 0;
      let parkName = "-";
      for (const lp of lease.leasePlots) {
        if (lp.plot.park?.name) parkName = lp.plot.park.name;
        for (const area of lp.plot.plotAreas) {
          totalAmount += Number(area.compensationFixedAmount || 0);
        }
      }
      const lessorName = [lease.lessor?.firstName, lease.lessor?.lastName].filter(Boolean).join(" ") || "Unbekannt";
      return {
        lessor: lessorName,
        park: parkName,
        amount: totalAmount,
        status: "active" as const,
      };
    });

    // Calculate total MWh
    const totalProductionKwh = Number(productionData._sum?.productionKwh || 0);
    const totalMwh = Math.round(totalProductionKwh / 1000 * 10) / 10;

    // Calculate revenue totals
    const totalRevenueEur = settlementData.reduce(
      (sum: number, s) => sum + Number(s.netOperatorRevenueEur || 0), 0
    );

    const response = {
      energyYield: {
        totalMwh,
        yoyChange: 0, // Would need previous year data for comparison
      },
      availability: {
        avgPercent: Math.round(Number(availabilityData._avg?.availabilityPct || 0) * 10) / 10,
      },
      windSpeed: {
        avgMs: Math.round(Number(windData[0]?.avg_wind || 0) * 10) / 10,
      },
      leaseRevenue: {
        totalEur: Math.round(totalRevenueEur * 100) / 100,
        leaseCount: leaseData.length,
      },
      turbineStatus: statusMap,
      productionForecast: monthlyProduction,
      revenueByPark: (parkRevenueData as { parkName: string; totalRevenue: number }[]).map((r) => ({
        name: r.parkName,
        revenue: Math.round(Number(r.totalRevenue) * 100) / 100,
      })),
      leaseOverview,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy KPIs");
    return NextResponse.json(
      { error: "Fehler beim Laden der Energie-KPIs" },
      { status: 500 }
    );
  }
}
