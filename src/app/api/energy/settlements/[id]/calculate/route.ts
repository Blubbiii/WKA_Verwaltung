import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Typen fuer Berechnungsdetails
// =============================================================================

interface TurbineProductionData {
  turbineId: string;
  turbineDesignation: string;
  operatorFundId: string;
  operatorFundName: string;
  productionKwh: number;
  productionSharePct: number;
}

interface CalculationDetails {
  mode: string;
  timestamp: string;
  averageProductionKwh: number;
  totalProductionKwh: number;
  netOperatorRevenueEur: number;
  pricePerKwh: number;
  turbineData: TurbineProductionData[];
  distributionSteps: {
    step: string;
    description: string;
    values: Record<string, number>;
  }[];
}

interface SettlementItemData {
  energySettlementId: string;
  recipientFundId: string;
  turbineId: string | null;
  productionShareKwh: number;
  productionSharePct: number;
  revenueShareEur: number;
  distributionKey: string;
  averageProductionKwh: number | null;
  deviationKwh: number | null;
  toleranceAdjustment: number | null;
}

// =============================================================================
// POST /api/energy/settlements/[id]/calculate - Verteilung berechnen
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Lade Settlement mit Park und Turbinen
    const settlement = await prisma.energySettlement.findUnique({
      where: { id },
      include: {
        park: {
          include: {
            turbines: {
              where: { status: "ACTIVE" },
              include: {
                operatorHistory: {
                  where: {
                    status: "ACTIVE",
                    validTo: null, // Nur aktuelle Betreiber
                  },
                  include: {
                    operatorFund: {
                      select: {
                        id: true,
                        name: true,
                        fundCategory: { select: { id: true, name: true, code: true, color: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        items: true,
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Stromabrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant-Check
    if (settlement.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Status-Check: Nur DRAFT kann berechnet werden
    if (settlement.status !== "DRAFT") {
      return NextResponse.json(
        {
          error: "Nur Entwuerfe koennen berechnet werden",
          details: `Aktuelle Status: ${settlement.status}`,
        },
        { status: 400 }
      );
    }

    // Sammle Produktionsdaten fuer den Abrechnungszeitraum
    const productionWhere: Record<string, unknown> = {
      tenantId: check.tenantId!,
      year: settlement.year,
      turbine: {
        parkId: settlement.parkId,
      },
    };

    if (settlement.month) {
      productionWhere.month = settlement.month;
    }

    const productions = await prisma.turbineProduction.findMany({
      where: productionWhere,
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            operatorHistory: {
              where: {
                status: "ACTIVE",
                validTo: null,
              },
              include: {
                operatorFund: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aggregiere Produktion pro Turbine
    const turbineProductionMap = new Map<string, {
      turbineId: string;
      turbineDesignation: string;
      operatorFundId: string;
      operatorFundName: string;
      totalKwh: number;
    }>();

    for (const prod of productions) {
      const turbineId = prod.turbineId;
      const existing = turbineProductionMap.get(turbineId);
      const productionKwh = Number(prod.productionKwh);

      // Hole aktuellen Betreiber
      const currentOperator = prod.turbine.operatorHistory[0];
      if (!currentOperator) {
        logger.warn(`Turbine ${prod.turbine.designation} hat keinen aktiven Betreiber`);
        continue;
      }

      if (existing) {
        existing.totalKwh += productionKwh;
      } else {
        turbineProductionMap.set(turbineId, {
          turbineId,
          turbineDesignation: prod.turbine.designation,
          operatorFundId: currentOperator.operatorFundId,
          operatorFundName: currentOperator.operatorFund.name,
          totalKwh: productionKwh,
        });
      }
    }

    if (turbineProductionMap.size === 0) {
      return NextResponse.json(
        {
          error: "Keine Produktionsdaten gefunden",
          details: `Fuer den Zeitraum ${settlement.month ? `${settlement.month}/` : ""}${settlement.year} wurden keine Produktionsdaten erfasst.`,
        },
        { status: 400 }
      );
    }

    // Berechne Gesamtproduktion
    const totalProductionKwh = Array.from(turbineProductionMap.values())
      .reduce((sum, t) => sum + t.totalKwh, 0);

    const netOperatorRevenueEur = Number(settlement.netOperatorRevenueEur);
    const pricePerKwh = totalProductionKwh > 0 ? netOperatorRevenueEur / totalProductionKwh : 0;
    const averageProductionKwh = totalProductionKwh / turbineProductionMap.size;

    // Turbine-Daten fuer Berechnung
    const turbineData: TurbineProductionData[] = Array.from(turbineProductionMap.values())
      .map((t) => ({
        turbineId: t.turbineId,
        turbineDesignation: t.turbineDesignation,
        operatorFundId: t.operatorFundId,
        operatorFundName: t.operatorFundName,
        productionKwh: t.totalKwh,
        productionSharePct: (t.totalKwh / totalProductionKwh) * 100,
      }));

    // Berechnung basierend auf distributionMode
    const itemsData: SettlementItemData[] = [];
    const distributionSteps: CalculationDetails["distributionSteps"] = [];

    switch (settlement.distributionMode) {
      case "PROPORTIONAL":
        // Direkte Aufteilung nach kWh-Anteil
        distributionSteps.push({
          step: "1",
          description: "Proportionale Verteilung nach Produktionsanteil",
          values: { pricePerKwh },
        });

        for (const t of turbineData) {
          const revenueShare = (t.productionKwh / totalProductionKwh) * netOperatorRevenueEur;
          itemsData.push({
            energySettlementId: id,
            recipientFundId: t.operatorFundId,
            turbineId: t.turbineId,
            productionShareKwh: t.productionKwh,
            productionSharePct: t.productionSharePct,
            revenueShareEur: Math.round(revenueShare * 100) / 100,
            distributionKey: `PROPORTIONAL: ${t.productionSharePct.toFixed(2)}%`,
            averageProductionKwh: null,
            deviationKwh: null,
            toleranceAdjustment: null,
          });
        }
        break;

      case "SMOOTHED":
        // Geglaettete Verteilung - Ausgleich von Standortunterschieden
        const smoothingFactor = settlement.smoothingFactor
          ? Number(settlement.smoothingFactor)
          : 0.5; // Default: 50% Glaettung

        distributionSteps.push({
          step: "1",
          description: "Berechne Durchschnittsproduktion",
          values: { averageProductionKwh },
        });

        distributionSteps.push({
          step: "2",
          description: `Glaettungsfaktor: ${(smoothingFactor * 100).toFixed(0)}%`,
          values: { smoothingFactor },
        });

        for (const t of turbineData) {
          // Mische tatsaechliche mit Durchschnittsproduktion
          const smoothedKwh = (t.productionKwh * (1 - smoothingFactor)) +
            (averageProductionKwh * smoothingFactor);
          const smoothedSharePct = (smoothedKwh / totalProductionKwh) * turbineData.length * 100;
          const revenueShare = (smoothedKwh / (totalProductionKwh * (1 - smoothingFactor) + averageProductionKwh * turbineData.length * smoothingFactor)) * netOperatorRevenueEur;
          const deviation = t.productionKwh - averageProductionKwh;

          itemsData.push({
            energySettlementId: id,
            recipientFundId: t.operatorFundId,
            turbineId: t.turbineId,
            productionShareKwh: t.productionKwh,
            productionSharePct: t.productionSharePct,
            revenueShareEur: Math.round(revenueShare * 100) / 100,
            distributionKey: `SMOOTHED: ${smoothedSharePct.toFixed(2)}% (gegl.)`,
            averageProductionKwh,
            deviationKwh: deviation,
            toleranceAdjustment: null,
          });
        }
        break;

      case "TOLERATED":
        // Mit Duldung - kleine Abweichungen werden ignoriert
        const tolerancePct = settlement.tolerancePercentage
          ? Number(settlement.tolerancePercentage)
          : 5; // Default: 5% Toleranz

        distributionSteps.push({
          step: "1",
          description: "Berechne Durchschnittsproduktion",
          values: { averageProductionKwh },
        });

        distributionSteps.push({
          step: "2",
          description: `Toleranzgrenze: +/- ${tolerancePct.toFixed(1)}%`,
          values: { tolerancePct },
        });

        const toleranceKwh = averageProductionKwh * (tolerancePct / 100);

        for (const t of turbineData) {
          const deviation = t.productionKwh - averageProductionKwh;
          let adjustedKwh = t.productionKwh;
          let toleranceAdjustment = 0;

          // Innerhalb der Toleranz: verwende Durchschnitt
          if (Math.abs(deviation) <= toleranceKwh) {
            adjustedKwh = averageProductionKwh;
          } else {
            // Ausserhalb: nur den Teil ueber der Toleranz ausgleichen
            if (deviation > 0) {
              adjustedKwh = averageProductionKwh + toleranceKwh;
              toleranceAdjustment = (deviation - toleranceKwh) * pricePerKwh;
            } else {
              adjustedKwh = averageProductionKwh - toleranceKwh;
              toleranceAdjustment = (deviation + toleranceKwh) * pricePerKwh;
            }
          }

          const revenueShare = (adjustedKwh / (averageProductionKwh * turbineData.length)) * netOperatorRevenueEur;

          itemsData.push({
            energySettlementId: id,
            recipientFundId: t.operatorFundId,
            turbineId: t.turbineId,
            productionShareKwh: t.productionKwh,
            productionSharePct: t.productionSharePct,
            revenueShareEur: Math.round(revenueShare * 100) / 100,
            distributionKey: `TOLERATED: ${Math.abs(deviation) <= toleranceKwh ? "innerhalb" : "ausserhalb"} Toleranz`,
            averageProductionKwh,
            deviationKwh: deviation,
            toleranceAdjustment: Math.round(toleranceAdjustment * 100) / 100,
          });
        }
        break;

      default:
        return NextResponse.json(
          { error: "Unbekannter Verteilungsmodus" },
          { status: 400 }
        );
    }

    // Berechungsdetails zusammenstellen
    const calculationDetails: CalculationDetails = {
      mode: settlement.distributionMode,
      timestamp: new Date().toISOString(),
      averageProductionKwh,
      totalProductionKwh,
      netOperatorRevenueEur,
      pricePerKwh,
      turbineData,
      distributionSteps,
    };

    // Transaktion: Alte Items loeschen, neue erstellen, Status aktualisieren
    const updatedSettlement = await prisma.$transaction(async (tx) => {
      // Loesche alte Items
      await tx.energySettlementItem.deleteMany({
        where: { energySettlementId: id },
      });

      // Erstelle neue Items
      await tx.energySettlementItem.createMany({
        data: itemsData.map((item) => ({
          energySettlementId: item.energySettlementId,
          recipientFundId: item.recipientFundId,
          turbineId: item.turbineId,
          productionShareKwh: new Decimal(item.productionShareKwh),
          productionSharePct: new Decimal(item.productionSharePct),
          revenueShareEur: new Decimal(item.revenueShareEur),
          distributionKey: item.distributionKey,
          averageProductionKwh: item.averageProductionKwh ? new Decimal(item.averageProductionKwh) : null,
          deviationKwh: item.deviationKwh ? new Decimal(item.deviationKwh) : null,
          toleranceAdjustment: item.toleranceAdjustment ? new Decimal(item.toleranceAdjustment) : null,
        })),
      });

      // Update Settlement mit Berechnungsdetails und Status
      return tx.energySettlement.update({
        where: { id },
        data: {
          totalProductionKwh: new Decimal(totalProductionKwh),
          calculationDetails: JSON.parse(JSON.stringify(calculationDetails)) as Prisma.InputJsonValue,
          status: "CALCULATED",
        },
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
              recipientFund: {
                select: {
                  id: true,
                  name: true,
                  fundCategory: { select: { id: true, name: true, code: true, color: true } },
                },
              },
              turbine: {
                select: {
                  id: true,
                  designation: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    return NextResponse.json({
      message: "Berechnung erfolgreich durchgefuehrt",
      settlement: updatedSettlement,
      calculation: calculationDetails,
    });
  } catch (error) {
    logger.error({ err: error }, "Error calculating settlement");
    return NextResponse.json(
      { error: "Fehler bei der Berechnung der Stromabrechnung" },
      { status: 500 }
    );
  }
}
