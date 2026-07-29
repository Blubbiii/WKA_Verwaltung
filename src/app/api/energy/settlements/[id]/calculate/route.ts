import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Decimal } from "@prisma/client-runtime-utils";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// Typen für Berechnungsdetails
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

/** Turbine, die nicht in die Verteilung eingeflossen ist — wird im Response ausgewiesen */
interface SkippedTurbine {
  turbineId: string;
  turbineDesignation: string;
  reason: "NO_OPERATOR" | "UNCONFIRMED_PRODUCTION" | "NO_PRODUCTION";
  message: string;
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

    // Lade Settlement (Park-Turbinen werden nach Bestimmung des Stichtags separat geladen,
    // weil der Betreiber-Filter vom Abrechnungszeitraum abhängt).
    const settlement = await prisma.energySettlement.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true, shortName: true } },
        items: true,
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", undefined, { message: "Stromabrechnung nicht gefunden" });
    }

    // Tenant-Check
    if (settlement.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Status-Check: Nur DRAFT kann berechnet werden
    if (settlement.status !== "DRAFT") {
      return apiError("BAD_REQUEST", undefined, { message: "Nur Entwuerfe können berechnet werden", details: `Aktuelle Status: ${settlement.status}` });
    }

    // Defense-in-depth: Neuberechnung löscht unten ALLE Items (deleteMany). Trägt auch
    // nur ein Item eine Gutschrift, würde der GoBD-Beleglink zerreißen und
    // create-invoices könnte einen zweiten Satz Gutschriften erzeugen.
    if (settlement.items.some((it) => it.invoiceId !== null)) {
      return apiError("BAD_REQUEST", undefined, { message: "Neuberechnung nicht möglich", details: "Zu dieser Abrechnung existieren bereits Gutschriften. Bitte zuerst die Gutschriften stornieren." });
    }

    // -------------------------------------------------------------------------
    // FIX P1-5: Betreiber STICHTAGSBEZOGEN ermitteln.
    // Vorher: `validTo: null` → immer der HEUTIGE Betreiber. Bei einer rückwirkend
    // berechneten Abrechnung (z. B. 01/2026, berechnet im März nach Betreiberwechsel
    // zum 01.03.) bekam der neue Betreiber die Gutschrift für einen Zeitraum, in dem
    // der alte Betreiber die Anlage betrieben hat.
    // Stichtag analog energy-calculator.ts: Monatsmitte bzw. Jahresende.
    // -------------------------------------------------------------------------
    const referenceDate = settlement.month
      ? new Date(settlement.year, settlement.month - 1, 15)
      : new Date(settlement.year, 11, 31);

    const operatorAtReferenceDate = {
      status: "ACTIVE" as const,
      validFrom: { lte: referenceDate },
      OR: [{ validTo: null }, { validTo: { gt: referenceDate } }],
    };

    // Sammle Produktionsdaten für den Abrechnungszeitraum.
    // FIX P1-6: Der Status wird NICHT in der Query gefiltert, sondern danach ausgewertet —
    // so können wir ungeprüfte (DRAFT) Zeilen im Response als Warnung ausweisen statt
    // sie still in die Verteilung einfließen zu lassen.
    const productionWhere: Prisma.TurbineProductionWhereInput = {
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
              where: operatorAtReferenceDate,
              orderBy: { validFrom: "desc" },
              take: 1,
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

    // FIX P1-6: übersprungene Turbinen werden gesammelt und im Response gemeldet —
    // vorher nur `logger.warn`, der Aufrufer bekam "Berechnung erfolgreich" zurück.
    const skippedTurbines: SkippedTurbine[] = [];
    const skippedTurbineIds = new Set<string>();

    const addSkipped = (t: SkippedTurbine) => {
      if (skippedTurbineIds.has(`${t.turbineId}:${t.reason}`)) return;
      skippedTurbineIds.add(`${t.turbineId}:${t.reason}`);
      skippedTurbines.push(t);
    };

    for (const prod of productions) {
      const turbineId = prod.turbineId;

      // FIX P1-6: Nur geprüfte Produktionsdaten sind Verteilungsgrundlage
      // (identisch zu energy-calculator.ts). DRAFT = noch nicht bestätigt.
      if (prod.status !== "CONFIRMED" && prod.status !== "INVOICED") {
        addSkipped({
          turbineId,
          turbineDesignation: prod.turbine.designation,
          reason: "UNCONFIRMED_PRODUCTION",
          message: `Produktionsdaten haben Status ${prod.status} und wurden nicht berücksichtigt. Bitte zuerst bestätigen.`,
        });
        continue;
      }

      const existing = turbineProductionMap.get(turbineId);
      const productionKwh = Number(prod.productionKwh);

      // Betreiber zum Stichtag des Abrechnungszeitraums
      const currentOperator = prod.turbine.operatorHistory[0];
      if (!currentOperator) {
        logger.warn(
          { turbineId, referenceDate: referenceDate.toISOString() },
          `Turbine ${prod.turbine.designation} hat zum Stichtag keinen aktiven Betreiber`,
        );
        addSkipped({
          turbineId,
          turbineDesignation: prod.turbine.designation,
          reason: "NO_OPERATOR",
          message: `Kein aktiver Betreiber zum Stichtag ${referenceDate.toLocaleDateString("de-DE")} — Anlage wurde nicht berücksichtigt.`,
        });
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

    // Turbinen, die zwar berücksichtigt werden konnten, aber auch übersprungene
    // Monate hatten, sind kein Fehler — nur echte Ausfälle bleiben stehen.
    const relevantSkipped = skippedTurbines.filter(
      (s) => !turbineProductionMap.has(s.turbineId),
    );

    if (turbineProductionMap.size === 0) {
      const unconfirmed = skippedTurbines.filter(
        (s) => s.reason === "UNCONFIRMED_PRODUCTION",
      ).length;
      return apiError("BAD_REQUEST", undefined, {
        message: "Keine verwertbaren Produktionsdaten gefunden",
        details:
          unconfirmed > 0
            ? `Für den Zeitraum ${settlement.month ? `${settlement.month}/` : ""}${settlement.year} liegen nur unbestätigte Produktionsdaten vor (${unconfirmed} Anlagen im Status DRAFT). Bitte zuerst bestätigen.`
            : `Für den Zeitraum ${settlement.month ? `${settlement.month}/` : ""}${settlement.year} wurden keine bestätigten Produktionsdaten erfasst.`,
      });
    }

    // Berechne Gesamtproduktion
    const totalProductionKwh = Array.from(turbineProductionMap.values())
      .reduce((sum, t) => sum + t.totalKwh, 0);

    const netOperatorRevenueEur = Number(settlement.netOperatorRevenueEur);
    const pricePerKwh = totalProductionKwh > 0 ? netOperatorRevenueEur / totalProductionKwh : 0;
    const averageProductionKwh = totalProductionKwh / turbineProductionMap.size;

    // Turbine-Daten für Berechnung
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
            // Ausserhalb: nur den Teil über der Toleranz ausgleichen
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
        return apiError("BAD_REQUEST", undefined, { message: "Unbekannter Verteilungsmodus" });
    }

    // FIX: Rundungsfehler ausgleichen — die Summe der auf 2 Nachkommastellen gerundeten
    // revenueShareEur-Werte weicht i.d.R. um bis zu N*0.005 EUR vom Netto-Betrag ab.
    // Wir korrigieren die Differenz auf das LETZTE Item (Delta-Correction), damit die
    // Item-Summe exakt netOperatorRevenueEur entspricht.
    if (itemsData.length > 0) {
      const target = new Decimal(netOperatorRevenueEur).toDecimalPlaces(2);
      const summedExceptLast = itemsData
        .slice(0, -1)
        .reduce((s, it) => s.add(new Decimal(it.revenueShareEur)), new Decimal(0));
      const lastRevenueShare = target.sub(summedExceptLast).toDecimalPlaces(2);
      itemsData[itemsData.length - 1].revenueShareEur = lastRevenueShare.toNumber();
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

    // Transaktion: Alte Items löschen, neue erstellen, Status aktualisieren
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
          averageProductionKwh: item.averageProductionKwh !== undefined && item.averageProductionKwh !== null
            ? new Decimal(item.averageProductionKwh)
            : null,
          // FIX: explizit-null-Check — truthy-Check hätte `0` fälschlich zu `null` konvertiert
          // (relevant z. B. wenn deviationKwh oder toleranceAdjustment exakt 0 sind).
          deviationKwh: item.deviationKwh !== undefined && item.deviationKwh !== null
            ? new Decimal(item.deviationKwh)
            : null,
          toleranceAdjustment: item.toleranceAdjustment !== undefined && item.toleranceAdjustment !== null
            ? new Decimal(item.toleranceAdjustment)
            : null,
        })),
      });

      // Update Settlement mit Berechnungsdetails und Status
      return tx.energySettlement.update({
        where: { id },
        data: {
          totalProductionKwh: new Decimal(totalProductionKwh),
          // structuredClone is ~2x faster than JSON.parse(JSON.stringify(...))
          calculationDetails: structuredClone(calculationDetails) as unknown as Prisma.InputJsonValue,
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
      message:
        relevantSkipped.length > 0
          ? `Berechnung durchgeführt — ${relevantSkipped.length} Anlage(n) wurden NICHT berücksichtigt`
          : "Berechnung erfolgreich durchgeführt",
      settlement: updatedSettlement,
      calculation: calculationDetails,
      // FIX P1-6: übersprungene Anlagen sind Teil des Ergebnisses, nicht nur ein Logeintrag.
      warnings: {
        skippedTurbines: relevantSkipped,
        skippedTurbineCount: relevantSkipped.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error calculating settlement");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler bei der Berechnung der Stromabrechnung" });
  }
}
