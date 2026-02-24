import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/productions
// Aggregiert SCADA-Messdaten in verschiedenen Zeitintervallen für die
// Einspeisedaten-Seite. Unterstuetzt 10min, hour, day, month, year.
// =============================================================================

const VALID_INTERVALS = ["10min", "hour", "day", "month", "year"] as const;
type Interval = (typeof VALID_INTERVALS)[number];

/** Raw SQL result row for aggregated data */
interface AggregatedRow {
  turbineId: string;
  period_start: Date;
  production_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  data_points: bigint;
}

/** Raw SQL result row for count query */
interface CountRow {
  count: bigint;
}

/** Raw SQL result row for totals query */
interface TotalsRow {
  total_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  total_data_points: bigint;
}

export async function GET(request: NextRequest) {
  try {
    // --- Auth & Permission ---
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    // --- Query-Parameter ---
    const { searchParams } = new URL(request.url);
    const interval = searchParams.get("interval") as Interval | null;
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");

    // --- Validierung: interval ---
    if (!interval) {
      return NextResponse.json(
        { error: "Parameter 'interval' ist erforderlich (10min, hour, day, month, year)" },
        { status: 400 }
      );
    }

    if (!VALID_INTERVALS.includes(interval)) {
      return NextResponse.json(
        {
          error: `Ungültiges Intervall '${interval}'. Erlaubt: ${VALID_INTERVALS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // --- Pagination ---
    const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(limitParam || "50", 10) || 50));
    const offset = (page - 1) * limit;

    // --- Date range validation ---
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return NextResponse.json(
          { error: "Ungültiges Datum für 'from' (ISO-Format erwartet, z.B. 2025-01-01)" },
          { status: 400 }
        );
      }
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: "Ungültiges Datum für 'to' (ISO-Format erwartet, z.B. 2025-12-31)" },
          { status: 400 }
        );
      }
    }

    // --- Turbines für Tenant ermitteln (gefiltert nach Park/Turbine) ---
    const turbineWhere: Record<string, unknown> = {
      park: { tenantId },
    };
    if (parkId) {
      turbineWhere.parkId = parkId;
    }
    if (turbineId) {
      turbineWhere.id = turbineId;
    }

    const turbines = await prisma.turbine.findMany({
      where: turbineWhere,
      select: {
        id: true,
        designation: true,
        park: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
    });

    // Leeres Ergebnis wenn keine Turbinen gefunden
    if (turbines.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        aggregations: {
          totalProductionKwh: 0,
          avgPowerKw: 0,
          avgWindSpeed: 0,
          totalDataPoints: 0,
        },
      });
    }

    const turbineIds = turbines.map((t) => t.id);

    // Turbine-Lookup-Map
    const turbineMap = new Map(
      turbines.map((t) => [
        t.id,
        { designation: t.designation, parkName: t.park.name },
      ])
    );

    // --- WHERE-Fragmente aufbauen (Prisma.sql für sichere Parametrisierung) ---
    const baseConditions = Prisma.sql`
      "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND "turbineId" IN (${Prisma.join(turbineIds)})
    `;

    // Optionale Zeitraum-Filter
    const dateConditions: Prisma.Sql[] = [];
    if (fromDate) {
      dateConditions.push(Prisma.sql`AND "timestamp" >= ${fromDate}`);
    }
    if (toDate) {
      dateConditions.push(Prisma.sql`AND "timestamp" < ${toDate}`);
    }

    const dateFragment =
      dateConditions.length > 0
        ? Prisma.sql`${Prisma.join(dateConditions, " ")}`
        : Prisma.empty;

    const whereClause = Prisma.sql`${baseConditions} ${dateFragment}`;

    // --- SQL-Abfragen je nach Intervall ---
    let dataRows: AggregatedRow[];
    let countRows: CountRow[];

    if (interval === "10min") {
      // Rohdaten (keine Aggregation)
      dataRows = await prisma.$queryRaw<AggregatedRow[]>`
        SELECT
          "turbineId",
          "timestamp" AS period_start,
          "powerW" * 10.0 / 60.0 / 1000.0 AS production_kwh,
          "powerW" / 1000.0 AS avg_power_kw,
          "windSpeedMs" AS avg_wind_speed,
          1 AS data_points
        FROM scada_measurements
        WHERE ${whereClause}
        ORDER BY "turbineId", "timestamp"
        OFFSET ${offset} LIMIT ${limit}
      `;

      countRows = await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count
        FROM scada_measurements
        WHERE ${whereClause}
      `;
    } else {
      // Aggregierte Daten mit date_trunc
      const truncUnit =
        interval === "hour"
          ? "hour"
          : interval === "day"
            ? "day"
            : interval === "month"
              ? "month"
              : "year";

      // Prisma.sql erlaubt keine parametrisierten Identifier,
      // daher verwenden wir für die date_trunc-Unit ein sicheres Mapping
      const truncSql =
        truncUnit === "hour"
          ? Prisma.sql`date_trunc('hour', "timestamp")`
          : truncUnit === "day"
            ? Prisma.sql`date_trunc('day', "timestamp")`
            : truncUnit === "month"
              ? Prisma.sql`date_trunc('month', "timestamp")`
              : Prisma.sql`date_trunc('year', "timestamp")`;

      dataRows = await prisma.$queryRaw<AggregatedRow[]>`
        SELECT
          "turbineId",
          ${truncSql} AS period_start,
          SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
          AVG("powerW") / 1000.0 AS avg_power_kw,
          AVG("windSpeedMs") AS avg_wind_speed,
          COUNT(*) AS data_points
        FROM scada_measurements
        WHERE ${whereClause}
        GROUP BY "turbineId", ${truncSql}
        ORDER BY "turbineId", period_start
        OFFSET ${offset} LIMIT ${limit}
      `;

      countRows = await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count FROM (
          SELECT 1
          FROM scada_measurements
          WHERE ${whereClause}
          GROUP BY "turbineId", ${truncSql}
        ) sub
      `;
    }

    // --- Totals Query (über gesamten gefilterten Bereich, unabhängig von Pagination) ---
    const totalsRows = await prisma.$queryRaw<TotalsRow[]>`
      SELECT
        SUM("powerW" * 10.0 / 60.0 / 1000.0) AS total_kwh,
        AVG("powerW") / 1000.0 AS avg_power_kw,
        AVG("windSpeedMs") AS avg_wind_speed,
        COUNT(*) AS total_data_points
      FROM scada_measurements
      WHERE ${whereClause}
    `;

    // --- Ergebnisse aufbereiten ---
    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    const data = dataRows.map((row) => {
      const info = turbineMap.get(row.turbineId);
      return {
        turbineId: row.turbineId,
        turbineDesignation: info?.designation ?? "Unbekannt",
        parkName: info?.parkName ?? "Unbekannt",
        periodStart: row.period_start instanceof Date
          ? row.period_start.toISOString()
          : String(row.period_start),
        productionKwh: row.production_kwh
          ? Math.round(Number(row.production_kwh) * 1000) / 1000
          : 0,
        avgPowerKw: row.avg_power_kw
          ? Math.round(Number(row.avg_power_kw) * 1000) / 1000
          : 0,
        avgWindSpeed: row.avg_wind_speed
          ? Math.round(Number(row.avg_wind_speed) * 100) / 100
          : 0,
        dataPoints: Number(row.data_points),
      };
    });

    const totals = totalsRows[0];
    const aggregations = {
      totalProductionKwh: totals?.total_kwh
        ? Math.round(Number(totals.total_kwh) * 1000) / 1000
        : 0,
      avgPowerKw: totals?.avg_power_kw
        ? Math.round(Number(totals.avg_power_kw) * 1000) / 1000
        : 0,
      avgWindSpeed: totals?.avg_wind_speed
        ? Math.round(Number(totals.avg_wind_speed) * 100) / 100
        : 0,
      totalDataPoints: Number(totals?.total_data_points ?? 0),
    };

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      aggregations,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Produktionsdaten");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Produktionsdaten" },
      { status: 500 }
    );
  }
}
