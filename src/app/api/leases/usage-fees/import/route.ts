import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { importHistoricalSettlementSchema } from "@/types/billing";
import { Decimal } from "@prisma/client/runtime/library";

// =============================================================================
// POST /api/leases/usage-fees/import - Import historical settlement (CLOSED)
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const body = await request.json();

    // Validate request body
    const parsed = importHistoricalSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { parkId, year, totalParkRevenueEur, actualFeeEur, usedMinimum, items } =
      parsed.data;

    // Check park exists and belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Check no existing settlement for same park+year
    const existing = await prisma.leaseRevenueSettlement.findFirst({
      where: {
        parkId,
        year,
        tenantId: check.tenantId!,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Für diesen Park und dieses Jahr existiert bereits eine Abrechnung",
        },
        { status: 409 }
      );
    }

    // Create settlement + items in a transaction
    const settlement = await prisma.$transaction(async (tx) => {
      // Create the settlement with status CLOSED (historical import)
      const created = await tx.leaseRevenueSettlement.create({
        data: {
          tenantId: check.tenantId!,
          parkId,
          year,
          status: "CLOSED",
          totalParkRevenueEur: new Decimal(totalParkRevenueEur),
          revenueSharePercent: new Decimal(0),
          calculatedFeeEur: new Decimal(actualFeeEur),
          minimumGuaranteeEur: new Decimal(0),
          actualFeeEur: new Decimal(actualFeeEur),
          usedMinimum,
          weaStandortTotalEur: new Decimal(0),
          poolAreaTotalEur: new Decimal(0),
          totalWEACount: 0,
          totalPoolAreaSqm: new Decimal(0),
          calculationDetails: {
            importedAt: new Date().toISOString(),
            importedBy: check.userId,
            type: "HISTORICAL_IMPORT",
          },
          createdById: check.userId,
        },
      });

      // Create settlement items
      for (const item of items) {
        await tx.leaseRevenueSettlementItem.create({
          data: {
            settlementId: created.id,
            leaseId: item.leaseId,
            lessorPersonId: item.lessorPersonId,
            plotSummary: [],
            poolAreaSqm: new Decimal(0),
            poolAreaSharePercent: new Decimal(0),
            poolFeeEur: new Decimal(0),
            turbineCount: 0,
            standortFeeEur: new Decimal(0),
            sealedAreaSqm: new Decimal(0),
            sealedAreaRate: new Decimal(0),
            sealedAreaFeeEur: new Decimal(0),
            roadUsageFeeEur: new Decimal(0),
            cableFeeEur: new Decimal(0),
            subtotalEur: new Decimal(item.subtotalEur),
            taxableAmountEur: new Decimal(item.taxableAmountEur),
            exemptAmountEur: new Decimal(item.exemptAmountEur),
            advancePaidEur: new Decimal(item.subtotalEur),
            remainderEur: new Decimal(0),
          },
        });
      }

      // Return the full settlement with relations
      return tx.leaseRevenueSettlement.findUnique({
        where: { id: created.id },
        include: {
          park: {
            select: {
              id: true,
              name: true,
              shortName: true,
            },
          },
          items: {
            include: {
              lessorPerson: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  companyName: true,
                },
              },
              lease: {
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
            orderBy: { lessorPerson: { lastName: "asc" } },
          },
        },
      });
    });

    return NextResponse.json(serializePrisma(settlement), { status: 201 });
  } catch (error) {
    logger.error(
      { err: error },
      "Error importing historical lease revenue settlement"
    );
    return NextResponse.json(
      { error: "Fehler beim Importieren der historischen Abrechnung" },
      { status: 500 }
    );
  }
}
