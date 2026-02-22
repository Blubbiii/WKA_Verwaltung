import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/comparison
// Vergleicht SCADA-gemessene Produktion mit gemeldeter/abgerechneter Produktion
// aus TurbineProduction. Nutzt SQL-Aggregation fuer effiziente Berechnung.
// =============================================================================

/**
 * Berechnet die erwartete Anzahl an 10-Minuten-Datenpunkten fuer einen Monat.
 * Formel: Tage im Monat * 24 Stunden * 6 Intervalle pro Stunde
 */
function expectedDataPoints(year: number, month: number): number {
  // new Date(year, month, 0) gibt den letzten Tag des Vormonats zurueck,
  // also new Date(year, month, 0).getDate() = Tage im Monat 'month'
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth * 24 * 6;
}

/** Ergebnis-Typ fuer die SCADA-Aggregation per SQL */
interface ScadaAggRow {
  turbineId: string;
  month: number;
  scada_kwh: Prisma.Decimal | null;
  data_points: bigint;
}

export async function GET(request: NextRequest) {
  try {
    // --- Auth & Permission ---
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    // --- Query-Parameter ---
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");

    // --- Validierung ---
    if (!yearParam) {
      return NextResponse.json(
        { error: "Parameter 'year' ist erforderlich" },
        { status: 400 }
      );
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungueltiges Jahr (erwartet: 2000-2100)" },
        { status: 400 }
      );
    }

    // Optional: turbineId validieren (gehoert zum Tenant?)
    if (turbineId) {
      const turbine = await prisma.turbine.findFirst({
        where: {
          id: turbineId,
          park: { tenantId },
        },
        select: { id: true },
      });
      if (!turbine) {
        return NextResponse.json(
          { error: "Turbine nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }
    }

    // Optional: parkId validieren (gehoert zum Tenant?)
    if (parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: parkId,
          tenantId,
        },
        select: { id: true },
      });
      if (!park) {
        return NextResponse.json(
          { error: "Park nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }
    }

    // --- Zeitraum fuer SCADA-Abfrage ---
    const startOfYear = new Date(Date.UTC(year, 0, 1)); // 1. Januar 00:00 UTC
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1)); // 1. Januar naechstes Jahr

    // --- Turbine-IDs ermitteln (gefiltert nach Park/Turbine und Tenant) ---
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
      orderBy: [
        { park: { name: "asc" } },
        { designation: "asc" },
      ],
    });

    if (turbines.length === 0) {
      return NextResponse.json({
        data: [],
        summary: {
          totalScadaKwh: 0,
          totalReportedKwh: 0,
          totalDeltaKwh: 0,
          totalDeltaPercent: 0,
        },
      });
    }

    const turbineIds = turbines.map((t) => t.id);

    // Turbine-Lookup-Map fuer schnellen Zugriff
    const turbineMap = new Map(
      turbines.map((t) => [
        t.id,
        { designation: t.designation, parkName: t.park.name, parkId: t.park.id },
      ])
    );

    // --- SCADA-Aggregation via Raw SQL ---
    // Berechnung: powerW (Watt) * 10min / 60min / 1000 = kWh pro Intervall
    // SUM ergibt monatliche kWh-Summe aus 10-Minuten-Intervallen
    const scadaRows = await prisma.$queryRaw<ScadaAggRow[]>`
      SELECT
        "turbineId",
        EXTRACT(MONTH FROM "timestamp")::int as month,
        SUM("powerW" * 10.0 / 60.0 / 1000.0) as scada_kwh,
        COUNT(*) as data_points
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "powerW" IS NOT NULL
        AND "timestamp" >= ${startOfYear}
        AND "timestamp" < ${startOfNextYear}
        AND "turbineId" IN (${Prisma.join(turbineIds)})
      GROUP BY "turbineId", EXTRACT(MONTH FROM "timestamp")
      ORDER BY "turbineId", month
    `;

    // SCADA-Daten in Map: "turbineId:month" -> { scadaKwh, dataPoints }
    const scadaMap = new Map<
      string,
      { scadaKwh: number; dataPoints: number }
    >();
    for (const row of scadaRows) {
      const key = `${row.turbineId}:${row.month}`;
      scadaMap.set(key, {
        scadaKwh: row.scada_kwh ? Number(row.scada_kwh) : 0,
        dataPoints: Number(row.data_points),
      });
    }

    // --- TurbineProduction (gemeldete/abgerechnete Produktion) laden ---
    const productions = await prisma.turbineProduction.findMany({
      where: {
        tenantId,
        year,
        turbineId: { in: turbineIds },
      },
      select: {
        turbineId: true,
        month: true,
        productionKwh: true,
        source: true,
      },
      orderBy: [{ turbineId: "asc" }, { month: "asc" }],
    });

    // Reported-Daten in Map: "turbineId:month" -> kWh + source
    const reportedMap = new Map<
      string,
      { reportedKwh: number; source: string }
    >();
    for (const prod of productions) {
      const key = `${prod.turbineId}:${prod.month}`;
      const existing = reportedMap.get(key);
      if (existing) {
        existing.reportedKwh += Number(prod.productionKwh);
        // Behalte den Source-Typ der ersten Quelle (oder "MIXED" bei unterschiedlichen)
        if (existing.source !== prod.source) {
          existing.source = "MIXED";
        }
      } else {
        reportedMap.set(key, {
          reportedKwh: Number(prod.productionKwh),
          source: prod.source,
        });
      }
    }

    // --- Ergebnisse zusammenfuehren ---
    // Fuer jede Turbine und jeden Monat mit Daten (SCADA oder Reported)
    const allKeys = new Set<string>();
    for (const key of scadaMap.keys()) allKeys.add(key);
    for (const key of reportedMap.keys()) allKeys.add(key);

    interface ComparisonRow {
      turbineId: string;
      turbineDesignation: string;
      parkName: string;
      month: number;
      scadaKwh: number;
      scadaDataPoints: number;
      scadaExpectedPoints: number;
      scadaCoverage: number;
      reportedKwh: number;
      reportedSource: string | null;
      deltaKwh: number;
      deltaPercent: number;
    }

    const data: ComparisonRow[] = [];

    for (const key of allKeys) {
      const [tId, monthStr] = key.split(":");
      const month = parseInt(monthStr, 10);
      const turbineInfo = turbineMap.get(tId);
      if (!turbineInfo) continue;

      const scada = scadaMap.get(key);
      const reported = reportedMap.get(key);

      const scadaKwh = scada?.scadaKwh ?? 0;
      const scadaDataPoints = scada?.dataPoints ?? 0;
      const scadaExpected = expectedDataPoints(year, month);
      const scadaCoverage =
        scadaExpected > 0
          ? Math.round((scadaDataPoints / scadaExpected) * 10000) / 100
          : 0;

      const reportedKwh = reported?.reportedKwh ?? 0;
      const deltaKwh = scadaKwh - reportedKwh;
      const deltaPercent =
        reportedKwh !== 0
          ? Math.round((deltaKwh / reportedKwh) * 10000) / 100
          : scadaKwh !== 0
            ? 100
            : 0;

      data.push({
        turbineId: tId,
        turbineDesignation: turbineInfo.designation,
        parkName: turbineInfo.parkName,
        month,
        scadaKwh: Math.round(scadaKwh * 1000) / 1000,
        scadaDataPoints,
        scadaExpectedPoints: scadaExpected,
        scadaCoverage,
        reportedKwh: Math.round(reportedKwh * 1000) / 1000,
        reportedSource: reported?.source ?? null,
        deltaKwh: Math.round(deltaKwh * 1000) / 1000,
        deltaPercent,
      });
    }

    // Sortierung: Park -> Turbine -> Monat
    data.sort((a, b) => {
      const parkCmp = a.parkName.localeCompare(b.parkName);
      if (parkCmp !== 0) return parkCmp;
      const turbineCmp = a.turbineDesignation.localeCompare(
        b.turbineDesignation
      );
      if (turbineCmp !== 0) return turbineCmp;
      return a.month - b.month;
    });

    // --- Summary ---
    const totalScadaKwh = data.reduce((sum, row) => sum + row.scadaKwh, 0);
    const totalReportedKwh = data.reduce(
      (sum, row) => sum + row.reportedKwh,
      0
    );
    const totalDeltaKwh = totalScadaKwh - totalReportedKwh;
    const totalDeltaPercent =
      totalReportedKwh !== 0
        ? Math.round((totalDeltaKwh / totalReportedKwh) * 10000) / 100
        : totalScadaKwh !== 0
          ? 100
          : 0;

    return NextResponse.json({
      data,
      summary: {
        totalScadaKwh: Math.round(totalScadaKwh * 1000) / 1000,
        totalReportedKwh: Math.round(totalReportedKwh * 1000) / 1000,
        totalDeltaKwh: Math.round(totalDeltaKwh * 1000) / 1000,
        totalDeltaPercent,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim SCADA/Produktion-Vergleich");
    return NextResponse.json(
      { error: "Fehler beim Berechnen des SCADA/Produktion-Vergleichs" },
      { status: 500 }
    );
  }
}
