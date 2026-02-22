/**
 * Energy Settlement Calculator - Stromabrechnung mit DULDUNG-Logik
 *
 * Berechnet die Stromerloes-Verteilung fuer einen Windpark basierend auf:
 * - Netzbetreiber-Erloes (Quelle der Wahrheit)
 * - WKA-Produktionsdaten (nur als Verteilschluessel)
 * - DULDUNG/Glaettung zur Kompensation von Standortunterschieden
 *
 * WICHTIG - Abrechnungslogik:
 * - Netzbetreiber-Erloes ist die Quelle (z.B. 150.000 EUR)
 * - WKA-Produktionsdaten sind NUR der Verteilschluessel
 * - NICHT: Produktion x Preis = Erloes
 *
 * DULDUNG (SMOOTHED Mode) Formel:
 * Duldungs-Ausgleich = (Ist-Produktion - Durchschnitt) x Verguetungssatz
 * - Wenn positiv -> Abzug (WKA hat mehr als Durchschnitt produziert)
 * - Wenn negativ -> Zuschlag (WKA hat weniger als Durchschnitt produziert)
 *
 * Beispiel WP Barenburg Dezember 2025:
 * - E-821118: 551.286,3 kWh (Ist)
 * - Durchschnitt: 527.664,53 kWh
 * - Abweichung: +23.621,77 kWh
 * - Verguetungssatz: 8,18 ct/kWh
 * - DULDUNGS-ABZUG: 23.621,77 x 0,0818 = 1.932,26 EUR
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  DistributionMode,
  EnergySettlementCalculation,
  EnergyDistributionDetail,
} from "@/types/energy";

// ===========================================
// TYPES
// ===========================================

/**
 * Eingabe fuer die Stromabrechnung
 */
export interface EnergySettlementInput {
  /** ID des Parks */
  parkId: string;
  /** Abrechnungsjahr */
  year: number;
  /** Abrechnungsmonat (null = Jahresabrechnung) */
  month: number | null;
  /** Erloes vom Netzbetreiber in EUR - QUELLE DER WAHRHEIT! */
  netOperatorRevenueEur: number;
  /** Verteilungsmodus */
  distributionMode: DistributionMode;
  /** Toleranzgrenze in % fuer TOLERATED mode */
  tolerancePercentage?: number;
  /** Verguetungssatz in ct/kWh fuer DULDUNG-Berechnung */
  ratePerKwhCt?: number;
  /** Referenz/Belegnummer vom Netzbetreiber */
  netOperatorReference?: string;
  /** Tenant ID */
  tenantId: string;
}

/**
 * Ergebnis der Stromabrechnung
 */
export interface EnergySettlementResult {
  /** Gesamtproduktion in kWh */
  totalProductionKwh: number;
  /** Durchschnittliche Produktion pro WKA in kWh */
  averageProductionKwh: number;
  /** Anzahl der WKAs */
  turbineCount: number;
  /** Verteilung pro WKA/Betreiber */
  distributions: TurbineDistribution[];
  /** Detaillierte Berechnungsdaten */
  calculationDetails: EnergySettlementCalculation;
}

/**
 * Verteilung fuer eine einzelne WKA
 */
export interface TurbineDistribution {
  /** Turbine ID */
  turbineId: string;
  /** WKA-Bezeichnung (z.B. "E-821118") */
  turbineDesignation: string;
  /** Betreiber-Gesellschaft ID */
  operatorFundId: string;
  /** Betreiber-Gesellschaft Name */
  operatorFundName: string;
  /** Produktion in kWh */
  productionKwh: number;
  /** Produktionsanteil in % */
  productionSharePct: number;
  /** Basis-Erloes vor Ausgleich in EUR */
  baseRevenueEur: number;
  /** Abweichung vom Durchschnitt in kWh (positiv = ueber Durchschnitt) */
  deviationFromAverage?: number;
  /** Toleranz-Ausgleich in EUR (positiv = Abzug, negativ = Zuschlag) */
  toleranceAdjustmentEur?: number;
  /** Finaler Erloes nach Ausgleich in EUR */
  finalRevenueEur: number;
}

/**
 * Interne Produktionsdaten mit Betreiber-Info
 */
interface TurbineProductionData {
  turbineId: string;
  turbineDesignation: string;
  operatorFundId: string;
  operatorFundName: string;
  productionKwh: number;
}

// ===========================================
// MAIN CALCULATOR FUNCTION
// ===========================================

/**
 * Berechnet die Stromerloes-Verteilung fuer einen Windpark
 *
 * @param input - Eingabeparameter fuer die Berechnung
 * @returns Berechnungsergebnis mit Verteilung pro WKA/Betreiber
 *
 * @example
 * ```typescript
 * const result = await calculateEnergySettlement({
 *   parkId: "park-uuid",
 *   year: 2025,
 *   month: 12, // Dezember
 *   netOperatorRevenueEur: 150000,
 *   distributionMode: "SMOOTHED",
 *   ratePerKwhCt: 8.18,
 *   tenantId: "tenant-uuid"
 * });
 * ```
 */
export async function calculateEnergySettlement(
  input: EnergySettlementInput
): Promise<EnergySettlementResult> {
  const {
    parkId,
    year,
    month,
    netOperatorRevenueEur,
    distributionMode,
    tolerancePercentage,
    ratePerKwhCt,
    tenantId,
  } = input;

  // 1. Validierung
  if (netOperatorRevenueEur < 0) {
    throw new Error("Netzbetreiber-Erloes kann nicht negativ sein");
  }

  // 2. Lade Park und pruefe Berechtigung
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    select: { id: true, name: true, tenantId: true },
  });

  if (!park) {
    throw new Error(`Park mit ID ${parkId} nicht gefunden`);
  }

  if (park.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung fuer diesen Park");
  }

  // 3. Lade Produktionsdaten mit Betreiber-Info
  const productionData = await loadProductionData(parkId, year, month, tenantId);

  if (productionData.length === 0) {
    throw new Error(
      `Keine Produktionsdaten fuer Park ${parkId} im ${month ? `${month}/${year}` : year} gefunden`
    );
  }

  // 4. Berechne Gesamtwerte
  const totalProductionKwh = productionData.reduce(
    (sum, t) => sum + t.productionKwh,
    0
  );
  const turbineCount = productionData.length;
  const averageProductionKwh = totalProductionKwh / turbineCount;

  // 5. Berechne Verteilung basierend auf Modus
  let distributions: TurbineDistribution[];

  switch (distributionMode) {
    case "PROPORTIONAL":
      distributions = calculateProportionalDistribution(
        productionData,
        totalProductionKwh,
        netOperatorRevenueEur
      );
      break;

    case "SMOOTHED":
      if (!ratePerKwhCt) {
        throw new Error(
          "SMOOTHED mode benoetigt ratePerKwhCt (Verguetungssatz)"
        );
      }
      distributions = calculateSmoothedDistribution(
        productionData,
        totalProductionKwh,
        averageProductionKwh,
        netOperatorRevenueEur,
        ratePerKwhCt
      );
      break;

    case "TOLERATED":
      if (!ratePerKwhCt) {
        throw new Error(
          "TOLERATED mode benoetigt ratePerKwhCt (Verguetungssatz)"
        );
      }
      distributions = calculateToleratedDistribution(
        productionData,
        totalProductionKwh,
        averageProductionKwh,
        netOperatorRevenueEur,
        ratePerKwhCt,
        tolerancePercentage ?? 5 // Default: 5% Toleranz
      );
      break;

    default:
      throw new Error(`Unbekannter Verteilungsmodus: ${distributionMode}`);
  }

  // 6. Erstelle Berechnungsdetails
  const calculationDetails: EnergySettlementCalculation = {
    totalProductionKwh,
    netOperatorRevenueEur,
    averageProductionKwh,
    turbineCount,
    distributions: distributions.map((d) => ({
      turbineId: d.turbineId,
      turbineDesignation: d.turbineDesignation,
      operatorFundId: d.operatorFundId,
      operatorFundName: d.operatorFundName,
      productionKwh: d.productionKwh,
      productionSharePct: d.productionSharePct,
      baseRevenueEur: d.baseRevenueEur,
      deviationFromAverage: d.deviationFromAverage,
      toleranceAdjustmentEur: d.toleranceAdjustmentEur,
      finalRevenueEur: d.finalRevenueEur,
    })),
    toleranceMode: {
      mode: distributionMode,
      tolerancePercentage,
      smoothingFactor: undefined, // Kann bei Bedarf erweitert werden
    },
    calculatedAt: new Date().toISOString(),
  };

  // 7. Validierung: Summe der Verteilung muss dem Erloes entsprechen
  const totalDistributed = distributions.reduce(
    (sum, d) => sum + d.finalRevenueEur,
    0
  );
  const tolerance = 0.01; // 1 Cent Toleranz fuer Rundungsfehler

  if (Math.abs(totalDistributed - netOperatorRevenueEur) > tolerance) {
    logger.warn(
      `Verteilungsdifferenz: ${totalDistributed} vs ${netOperatorRevenueEur} (Diff: ${totalDistributed - netOperatorRevenueEur})`
    );
  }

  return {
    totalProductionKwh,
    averageProductionKwh,
    turbineCount,
    distributions,
    calculationDetails,
  };
}

// ===========================================
// DISTRIBUTION CALCULATION FUNCTIONS
// ===========================================

/**
 * PROPORTIONAL: Direkte Aufteilung nach kWh-Anteil
 *
 * Jede WKA erhaelt den Anteil am Erloes entsprechend ihrer
 * Produktion an der Gesamtproduktion.
 *
 * Formel: Erloes_WKA = Erloes_Gesamt * (Produktion_WKA / Produktion_Gesamt)
 *
 * @param productionData - Produktionsdaten pro WKA
 * @param totalProductionKwh - Gesamtproduktion aller WKAs
 * @param netOperatorRevenueEur - Erloes vom Netzbetreiber
 * @returns Verteilung pro WKA
 */
export function calculateProportionalDistribution(
  productionData: TurbineProductionData[],
  totalProductionKwh: number,
  netOperatorRevenueEur: number
): TurbineDistribution[] {
  return productionData.map((turbine) => {
    // Berechne Produktionsanteil
    const productionSharePct =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * 100
        : 0;

    // Berechne Erloes proportional zur Produktion
    const revenue =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * netOperatorRevenueEur
        : 0;

    const finalRevenueEur = roundToTwoDecimals(revenue);

    return {
      turbineId: turbine.turbineId,
      turbineDesignation: turbine.turbineDesignation,
      operatorFundId: turbine.operatorFundId,
      operatorFundName: turbine.operatorFundName,
      productionKwh: turbine.productionKwh,
      productionSharePct: roundToFiveDecimals(productionSharePct),
      baseRevenueEur: finalRevenueEur,
      finalRevenueEur,
    };
  });
}

/**
 * SMOOTHED (DULDUNG): Glaettung von Standortunterschieden
 *
 * Jede WKA erhaelt:
 * 1. Basis-Erloes proportional zur Produktion
 * 2. DULDUNGS-Ausgleich: (Ist - Durchschnitt) x Verguetungssatz
 *    - Positiv (mehr produziert) = Abzug
 *    - Negativ (weniger produziert) = Zuschlag
 *
 * Dies kompensiert Standortunterschiede und sorgt fuer
 * eine fairere Verteilung zwischen WKAs an besseren und
 * schlechteren Standorten.
 *
 * @param productionData - Produktionsdaten pro WKA
 * @param totalProductionKwh - Gesamtproduktion aller WKAs
 * @param averageProductionKwh - Durchschnittliche Produktion pro WKA
 * @param netOperatorRevenueEur - Erloes vom Netzbetreiber
 * @param ratePerKwhCt - Verguetungssatz in ct/kWh
 * @returns Verteilung pro WKA mit DULDUNG-Ausgleich
 */
export function calculateSmoothedDistribution(
  productionData: TurbineProductionData[],
  totalProductionKwh: number,
  averageProductionKwh: number,
  netOperatorRevenueEur: number,
  ratePerKwhCt: number
): TurbineDistribution[] {
  // Konvertiere ct/kWh zu EUR/kWh
  const ratePerKwhEur = ratePerKwhCt / 100;

  const distributions = productionData.map((turbine) => {
    // 1. Berechne Produktionsanteil
    const productionSharePct =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * 100
        : 0;

    // 2. Berechne Basis-Erloes proportional zur Produktion
    const baseRevenueEur =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * netOperatorRevenueEur
        : 0;

    // 3. Berechne DULDUNGS-Ausgleich
    // Abweichung = Ist - Durchschnitt
    const deviationFromAverage = turbine.productionKwh - averageProductionKwh;

    // Ausgleich = Abweichung x Verguetungssatz
    // Positiv = Abzug (WKA hat mehr produziert als Durchschnitt)
    // Negativ = Zuschlag (WKA hat weniger produziert als Durchschnitt)
    const toleranceAdjustmentEur = deviationFromAverage * ratePerKwhEur;

    // 4. Berechne finalen Erloes
    // Basis-Erloes MINUS Ausgleich (Abzug bei ueberdurchschnittlicher Produktion)
    const finalRevenueEur = baseRevenueEur - toleranceAdjustmentEur;

    return {
      turbineId: turbine.turbineId,
      turbineDesignation: turbine.turbineDesignation,
      operatorFundId: turbine.operatorFundId,
      operatorFundName: turbine.operatorFundName,
      productionKwh: turbine.productionKwh,
      productionSharePct: roundToFiveDecimals(productionSharePct),
      baseRevenueEur: roundToTwoDecimals(baseRevenueEur),
      deviationFromAverage: roundToTwoDecimals(deviationFromAverage),
      toleranceAdjustmentEur: roundToTwoDecimals(toleranceAdjustmentEur),
      finalRevenueEur: roundToTwoDecimals(finalRevenueEur),
    };
  });

  // Korrigiere Rundungsfehler auf das letzte Element
  const totalDistributed = distributions.reduce(
    (sum, d) => sum + d.finalRevenueEur,
    0
  );
  const roundingDifference = netOperatorRevenueEur - totalDistributed;

  if (
    distributions.length > 0 &&
    Math.abs(roundingDifference) > 0 &&
    Math.abs(roundingDifference) <= 0.05
  ) {
    // Addiere die Differenz zum letzten Element
    distributions[distributions.length - 1].finalRevenueEur = roundToTwoDecimals(
      distributions[distributions.length - 1].finalRevenueEur + roundingDifference
    );
  }

  return distributions;
}

/**
 * TOLERATED: DULDUNG mit Toleranzgrenze
 *
 * Wie SMOOTHED, aber Abweichungen innerhalb der Toleranzgrenze
 * werden nicht ausgeglichen. Nur Abweichungen ausserhalb der
 * Toleranz fuehren zu Ausgleichszahlungen.
 *
 * @param productionData - Produktionsdaten pro WKA
 * @param totalProductionKwh - Gesamtproduktion aller WKAs
 * @param averageProductionKwh - Durchschnittliche Produktion pro WKA
 * @param netOperatorRevenueEur - Erloes vom Netzbetreiber
 * @param ratePerKwhCt - Verguetungssatz in ct/kWh
 * @param tolerancePercentage - Toleranzgrenze in % (z.B. 5%)
 * @returns Verteilung pro WKA mit toleriertem DULDUNG-Ausgleich
 */
export function calculateToleratedDistribution(
  productionData: TurbineProductionData[],
  totalProductionKwh: number,
  averageProductionKwh: number,
  netOperatorRevenueEur: number,
  ratePerKwhCt: number,
  tolerancePercentage: number
): TurbineDistribution[] {
  // Konvertiere ct/kWh zu EUR/kWh
  const ratePerKwhEur = ratePerKwhCt / 100;

  // Berechne Toleranzgrenzen
  const toleranceFactor = tolerancePercentage / 100;
  const lowerBound = averageProductionKwh * (1 - toleranceFactor);
  const upperBound = averageProductionKwh * (1 + toleranceFactor);

  const distributions = productionData.map((turbine) => {
    // 1. Berechne Produktionsanteil
    const productionSharePct =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * 100
        : 0;

    // 2. Berechne Basis-Erloes proportional zur Produktion
    const baseRevenueEur =
      totalProductionKwh > 0
        ? (turbine.productionKwh / totalProductionKwh) * netOperatorRevenueEur
        : 0;

    // 3. Berechne Abweichung vom Durchschnitt
    const deviationFromAverage = turbine.productionKwh - averageProductionKwh;

    // 4. Pruefe ob innerhalb Toleranz
    let toleranceAdjustmentEur = 0;

    if (turbine.productionKwh > upperBound) {
      // Ueber oberer Grenze -> Abzug fuer Mehrproduktion ueber Toleranz
      const excessKwh = turbine.productionKwh - upperBound;
      toleranceAdjustmentEur = excessKwh * ratePerKwhEur;
    } else if (turbine.productionKwh < lowerBound) {
      // Unter unterer Grenze -> Zuschlag fuer Minderproduktion unter Toleranz
      const shortfallKwh = turbine.productionKwh - lowerBound; // Negativ!
      toleranceAdjustmentEur = shortfallKwh * ratePerKwhEur; // Negativ = Zuschlag
    }
    // Innerhalb Toleranz -> kein Ausgleich (toleranceAdjustmentEur bleibt 0)

    // 5. Berechne finalen Erloes
    const finalRevenueEur = baseRevenueEur - toleranceAdjustmentEur;

    return {
      turbineId: turbine.turbineId,
      turbineDesignation: turbine.turbineDesignation,
      operatorFundId: turbine.operatorFundId,
      operatorFundName: turbine.operatorFundName,
      productionKwh: turbine.productionKwh,
      productionSharePct: roundToFiveDecimals(productionSharePct),
      baseRevenueEur: roundToTwoDecimals(baseRevenueEur),
      deviationFromAverage: roundToTwoDecimals(deviationFromAverage),
      toleranceAdjustmentEur: roundToTwoDecimals(toleranceAdjustmentEur),
      finalRevenueEur: roundToTwoDecimals(finalRevenueEur),
    };
  });

  // Korrigiere Rundungsfehler
  const totalDistributed = distributions.reduce(
    (sum, d) => sum + d.finalRevenueEur,
    0
  );
  const roundingDifference = netOperatorRevenueEur - totalDistributed;

  if (
    distributions.length > 0 &&
    Math.abs(roundingDifference) > 0 &&
    Math.abs(roundingDifference) <= 0.05
  ) {
    distributions[distributions.length - 1].finalRevenueEur = roundToTwoDecimals(
      distributions[distributions.length - 1].finalRevenueEur + roundingDifference
    );
  }

  return distributions;
}

// ===========================================
// DATA LOADING FUNCTIONS
// ===========================================

/**
 * Laedt Produktionsdaten mit aktuellem Betreiber fuer einen Park
 *
 * @param parkId - Park ID
 * @param year - Jahr
 * @param month - Monat (null fuer Jahressumme)
 * @param tenantId - Tenant ID
 * @returns Produktionsdaten pro WKA mit Betreiber-Info
 */
async function loadProductionData(
  parkId: string,
  year: number,
  month: number | null,
  tenantId: string
): Promise<TurbineProductionData[]> {
  // Bestimme Referenzdatum fuer Betreiber-Abfrage
  const referenceDate = month
    ? new Date(year, month - 1, 15) // Mitte des Monats
    : new Date(year, 11, 31); // Jahresende

  // Lade alle aktiven Turbinen des Parks
  const turbines = await prisma.turbine.findMany({
    where: {
      parkId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      designation: true,
    },
  });

  const result: TurbineProductionData[] = [];

  for (const turbine of turbines) {
    // Lade Produktionsdaten
    let productionKwh = 0;

    if (month) {
      // Monatliche Produktion
      const production = await prisma.turbineProduction.findFirst({
        where: {
          turbineId: turbine.id,
          year,
          month,
          tenantId,
          status: { in: ["CONFIRMED", "INVOICED"] }, // Nur bestaetigt/abgerechnet
        },
        select: {
          productionKwh: true,
        },
      });

      if (production) {
        productionKwh = Number(production.productionKwh);
      }
    } else {
      // Jahressumme
      const productions = await prisma.turbineProduction.findMany({
        where: {
          turbineId: turbine.id,
          year,
          tenantId,
          status: { in: ["CONFIRMED", "INVOICED"] },
        },
        select: {
          productionKwh: true,
        },
      });

      productionKwh = productions.reduce(
        (sum, p) => sum + Number(p.productionKwh),
        0
      );
    }

    // Lade aktuellen Betreiber
    const operator = await prisma.turbineOperator.findFirst({
      where: {
        turbineId: turbine.id,
        validFrom: { lte: referenceDate },
        OR: [{ validTo: null }, { validTo: { gt: referenceDate } }],
        status: "ACTIVE",
      },
      select: {
        operatorFundId: true,
        operatorFund: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!operator) {
      logger.warn(
        `Kein aktiver Betreiber fuer Turbine ${turbine.designation} (${turbine.id}) am ${referenceDate.toISOString()}`
      );
      continue; // Ueberspringe Turbinen ohne Betreiber
    }

    result.push({
      turbineId: turbine.id,
      turbineDesignation: turbine.designation,
      operatorFundId: operator.operatorFundId,
      operatorFundName: operator.operatorFund.name,
      productionKwh,
    });
  }

  return result;
}

// ===========================================
// PERSISTENCE FUNCTIONS
// ===========================================

/**
 * Speichert eine berechnete Stromabrechnung in der Datenbank
 *
 * @param input - Eingabeparameter
 * @param result - Berechnungsergebnis
 * @returns ID der erstellten EnergySettlement
 */
export async function saveEnergySettlement(
  input: EnergySettlementInput,
  result: EnergySettlementResult
): Promise<string> {
  const settlement = await prisma.energySettlement.create({
    data: {
      year: input.year,
      month: input.month,
      netOperatorRevenueEur: input.netOperatorRevenueEur,
      netOperatorReference: input.netOperatorReference || null,
      totalProductionKwh: result.totalProductionKwh,
      distributionMode: input.distributionMode,
      tolerancePercentage: input.tolerancePercentage || null,
      status: "CALCULATED",
      calculationDetails: result.calculationDetails as object,
      parkId: input.parkId,
      tenantId: input.tenantId,
      // Erstelle Settlement Items
      items: {
        create: result.distributions.map((dist) => ({
          productionShareKwh: dist.productionKwh,
          productionSharePct: dist.productionSharePct,
          revenueShareEur: dist.finalRevenueEur,
          distributionKey: formatDistributionKey(dist, input.distributionMode),
          averageProductionKwh: result.averageProductionKwh,
          deviationKwh: dist.deviationFromAverage || null,
          toleranceAdjustment: dist.toleranceAdjustmentEur || null,
          recipientFundId: dist.operatorFundId,
          turbineId: dist.turbineId,
        })),
      },
    },
    select: {
      id: true,
    },
  });

  return settlement.id;
}

/**
 * Laedt eine bestehende Stromabrechnung aus der Datenbank
 *
 * @param settlementId - Settlement ID
 * @param tenantId - Tenant ID
 * @returns Stromabrechnung oder null
 */
export async function loadEnergySettlement(
  settlementId: string,
  tenantId: string
) {
  return prisma.energySettlement.findFirst({
    where: {
      id: settlementId,
      tenantId,
    },
    include: {
      park: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        include: {
          recipientFund: {
            select: {
              id: true,
              name: true,
              fundCategory: {
                select: { id: true, name: true, code: true, color: true },
              },
            },
          },
          turbine: {
            select: {
              id: true,
              designation: true,
            },
          },
        },
      },
    },
  });
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Rundet auf 2 Dezimalstellen (fuer EUR-Betraege)
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rundet auf 5 Dezimalstellen (fuer Prozentanteile)
 */
function roundToFiveDecimals(value: number): number {
  return Math.round(value * 100000) / 100000;
}

/**
 * Formatiert den Verteilungsschluessel fuer Anzeige
 */
function formatDistributionKey(
  dist: TurbineDistribution,
  mode: DistributionMode
): string {
  switch (mode) {
    case "PROPORTIONAL":
      return `PROPORTIONAL: ${dist.productionSharePct.toFixed(3)}%`;

    case "SMOOTHED":
    case "TOLERATED":
      const adjustmentType =
        (dist.toleranceAdjustmentEur ?? 0) > 0 ? "ABZUG" : "ZUSCHLAG";
      const absAdjustment = Math.abs(dist.toleranceAdjustmentEur ?? 0);
      return `DULDUNG ${adjustmentType}: ${absAdjustment.toFixed(2)} EUR (${dist.deviationFromAverage?.toFixed(2) ?? 0} kWh)`;

    default:
      return `${mode}: ${dist.productionSharePct.toFixed(3)}%`;
  }
}

/**
 * Berechnet den DULDUNGS-Ausgleich fuer eine einzelne WKA
 *
 * Dies ist eine Hilfsfunktion die auch standalone verwendet werden kann.
 *
 * @param actualProductionKwh - Tatsaechliche Produktion der WKA
 * @param averageProductionKwh - Durchschnittliche Produktion aller WKAs
 * @param ratePerKwhCt - Verguetungssatz in ct/kWh
 * @returns Ausgleichsbetrag in EUR (positiv = Abzug, negativ = Zuschlag)
 *
 * @example
 * ```typescript
 * // WP Barenburg Dezember 2025
 * const adjustment = calculateSingleTurbineAdjustment(
 *   551286.3,  // Ist-Produktion
 *   527664.53, // Durchschnitt
 *   8.18       // Verguetungssatz
 * );
 * // => 1932.26 EUR (Abzug)
 * ```
 */
export function calculateSingleTurbineAdjustment(
  actualProductionKwh: number,
  averageProductionKwh: number,
  ratePerKwhCt: number
): number {
  const deviationKwh = actualProductionKwh - averageProductionKwh;
  const adjustmentEur = deviationKwh * (ratePerKwhCt / 100);
  return roundToTwoDecimals(adjustmentEur);
}

/**
 * Aggregiert Verteilungen nach Betreiber (Fund)
 *
 * Nuetzlich wenn mehrere WKAs zum gleichen Betreiber gehoeren.
 *
 * @param distributions - Verteilungen pro WKA
 * @returns Aggregierte Verteilung pro Betreiber
 */
export function aggregateByOperator(
  distributions: TurbineDistribution[]
): Map<string, TurbineDistribution[]> {
  const grouped = new Map<string, TurbineDistribution[]>();

  for (const dist of distributions) {
    const existing = grouped.get(dist.operatorFundId) || [];
    existing.push(dist);
    grouped.set(dist.operatorFundId, existing);
  }

  return grouped;
}

/**
 * Berechnet Summen pro Betreiber (Fund)
 */
export function calculateOperatorSummary(
  distributions: TurbineDistribution[]
): {
  operatorFundId: string;
  operatorFundName: string;
  turbineCount: number;
  totalProductionKwh: number;
  totalBaseRevenueEur: number;
  totalAdjustmentEur: number;
  totalFinalRevenueEur: number;
}[] {
  const grouped = aggregateByOperator(distributions);
  const summaries: {
    operatorFundId: string;
    operatorFundName: string;
    turbineCount: number;
    totalProductionKwh: number;
    totalBaseRevenueEur: number;
    totalAdjustmentEur: number;
    totalFinalRevenueEur: number;
  }[] = [];

  for (const [operatorFundId, items] of grouped) {
    summaries.push({
      operatorFundId,
      operatorFundName: items[0].operatorFundName,
      turbineCount: items.length,
      totalProductionKwh: roundToTwoDecimals(
        items.reduce((sum, i) => sum + i.productionKwh, 0)
      ),
      totalBaseRevenueEur: roundToTwoDecimals(
        items.reduce((sum, i) => sum + i.baseRevenueEur, 0)
      ),
      totalAdjustmentEur: roundToTwoDecimals(
        items.reduce((sum, i) => sum + (i.toleranceAdjustmentEur ?? 0), 0)
      ),
      totalFinalRevenueEur: roundToTwoDecimals(
        items.reduce((sum, i) => sum + i.finalRevenueEur, 0)
      ),
    });
  }

  return summaries;
}
