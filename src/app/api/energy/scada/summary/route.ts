import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/summary
// Returns SCADA KPI summary: current production, daily production,
// average wind speed, monthly availability with trend comparisons.
// =============================================================================

/** Raw SQL result for latest power */
interface LatestPowerRow {
  total_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  turbine_count: bigint;
  latest_timestamp: Date | null;
}

/** Raw SQL result for daily production */
interface DailyProductionRow {
  total_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  data_points: bigint;
}

/** Raw SQL result for monthly availability */
interface MonthlyAvailabilityRow {
  avg_availability: Prisma.Decimal | null;
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");

    // --- Determine turbine IDs for the tenant/park ---
    const turbineWhere: Record<string, unknown> = {
      park: { tenantId },
      status: "ACTIVE",
    };
    if (parkId) {
      turbineWhere.parkId = parkId;
    }

    const turbines = await prisma.turbine.findMany({
      where: turbineWhere,
      select: { id: true },
    });

    if (turbines.length === 0) {
      return NextResponse.json({
        currentProductionKw: 0,
        todayProductionMwh: 0,
        avgWindSpeed: 0,
        monthAvailability: 0,
        latestTimestamp: null,
        turbineCount: 0,
        trends: {
          production: { previous: 0, change: 0 },
          wind: { previous: 0, change: 0 },
          availability: { previous: 0, change: 0 },
        },
      });
    }

    const turbineIds = turbines.map((t) => t.id);

    // --- 1. Current production: latest SCADA measurement power ---
    const latestPowerRows = await prisma.$queryRaw<LatestPowerRow[]>`
      SELECT
        COALESCE(SUM("powerW"), 0) / 1000.0 AS total_power_kw,
        AVG("windSpeedMs") AS avg_wind_speed,
        COUNT(DISTINCT "turbineId") AS turbine_count,
        MAX("timestamp") AS latest_timestamp
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "turbineId" IN (${Prisma.join(turbineIds)})
        AND "timestamp" >= NOW() - INTERVAL '1 hour'
        AND "powerW" IS NOT NULL
    `;

    const latestPower = latestPowerRows[0];
    const currentProductionKw = latestPower?.total_power_kw
      ? Math.round(Number(latestPower.total_power_kw) * 10) / 10
      : 0;
    const currentWindSpeed = latestPower?.avg_wind_speed
      ? Math.round(Number(latestPower.avg_wind_speed) * 10) / 10
      : 0;

    // --- 2. Today's production (sum of 10-min intervals) ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayRows = await prisma.$queryRaw<DailyProductionRow[]>`
      SELECT
        COALESCE(SUM("powerW" * 10.0 / 60.0 / 1000.0), 0) AS total_kwh,
        AVG("powerW") / 1000.0 AS avg_power_kw,
        AVG("windSpeedMs") AS avg_wind_speed,
        COUNT(*) AS data_points
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "turbineId" IN (${Prisma.join(turbineIds)})
        AND "timestamp" >= ${todayStart}
        AND "powerW" IS NOT NULL
    `;

    const todayData = todayRows[0];
    const todayProductionKwh = todayData?.total_kwh
      ? Number(todayData.total_kwh)
      : 0;
    const todayProductionMwh = Math.round((todayProductionKwh / 1000) * 100) / 100;
    const todayAvgWind = todayData?.avg_wind_speed
      ? Math.round(Number(todayData.avg_wind_speed) * 10) / 10
      : 0;

    // --- 3. Yesterday's production for trend comparison ---
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const yesterdayRows = await prisma.$queryRaw<DailyProductionRow[]>`
      SELECT
        COALESCE(SUM("powerW" * 10.0 / 60.0 / 1000.0), 0) AS total_kwh,
        AVG("windSpeedMs") AS avg_wind_speed,
        AVG("powerW") / 1000.0 AS avg_power_kw,
        COUNT(*) AS data_points
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "turbineId" IN (${Prisma.join(turbineIds)})
        AND "timestamp" >= ${yesterdayStart}
        AND "timestamp" < ${todayStart}
        AND "powerW" IS NOT NULL
    `;

    const yesterdayData = yesterdayRows[0];
    const yesterdayProductionMwh = yesterdayData?.total_kwh
      ? Math.round((Number(yesterdayData.total_kwh) / 1000) * 100) / 100
      : 0;
    const yesterdayAvgWind = yesterdayData?.avg_wind_speed
      ? Math.round(Number(yesterdayData.avg_wind_speed) * 10) / 10
      : 0;

    // --- 4. Current month availability ---
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const currentAvailRows = await prisma.$queryRaw<MonthlyAvailabilityRow[]>`
      SELECT AVG("availabilityPct") AS avg_availability
      FROM scada_availability
      WHERE "tenantId" = ${tenantId}
        AND "turbineId" IN (${Prisma.join(turbineIds)})
        AND "date" >= ${currentMonthStart}
        AND "periodType" IN ('DAILY', 'MONTHLY')
    `;

    const monthAvailability = currentAvailRows[0]?.avg_availability
      ? Math.round(Number(currentAvailRows[0].avg_availability) * 10) / 10
      : 0;

    // --- 5. Previous month availability for trend ---
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const prevAvailRows = await prisma.$queryRaw<MonthlyAvailabilityRow[]>`
      SELECT AVG("availabilityPct") AS avg_availability
      FROM scada_availability
      WHERE "tenantId" = ${tenantId}
        AND "turbineId" IN (${Prisma.join(turbineIds)})
        AND "date" >= ${prevMonthStart}
        AND "date" < ${currentMonthStart}
        AND "periodType" IN ('DAILY', 'MONTHLY')
    `;

    const prevAvailability = prevAvailRows[0]?.avg_availability
      ? Math.round(Number(prevAvailRows[0].avg_availability) * 10) / 10
      : 0;

    // --- Calculate trends ---
    const productionChange =
      yesterdayProductionMwh > 0
        ? Math.round(
            ((todayProductionMwh - yesterdayProductionMwh) / yesterdayProductionMwh) * 1000,
          ) / 10
        : 0;

    const windChange =
      yesterdayAvgWind > 0
        ? Math.round(((todayAvgWind - yesterdayAvgWind) / yesterdayAvgWind) * 1000) / 10
        : 0;

    const availabilityChange =
      prevAvailability > 0
        ? Math.round(((monthAvailability - prevAvailability) / prevAvailability) * 1000) / 10
        : 0;

    return NextResponse.json({
      currentProductionKw,
      todayProductionMwh,
      avgWindSpeed: currentWindSpeed > 0 ? currentWindSpeed : todayAvgWind,
      monthAvailability,
      latestTimestamp: latestPower?.latest_timestamp
        ? latestPower.latest_timestamp
        : null,
      turbineCount: Number(latestPower?.turbine_count ?? 0),
      trends: {
        production: {
          previous: yesterdayProductionMwh,
          change: productionChange,
        },
        wind: {
          previous: yesterdayAvgWind,
          change: windChange,
        },
        availability: {
          previous: prevAvailability,
          change: availabilityChange,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Zusammenfassung");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Zusammenfassung" },
      { status: 500 },
    );
  }
}
