import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/scada/measurements - SCADA-Messdaten abfragen
// Liefert Zeitreihen-Daten für Analyse-Charts im Frontend
//
// M-10 Perf: Cursor-Pagination unterstützt (Default-Modus: alte Charts mit
// take=10000 weiterhin funktionsfähig). Bei `?cursor=<id>` wird Cursor-Modus
// aktiviert: take: limit+1, deterministisches OrderBy auf (timestamp, id),
// Response enthält `nextCursor`.
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // --- Parameter ---
    const turbineId = searchParams.get("turbineId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const cursor = searchParams.get("cursor");
    const useCursor = !!searchParams.get("cursor") || searchParams.get("mode") === "cursor";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "10000") || 10000, 1),
      50000
    );

    // --- Validierung ---

    if (!turbineId) {
      return apiError("MISSING_FIELD", undefined, { message: "turbineId ist erforderlich" });
    }

    // Validierung: Turbine gehoert zum Tenant
    const turbine = await prisma.turbine.findFirst({
      where: {
        id: turbineId,
        park: {
          tenantId: check.tenantId!,
        },
      },
      select: { id: true, designation: true },
    });

    if (!turbine) {
      return apiError("FORBIDDEN", 404, { message: "Turbine nicht gefunden oder keine Berechtigung" });
    }

    // Where-Clause aufbauen
    const where: Prisma.ScadaMeasurementWhereInput = {
      tenantId: check.tenantId!,
      turbineId,
    };

    // Zeitraum-Filter
    const timestampFilter: Record<string, Date> = {};

    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Datum für 'from' (ISO-Format erwartet, z.B. 2025-01-01)" });
      }
      timestampFilter.gte = fromDate;
    }

    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Datum für 'to' (ISO-Format erwartet, z.B. 2025-12-31)" });
      }
      timestampFilter.lte = toDate;
    }

    if (Object.keys(timestampFilter).length > 0) {
      where.timestamp = timestampFilter;
    }

    if (useCursor) {
      // Cursor-Modus — ScadaMeasurement hat Composite PK (id, timestamp).
      // Cursor-Format: "<id>|<timestamp-iso>" damit Prisma die Composite-ID
      // findet. take: limit+1 um hasMore zu erkennen.
      let cursorClause: Prisma.ScadaMeasurementFindManyArgs["cursor"];
      if (cursor) {
        const [cId, cTs] = cursor.split("|");
        if (cId && cTs) {
          const ts = new Date(cTs);
          if (!isNaN(ts.getTime())) {
            cursorClause = { id_timestamp: { id: cId, timestamp: ts } };
          }
        }
      }

      const rows = await prisma.scadaMeasurement.findMany({
        where,
        select: {
          id: true,
          timestamp: true,
          powerW: true,
          windSpeedMs: true,
          rotorRpm: true,
          windDirection: true,
        },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
        take: limit + 1,
        ...(cursorClause ? { cursor: cursorClause, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const last = data[data.length - 1];
      const nextCursor =
        hasMore && last ? `${last.id}|${last.timestamp.toISOString()}` : null;

      return NextResponse.json({
        data,
        count: data.length,
        nextCursor,
      });
    }

    // Backward-Compat: klassische Variante (alte Charts/Frontend).
    const measurements = await prisma.scadaMeasurement.findMany({
      where,
      select: {
        timestamp: true,
        powerW: true,
        windSpeedMs: true,
        rotorRpm: true,
        windDirection: true,
      },
      orderBy: {
        timestamp: "asc",
      },
      take: limit,
    });

    return NextResponse.json({
      data: measurements,
      count: measurements.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Messdaten");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der SCADA-Messdaten" });
  }
}
