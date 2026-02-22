import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/reports - Get available report types and metadata
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    // Return available report types
    const reportTypes = [
      {
        id: "parks-overview",
        name: "Windparks Übersicht",
        description: "Übersicht aller Windparks mit Turbinen und Leistungsdaten",
        category: "Stammdaten",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "turbines-overview",
        name: "Turbinen Übersicht",
        description: "Detaillierte Auflistung aller Windkraftanlagen",
        category: "Stammdaten",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "shareholders-overview",
        name: "Gesellschafter Übersicht",
        description: "Liste aller Gesellschafter mit Beteiligungen",
        category: "Stammdaten",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "contracts-overview",
        name: "Verträge Übersicht",
        description: "Übersicht aller Verträge mit Fristenwarnung",
        category: "Verträge",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "contracts-expiring",
        name: "Auslaufende Verträge",
        description: "Verträge mit Kündigungs- oder Enddatum in den nächsten 90 Tagen",
        category: "Verträge",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "invoices-overview",
        name: "Rechnungen Übersicht",
        description: "Übersicht aller Rechnungen mit Zahlungsstatus",
        category: "Finanzen",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "votes-results",
        name: "Abstimmungsergebnisse",
        description: "Ergebnisse abgeschlossener Abstimmungen",
        category: "Abstimmungen",
        formats: ["pdf", "xlsx"],
      },
      {
        id: "fund-performance",
        name: "Gesellschafts-Performance",
        description: "Finanzielle Übersicht der Gesellschaften",
        category: "Finanzen",
        formats: ["pdf", "xlsx"],
      },
    ];

    // Get counts for quick overview
    const [parksCount, turbinesCount, shareholdersCount, contractsCount, invoicesCount] =
      await Promise.all([
        prisma.park.count({ where: { tenantId: check.tenantId! } }),
        prisma.turbine.count({
          where: { park: { tenantId: check.tenantId! } },
        }),
        prisma.shareholder.count({
          where: { fund: { tenantId: check.tenantId! } },
        }),
        prisma.contract.count({ where: { tenantId: check.tenantId! } }),
        prisma.invoice.count({ where: { tenantId: check.tenantId! } }),
      ]);

    return NextResponse.json({
      reportTypes,
      quickStats: {
        parks: parksCount,
        turbines: turbinesCount,
        shareholders: shareholdersCount,
        contracts: contractsCount,
        invoices: invoicesCount,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
