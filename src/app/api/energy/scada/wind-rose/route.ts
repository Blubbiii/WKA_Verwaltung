import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/wind-rose
// Berechnet Windrosendaten aus SCADA-Messwerten: Haeufigkeitsverteilung der
// Windrichtungen aufgeschluesselt nach Geschwindigkeitsbereichen.
// 16 Sektoren (N, NNE, NE, ...) x 6 Speed-Ranges (0-3, 3-6, ..., 15+).
// =============================================================================

/** Direction sector definition with label and center degree */
const DIRECTION_SECTORS = [
  { label: "N", deg: 0 },
  { label: "NNE", deg: 22.5 },
  { label: "NE", deg: 45 },
  { label: "ENE", deg: 67.5 },
  { label: "E", deg: 90 },
  { label: "ESE", deg: 112.5 },
  { label: "SE", deg: 135 },
  { label: "SSE", deg: 157.5 },
  { label: "S", deg: 180 },
  { label: "SSW", deg: 202.5 },
  { label: "SW", deg: 225 },
  { label: "WSW", deg: 247.5 },
  { label: "W", deg: 270 },
  { label: "WNW", deg: 292.5 },
  { label: "NW", deg: 315 },
  { label: "NNW", deg: 337.5 },
] as const;

/** Speed range labels in order */
const SPEED_RANGES = ["0-3", "3-6", "6-9", "9-12", "12-15", "15+"] as const;

/** Raw SQL result row */
interface WindRoseRow {
  direction_sector: string;
  speed_range: string;
  count: bigint;
}

/** Raw SQL result row for meta query */
interface MetaRow {
  total_measurements: bigint;
  avg_wind_speed: number | null;
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
      select: { id: true },
    });

    // Leeres Ergebnis wenn keine Turbinen gefunden
    if (turbines.length === 0) {
      return NextResponse.json({
        data: DIRECTION_SECTORS.map((s) => ({
          direction: s.label,
          directionDeg: s.deg,
          total: 0,
          speedRanges: SPEED_RANGES.map((r) => ({ range: r, count: 0 })),
        })),
        meta: {
          totalMeasurements: 0,
          avgWindSpeed: 0,
          dominantDirection: "N",
        },
      });
    }

    const turbineIds = turbines.map((t) => t.id);

    // --- WHERE-Fragmente aufbauen ---
    const baseConditions = Prisma.sql`
      "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "windDirection" IS NOT NULL
      AND "windSpeedMs" IS NOT NULL
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

    // --- Windrose Query: Richtungssektoren x Geschwindigkeitsbereiche ---
    const rows = await prisma.$queryRaw<WindRoseRow[]>`
      SELECT
        CASE
          WHEN "windDirection" >= 348.75 OR "windDirection" < 11.25 THEN 'N'
          WHEN "windDirection" >= 11.25 AND "windDirection" < 33.75 THEN 'NNE'
          WHEN "windDirection" >= 33.75 AND "windDirection" < 56.25 THEN 'NE'
          WHEN "windDirection" >= 56.25 AND "windDirection" < 78.75 THEN 'ENE'
          WHEN "windDirection" >= 78.75 AND "windDirection" < 101.25 THEN 'E'
          WHEN "windDirection" >= 101.25 AND "windDirection" < 123.75 THEN 'ESE'
          WHEN "windDirection" >= 123.75 AND "windDirection" < 146.25 THEN 'SE'
          WHEN "windDirection" >= 146.25 AND "windDirection" < 168.75 THEN 'SSE'
          WHEN "windDirection" >= 168.75 AND "windDirection" < 191.25 THEN 'S'
          WHEN "windDirection" >= 191.25 AND "windDirection" < 213.75 THEN 'SSW'
          WHEN "windDirection" >= 213.75 AND "windDirection" < 236.25 THEN 'SW'
          WHEN "windDirection" >= 236.25 AND "windDirection" < 258.75 THEN 'WSW'
          WHEN "windDirection" >= 258.75 AND "windDirection" < 281.25 THEN 'W'
          WHEN "windDirection" >= 281.25 AND "windDirection" < 303.75 THEN 'WNW'
          WHEN "windDirection" >= 303.75 AND "windDirection" < 326.25 THEN 'NW'
          WHEN "windDirection" >= 326.25 AND "windDirection" < 348.75 THEN 'NNW'
        END AS direction_sector,
        CASE
          WHEN "windSpeedMs" < 3 THEN '0-3'
          WHEN "windSpeedMs" < 6 THEN '3-6'
          WHEN "windSpeedMs" < 9 THEN '6-9'
          WHEN "windSpeedMs" < 12 THEN '9-12'
          WHEN "windSpeedMs" < 15 THEN '12-15'
          ELSE '15+'
        END AS speed_range,
        COUNT(*) AS count
      FROM scada_measurements
      WHERE ${whereClause}
      GROUP BY direction_sector, speed_range
      ORDER BY direction_sector, speed_range
    `;

    // --- Meta Query: Gesamtzahl und Durchschnittswindgeschwindigkeit ---
    const metaRows = await prisma.$queryRaw<MetaRow[]>`
      SELECT
        COUNT(*) AS total_measurements,
        AVG("windSpeedMs")::float AS avg_wind_speed
      FROM scada_measurements
      WHERE ${whereClause}
    `;

    // --- Ergebnisse aufbereiten ---
    // Lookup-Map: direction -> speed_range -> count
    const countMap = new Map<string, Map<string, number>>();
    for (const row of rows) {
      if (!row.direction_sector) continue;
      if (!countMap.has(row.direction_sector)) {
        countMap.set(row.direction_sector, new Map());
      }
      countMap.get(row.direction_sector)!.set(row.speed_range, Number(row.count));
    }

    // Totals pro Richtung berechnen (für dominantDirection)
    const directionTotals: Record<string, number> = {};
    for (const sector of DIRECTION_SECTORS) {
      const speedMap = countMap.get(sector.label);
      let total = 0;
      if (speedMap) {
        speedMap.forEach((c) => {
          total += c;
        });
      }
      directionTotals[sector.label] = total;
    }

    // Dominante Windrichtung bestimmen
    let dominantDirection = "N";
    let maxTotal = 0;
    for (const dir of Object.keys(directionTotals)) {
      const total = directionTotals[dir];
      if (total > maxTotal) {
        maxTotal = total;
        dominantDirection = dir;
      }
    }

    // Response-Daten zusammenbauen
    const data = DIRECTION_SECTORS.map((sector) => {
      const speedMap = countMap.get(sector.label);
      const total = directionTotals[sector.label] ?? 0;

      return {
        direction: sector.label,
        directionDeg: sector.deg,
        total,
        speedRanges: SPEED_RANGES.map((range) => ({
          range,
          count: speedMap?.get(range) ?? 0,
        })),
      };
    });

    const meta = metaRows[0];
    const totalMeasurements = Number(meta?.total_measurements ?? 0);
    const avgWindSpeed = meta?.avg_wind_speed
      ? Math.round(meta.avg_wind_speed * 100) / 100
      : 0;

    return NextResponse.json({
      data,
      meta: {
        totalMeasurements,
        avgWindSpeed,
        dominantDirection,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Windrosendaten");
    return NextResponse.json(
      { error: "Fehler beim Laden der Windrosendaten" },
      { status: 500 }
    );
  }
}
