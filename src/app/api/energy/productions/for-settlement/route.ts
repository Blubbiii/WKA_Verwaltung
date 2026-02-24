import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/productions/for-settlement
// Aggregiert Produktionsdaten für eine Stromabrechnung
//
// Query-Parameter:
//   parkId (required) - UUID des Windparks
//   year   (required) - Abrechnungsjahr (z.B. 2025)
//   month  (optional) - Abrechnungsmonat (1-12, leer = Jahresabrechnung)
//   status (optional) - Nur Produktionen mit diesem Status (default: DRAFT)
//
// Gibt zurück:
//   - totalProductionKwh: Summe aller Turbinen-Produktionen
//   - totalRevenueEur: Summe aller Erlöse (falls gepflegt)
//   - productions: Liste der einzelnen TurbineProduction-Einträge
//   - turbineCount: Anzahl der Turbinen mit Daten
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Pflicht-Parameter
    const parkId = searchParams.get("parkId");
    const yearStr = searchParams.get("year");

    if (!parkId || !yearStr) {
      return NextResponse.json(
        { error: "Parameter parkId und year sind erforderlich" },
        { status: 400 }
      );
    }

    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100)" },
        { status: 400 }
      );
    }

    // Optionale Parameter
    const monthStr = searchParams.get("month");
    const month = monthStr ? parseInt(monthStr, 10) : null;
    if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
      return NextResponse.json(
        { error: "Ungültiger Monat (1-12)" },
        { status: 400 }
      );
    }

    const status = searchParams.get("status") || "DRAFT";
    if (!["DRAFT", "CONFIRMED", "INVOICED"].includes(status)) {
      return NextResponse.json(
        { error: "Ungültiger Status (DRAFT, CONFIRMED, INVOICED)" },
        { status: 400 }
      );
    }

    // Park-Zugehoerigkeit prüfen
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        shortName: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Where-Clause für TurbineProduction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId: check.tenantId!,
      year,
      status,
      turbine: {
        parkId,
      },
    };

    // Bei Monatsabrechnung: bestimmten Monat filtern
    // Bei Jahresabrechnung: alle Monate des Jahres
    if (month !== null) {
      where.month = month;
    }

    // Produktionsdaten laden
    const productions = await prisma.turbineProduction.findMany({
      where,
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            ratedPowerKw: true,
          },
        },
      },
      orderBy: [
        { turbine: { designation: "asc" } },
        { month: "asc" },
      ],
    });

    // Aggregationen berechnen
    const totalProductionKwh = productions.reduce(
      (sum, p) => sum + Number(p.productionKwh),
      0
    );

    // Unique Turbinen zaehlen
    const uniqueTurbineIds = new Set(productions.map((p) => p.turbineId));

    // Zusammenfassung pro Turbine (für UI-Anzeige)
    const turbineSummary: Record<
      string,
      {
        turbineId: string;
        designation: string;
        totalKwh: number;
        recordCount: number;
      }
    > = {};

    for (const p of productions) {
      if (!turbineSummary[p.turbineId]) {
        turbineSummary[p.turbineId] = {
          turbineId: p.turbineId,
          designation: p.turbine.designation,
          totalKwh: 0,
          recordCount: 0,
        };
      }
      turbineSummary[p.turbineId].totalKwh += Number(p.productionKwh);
      turbineSummary[p.turbineId].recordCount += 1;
    }

    return NextResponse.json({
      park,
      year,
      month,
      status,
      totalProductionKwh,
      turbineCount: uniqueTurbineIds.size,
      recordCount: productions.length,
      turbineSummary: Object.values(turbineSummary),
      productions: productions.map((p) => ({
        id: p.id,
        turbineId: p.turbineId,
        turbineDesignation: p.turbine.designation,
        year: p.year,
        month: p.month,
        productionKwh: Number(p.productionKwh),
        operatingHours: p.operatingHours ? Number(p.operatingHours) : null,
        availabilityPct: p.availabilityPct ? Number(p.availabilityPct) : null,
        status: p.status,
        source: p.source,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching productions for settlement");
    return NextResponse.json(
      { error: "Fehler beim Laden der Produktionsdaten für Abrechnung" },
      { status: 500 }
    );
  }
}
