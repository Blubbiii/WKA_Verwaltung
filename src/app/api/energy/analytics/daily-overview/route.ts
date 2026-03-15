import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  loadTurbines,
  buildTurbineIdFilter,
  safeNumber,
  round,
} from "@/lib/analytics/query-helpers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/daily-overview
// Combined KPIs, daily charts, faults, and turbine status for a date range
// =============================================================================

interface DailyProductionRow {
  day: Date;
  production_kwh: number;
  avg_wind_speed: number | null;
}

interface TurbineProductionRow {
  turbineId: string;
  production_kwh: number;
  avg_wind_speed: number | null;
}

interface AvailabilityRow {
  turbineId: string;
  avg_availability: number | null;
}

interface FaultRow {
  id: string;
  turbineId: string;
  stateCode: number | null;
  stateText: string | null;
  startTime: Date;
  endTime: Date | null;
}

interface RevenueRow {
  total_revenue: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Default: last 30 days
    const now = new Date();
    const to = toParam ? new Date(toParam) : now;
    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "Ungültiges Datumsformat" },
        { status: 400 }
      );
    }

    // Load turbines
    const turbines = await loadTurbines(tenantId, parkId);
    if (turbines.length === 0) {
      return NextResponse.json({
        kpis: {
          totalProductionKwh: 0,
          avgAvailabilityPct: null,
          activeFaults: 0,
          avgWindSpeed: null,
          totalRevenueEur: null,
        },
        dailyChart: [],
        faults: [],
        turbineStatus: [],
        meta: { from: from.toISOString(), to: to.toISOString(), parkId: parkId || "all" },
      });
    }

    const turbineIds = turbines.map((t) => t.id);
    const turbineFilter = buildTurbineIdFilter(turbineIds);

    // Run all queries in parallel
    const [
      dailyProduction,
      turbineProduction,
      availabilityData,
      activeFaults,
      revenueData,
    ] = await Promise.all([
      // 1. Daily production + wind (for chart)
      prisma.$queryRaw<DailyProductionRow[]>`
        SELECT
          DATE_TRUNC('day', "timestamp") AS day,
          SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
          AVG("windSpeedMs") AS avg_wind_speed
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "powerW" IS NOT NULL
          AND ${turbineFilter}
          AND "timestamp" >= ${from}
          AND "timestamp" < ${to}
        GROUP BY DATE_TRUNC('day', "timestamp")
        ORDER BY day
      `,

      // 2. Per-turbine production + wind (for status table)
      prisma.$queryRaw<TurbineProductionRow[]>`
        SELECT
          "turbineId",
          SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
          AVG("windSpeedMs") AS avg_wind_speed
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "powerW" IS NOT NULL
          AND ${turbineFilter}
          AND "timestamp" >= ${from}
          AND "timestamp" < ${to}
        GROUP BY "turbineId"
      `,

      // 3. Avg availability per turbine
      prisma.$queryRaw<AvailabilityRow[]>`
        SELECT
          "turbineId",
          AVG("availabilityPct") AS avg_availability
        FROM scada_availability
        WHERE "tenantId" = ${tenantId}
          AND ${turbineFilter}
          AND "date" >= ${from}
          AND "date" < ${to}
        GROUP BY "turbineId"
      `,

      // 4. Active / recent faults (last 10, sorted by startTime desc)
      prisma.$queryRaw<FaultRow[]>`
        SELECT
          sm.id,
          sm."turbineId",
          sm."stateCode",
          sm."stateText",
          sm."timestamp" AS "startTime",
          sm2."timestamp" AS "endTime"
        FROM scada_measurements sm
        LEFT JOIN LATERAL (
          SELECT "timestamp"
          FROM scada_measurements sm2
          WHERE sm2."turbineId" = sm."turbineId"
            AND sm2."tenantId" = ${tenantId}
            AND sm2."sourceFile" = 'UID'
            AND sm2."timestamp" > sm."timestamp"
            AND sm2."stateCode" IS DISTINCT FROM sm."stateCode"
          ORDER BY sm2."timestamp" ASC
          LIMIT 1
        ) sm2 ON TRUE
        WHERE sm."tenantId" = ${tenantId}
          AND sm."sourceFile" = 'UID'
          AND ${Prisma.sql`sm."turbineId" IN (${Prisma.join(turbineIds)})`}
          AND sm."stateCode" IS NOT NULL
          AND sm."stateCode" NOT IN (0, 1, 2, 3, 4, 5, 6)
          AND sm."timestamp" >= ${from}
          AND sm."timestamp" < ${to}
        ORDER BY sm."timestamp" DESC
        LIMIT 10
      `,

      // 5. Revenue in period
      prisma.$queryRaw<RevenueRow[]>`
        SELECT SUM("revenueEur") AS total_revenue
        FROM energy_settlements
        WHERE "tenantId" = ${tenantId}
          AND "periodStart" >= ${from}
          AND "periodStart" < ${to}
          ${parkId && parkId !== "all" ? Prisma.sql`AND "parkId" = ${parkId}` : Prisma.empty}
      `,
    ]);

    // Build KPIs
    const totalProductionKwh = dailyProduction.reduce(
      (s, d) => s + safeNumber(d.production_kwh),
      0
    );

    const availabilities = availabilityData
      .map((a) => safeNumber(a.avg_availability))
      .filter((v) => v > 0);
    const avgAvailabilityPct =
      availabilities.length > 0
        ? round(availabilities.reduce((s, v) => s + v, 0) / availabilities.length, 2)
        : null;

    const windSpeeds = dailyProduction
      .map((d) => safeNumber(d.avg_wind_speed))
      .filter((v) => v > 0);
    const avgWindSpeed =
      windSpeeds.length > 0
        ? round(windSpeeds.reduce((s, v) => s + v, 0) / windSpeeds.length, 2)
        : null;

    const totalRevenue = safeNumber(revenueData[0]?.total_revenue);

    // Build turbine lookup
    const turbineProdMap = new Map(
      turbineProduction.map((r) => [r.turbineId, r])
    );
    const turbineAvailMap = new Map(
      availabilityData.map((r) => [r.turbineId, r])
    );

    // Build turbine status table
    const turbineStatus = turbines.map((t) => {
      const prod = turbineProdMap.get(t.id);
      const avail = turbineAvailMap.get(t.id);
      const hasFault = activeFaults.some(
        (f) => f.turbineId === t.id && f.endTime == null
      );

      return {
        turbineId: t.id,
        designation: t.designation,
        parkName: t.parkName,
        productionKwh: round(safeNumber(prod?.production_kwh), 1),
        avgWindSpeed: prod?.avg_wind_speed != null ? round(safeNumber(prod.avg_wind_speed), 2) : null,
        availabilityPct: avail?.avg_availability != null ? round(safeNumber(avail.avg_availability), 2) : null,
        hasActiveFault: hasFault,
      };
    });

    // Build daily chart data
    const dailyChart = dailyProduction.map((d) => ({
      date: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : String(d.day).slice(0, 10),
      productionKwh: round(safeNumber(d.production_kwh), 1),
      avgWindSpeed: d.avg_wind_speed != null ? round(safeNumber(d.avg_wind_speed), 2) : null,
    }));

    // Build fault list
    const turbineMap = new Map(turbines.map((t) => [t.id, t]));
    const faults = activeFaults.map((f) => ({
      id: f.id,
      turbineDesignation: turbineMap.get(f.turbineId)?.designation ?? f.turbineId,
      parkName: turbineMap.get(f.turbineId)?.parkName ?? "",
      stateCode: f.stateCode,
      stateText: f.stateText,
      startTime: f.startTime instanceof Date ? f.startTime.toISOString() : String(f.startTime),
      endTime: f.endTime instanceof Date ? f.endTime.toISOString() : f.endTime ? String(f.endTime) : null,
      durationHours: f.endTime
        ? round(
            (new Date(f.endTime).getTime() - new Date(f.startTime).getTime()) / (1000 * 60 * 60),
            1
          )
        : null,
    }));

    return NextResponse.json({
      kpis: {
        totalProductionKwh: round(totalProductionKwh, 1),
        avgAvailabilityPct,
        activeFaults: activeFaults.filter((f) => f.endTime == null).length,
        avgWindSpeed,
        totalRevenueEur: totalRevenue > 0 ? round(totalRevenue, 2) : null,
      },
      dailyChart,
      faults,
      turbineStatus,
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        parkId: parkId || "all",
        turbineCount: turbines.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Tagesbericht-Daten");
    return NextResponse.json(
      { error: "Fehler beim Laden der Tagesbericht-Daten" },
      { status: 500 }
    );
  }
}
