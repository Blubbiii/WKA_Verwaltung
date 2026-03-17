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
  state: number;
  subState: number;
  isFault: boolean;
  isService: boolean;
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

      // 4. Recent fault events (last 20, sorted by timestamp desc)
      prisma.$queryRaw<FaultRow[]>`
        SELECT
          se.id,
          se."turbineId",
          se.state,
          se."subState",
          se."isFault",
          se."isService",
          se."timestamp" AS "startTime",
          next_evt."timestamp" AS "endTime"
        FROM scada_state_events se
        LEFT JOIN LATERAL (
          SELECT "timestamp"
          FROM scada_state_events se2
          WHERE se2."turbineId" = se."turbineId"
            AND se2."tenantId" = ${tenantId}
            AND se2."timestamp" > se."timestamp"
          ORDER BY se2."timestamp" ASC
          LIMIT 1
        ) next_evt ON TRUE
        WHERE se."tenantId" = ${tenantId}
          AND ${Prisma.sql`se."turbineId" IN (${Prisma.join(turbineIds)})`}
          AND se."isFault" = TRUE
          AND se."timestamp" >= ${from}
          AND se."timestamp" < ${to}
        ORDER BY se."timestamp" DESC
        LIMIT 20
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

    // Build fault list with status code lookup
    const turbineMap = new Map(turbines.map((t) => [t.id, t]));

    // Load controller types for status code resolution
    const turbinesWithType = await prisma.turbine.findMany({
      where: { id: { in: turbineIds }, controllerType: { not: null } },
      select: { controllerType: true },
      distinct: ["controllerType"],
    });
    const controllerTypes = turbinesWithType
      .map((t) => t.controllerType!)
      .filter(Boolean);

    let codeLookup = new Map<string, { description: string; parentLabel: string | null }>();
    if (controllerTypes.length > 0) {
      const codes = await prisma.scadaStatusCode.findMany({
        where: { controllerType: { in: controllerTypes }, codeType: "STATUS" },
        select: { mainCode: true, subCode: true, description: true, parentLabel: true },
      });
      codeLookup = new Map(
        codes.map((c) => [
          `${c.mainCode}:${c.subCode}`,
          { description: c.description, parentLabel: c.parentLabel },
        ])
      );
    }

    const faults = activeFaults.map((f) => {
      const codeInfo = codeLookup.get(`${f.state}:${f.subState}`);
      const stateText = codeInfo
        ? `(${f.state}.${f.subState}) ${codeInfo.parentLabel ? codeInfo.parentLabel + " — " : ""}${codeInfo.description}`
        : null;

      return {
        id: f.id,
        turbineDesignation: turbineMap.get(f.turbineId)?.designation ?? f.turbineId,
        parkName: turbineMap.get(f.turbineId)?.parkName ?? "",
        stateCode: f.state,
        subStateCode: f.subState,
        stateText,
        isFault: f.isFault,
        startTime: f.startTime instanceof Date ? f.startTime.toISOString() : String(f.startTime),
        endTime: f.endTime instanceof Date ? f.endTime.toISOString() : f.endTime ? String(f.endTime) : null,
        durationHours: f.endTime
          ? round(
              (new Date(f.endTime).getTime() - new Date(f.startTime).getTime()) / (1000 * 60 * 60),
              1
            )
          : null,
      };
    });

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
