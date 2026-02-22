import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/measurements - SCADA-Messdaten abfragen
// Liefert Zeitreihen-Daten fuer Analyse-Charts im Frontend
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

    // --- Validierung ---

    if (!turbineId) {
      return NextResponse.json(
        { error: "turbineId ist erforderlich" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Turbine nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Where-Clause aufbauen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
      tenantId: check.tenantId!,
      turbineId,
    };

    // Zeitraum-Filter
    const timestampFilter: Record<string, Date> = {};

    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return NextResponse.json(
          { error: "Ungueltiges Datum fuer 'from' (ISO-Format erwartet, z.B. 2025-01-01)" },
          { status: 400 }
        );
      }
      timestampFilter.gte = fromDate;
    }

    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: "Ungueltiges Datum fuer 'to' (ISO-Format erwartet, z.B. 2025-12-31)" },
          { status: 400 }
        );
      }
      timestampFilter.lte = toDate;
    }

    if (Object.keys(timestampFilter).length > 0) {
      where.timestamp = timestampFilter;
    }

    // Daten abfragen mit Limit
    const measurements = await prisma.scadaMeasurement.findMany({
      where,
      orderBy: {
        timestamp: "asc",
      },
      take: 10000,
    });

    return NextResponse.json({
      data: measurements,
      count: measurements.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Messdaten");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Messdaten" },
      { status: 500 }
    );
  }
}
