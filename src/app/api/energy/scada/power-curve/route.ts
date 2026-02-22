import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/power-curve
// Liefert Scatter-Daten (Windgeschwindigkeit vs. Leistung) und eine gemittelte
// Leistungskurve (0.5 m/s Bins) fuer die Power-Curve-Analyse.
// =============================================================================

/** Default and maximum limits for scatter data */
const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;

/** Raw SQL result row for scatter data */
interface ScatterRow {
  windSpeed: number;
  powerKw: number;
  turbineId: string;
}

/** Raw SQL result row for binned curve data */
interface CurveRow {
  windSpeed: number;
  avgPowerKw: number;
  count: bigint;
}

/** Raw SQL result row for meta query */
interface MetaRow {
  total_points: bigint;
  rated_power_kw: number | null;
  cut_in_speed: number | null;
  cut_out_speed: number | null;
}

export async function GET(request: NextRequest) {
  try {
    // --- Auth & Permission ---
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    // --- Query-Parameter ---
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = searchParams.get("limit");

    // --- Limit validation ---
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );

    // --- Date range validation ---
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return NextResponse.json(
          { error: "Ungueltiges Datum fuer 'from' (ISO-Format erwartet, z.B. 2025-01-01)" },
          { status: 400 }
        );
      }
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: "Ungueltiges Datum fuer 'to' (ISO-Format erwartet, z.B. 2025-12-31)" },
          { status: 400 }
        );
      }
    }

    // --- Turbines fuer Tenant ermitteln (gefiltert nach Park/Turbine) ---
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
      select: { id: true },
    });

    // Leeres Ergebnis wenn keine Turbinen gefunden
    if (turbines.length === 0) {
      return NextResponse.json({
        scatter: [],
        curve: [],
        meta: {
          totalPoints: 0,
          ratedPowerKw: null,
          cutInSpeed: null,
          cutOutSpeed: null,
        },
      });
    }

    const turbineIds = turbines.map((t) => t.id);

    // --- WHERE-Fragmente aufbauen ---
    const baseConditions = Prisma.sql`
      "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND "windSpeedMs" IS NOT NULL
      AND "powerW" > 0
      AND "turbineId" IN (${Prisma.join(turbineIds)})
    `;

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

    // --- Scatter Query: Zufaellige Stichprobe bis zum Limit ---
    const scatterRows = await prisma.$queryRaw<ScatterRow[]>`
      SELECT
        "windSpeedMs"::float AS "windSpeed",
        "powerW"::float / 1000.0 AS "powerKw",
        "turbineId"
      FROM scada_measurements
      WHERE ${whereClause}
      ORDER BY RANDOM()
      LIMIT ${limit}
    `;

    // --- Curve Query: Gemittelte Leistung pro 0.5 m/s Bin ---
    const curveRows = await prisma.$queryRaw<CurveRow[]>`
      SELECT
        ROUND("windSpeedMs"::numeric * 2) / 2 AS "windSpeed",
        AVG("powerW")::float / 1000.0 AS "avgPowerKw",
        COUNT(*) AS count
      FROM scada_measurements
      WHERE ${whereClause}
      GROUP BY ROUND("windSpeedMs"::numeric * 2) / 2
      ORDER BY "windSpeed"
    `;

    // --- Meta Query: Gesamtanzahl, Nennleistung, Cut-In/Cut-Out ---
    const metaRows = await prisma.$queryRaw<MetaRow[]>`
      SELECT
        COUNT(*) AS total_points,
        MAX("powerW")::float / 1000.0 AS rated_power_kw,
        MIN("windSpeedMs")::float AS cut_in_speed,
        MAX("windSpeedMs")::float AS cut_out_speed
      FROM scada_measurements
      WHERE ${whereClause}
    `;

    // --- Ergebnisse aufbereiten ---
    const scatter = scatterRows.map((row) => ({
      windSpeed: Math.round(row.windSpeed * 100) / 100,
      powerKw: Math.round(row.powerKw * 100) / 100,
      turbineId: row.turbineId,
    }));

    const curve = curveRows.map((row) => ({
      windSpeed: Number(row.windSpeed),
      avgPowerKw: Math.round(Number(row.avgPowerKw) * 100) / 100,
      count: Number(row.count),
    }));

    const meta = metaRows[0];
    const totalPoints = Number(meta?.total_points ?? 0);
    const ratedPowerKw = meta?.rated_power_kw
      ? Math.round(meta.rated_power_kw * 100) / 100
      : null;
    const cutInSpeed = meta?.cut_in_speed
      ? Math.round(meta.cut_in_speed * 100) / 100
      : null;
    const cutOutSpeed = meta?.cut_out_speed
      ? Math.round(meta.cut_out_speed * 100) / 100
      : null;

    return NextResponse.json({
      scatter,
      curve,
      meta: {
        totalPoints,
        ratedPowerKw,
        cutInSpeed,
        cutOutSpeed,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Leistungskurvendaten");
    return NextResponse.json(
      { error: "Fehler beim Laden der Leistungskurvendaten" },
      { status: 500 }
    );
  }
}
