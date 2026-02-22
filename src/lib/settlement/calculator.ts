/**
 * Settlement Calculator - Pacht-Abrechnungslogik
 *
 * Berechnet die jaehrliche Pachtabrechnung fuer einen Windpark:
 * - Mindestpacht pro Lease
 * - Erloesanteil basierend auf PlotArea-Typ (WEA vs. Pool)
 * - Finale Zahlung = MAX(Mindestpacht, Erloesanteil)
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { PlotAreaType, CompensationType } from "@prisma/client";

// ===========================================
// TYPES
// ===========================================

export interface PlotAreaCalculationResult {
  plotAreaId: string;
  plotId: string;
  plotNumber: string;
  cadastralDistrict: string;
  fieldNumber: string;
  areaType: PlotAreaType;
  areaSqm: number | null;
  lengthM: number | null;
  compensationType: CompensationType;

  // Entschaedigungsgrundlage
  compensationFixedAmount: number | null;
  compensationPercentage: number | null;

  // Berechnete Werte
  minimumRent: number; // Mindestpacht fuer diese Flaeche
  revenueShare: number; // Erloesanteil fuer diese Flaeche
  calculatedAmount: number; // MAX(minimumRent, revenueShare)
  difference: number; // revenueShare - minimumRent (positiv = Nachzahlung)
}

export interface LeaseCalculationResult {
  leaseId: string;
  lessorId: string;
  lessorName: string;
  lessorAddress: string | null;
  lessorBankIban: string | null;
  lessorBankBic: string | null;
  lessorBankName: string | null;

  // Plots und PlotAreas
  plotAreas: PlotAreaCalculationResult[];

  // Summen
  totalMinimumRent: number;
  totalRevenueShare: number;
  totalPayment: number; // MAX(totalMinimumRent, totalRevenueShare)
  totalDifference: number; // totalRevenueShare - totalMinimumRent

  // Anzahl Flaechen nach Typ
  weaCount: number;
  poolCount: number;
  otherCount: number;
}

export interface SettlementCalculationResult {
  parkId: string;
  parkName: string;
  year: number;
  calculatedAt: Date;

  // Park-Konfiguration
  minimumRentPerTurbine: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;

  // Revenue-Daten
  totalRevenue: number;
  revenuePhasePercentage: number | null;

  // Berechnungsergebnisse pro Lease
  leases: LeaseCalculationResult[];

  // Gesamtsummen
  totals: {
    leaseCount: number;
    totalMinimumRent: number;
    totalRevenueShare: number;
    totalPayment: number;
    totalDifference: number;
    weaAreaCount: number;
    poolAreaCount: number;
    otherAreaCount: number;
  };
}

export interface CalculateSettlementOptions {
  parkId: string;
  year: number;
  totalRevenue?: number; // Optional: Ueberschreibt Period.totalRevenue
  tenantId: string;
  /**
   * Typ der Abrechnungsperiode:
   * - "ADVANCE": Monatlicher Vorschuss (1/12 der Jahresmindestpacht)
   * - "FINAL": Jahresendabrechnung mit Verrechnung der Vorschuesse
   */
  periodType?: "ADVANCE" | "FINAL";
  /**
   * Monat fuer monatliche Vorschuss-Berechnung (1-12)
   * Nur relevant wenn periodType = "ADVANCE"
   */
  month?: number;
  /**
   * Verknuepfte Stromabrechnung (EnergySettlement) ID
   * Wenn gesetzt, wird totalRevenue aus dieser Stromabrechnung geladen
   */
  linkedEnergySettlementId?: string;
}

// ===========================================
// ADVANCE CALCULATION TYPES
// ===========================================

/**
 * Ergebnis der monatlichen Vorschuss-Berechnung pro Lease
 */
export interface AdvanceCalculationResult {
  leaseId: string;
  lessorId: string;
  lessorName: string;
  lessorAddress: string | null;
  lessorBankIban: string | null;
  lessorBankBic: string | null;
  lessorBankName: string | null;
  /** 1/12 der Jahres-Mindestpacht */
  monthlyMinimumRent: number;
  /** Anteil fuer WEA-Standorte (10% der Mindestpacht) */
  weaShareAmount: number;
  /** Anteil fuer Pool/Flaechen-Umlage (90% der Mindestpacht) */
  poolShareAmount: number;
  /** Gesamt-Vorschuss = monthlyMinimumRent */
  totalAdvance: number;
  /** Anzahl WEA-Standorte */
  weaCount: number;
  /** Pool-Flaeche in qm */
  poolAreaSqm: number;
}

/**
 * Gesamtergebnis der monatlichen Vorschuss-Berechnung
 */
export interface MonthlyAdvanceResult {
  parkId: string;
  parkName: string;
  year: number;
  month: number;
  calculatedAt: Date;
  periodType: "ADVANCE";

  // Park-Konfiguration
  yearlyMinimumRentTotal: number;
  monthlyMinimumRentTotal: number;
  weaSharePercentage: number;
  poolSharePercentage: number;

  // Vorschuesse pro Lease
  advances: AdvanceCalculationResult[];

  // Summen
  totals: {
    leaseCount: number;
    totalMonthlyAdvance: number;
    totalWeaShare: number;
    totalPoolShare: number;
    totalWeaCount: number;
    totalPoolAreaSqm: number;
  };
}

/**
 * Informationen zu einem gezahlten Vorschuss
 */
export interface AdvancePaymentInfo {
  month: number;
  amount: number;
  invoiceId?: string;
  invoiceNumber?: string;
  paidAt?: Date;
}

/**
 * Erweitertes Settlement-Ergebnis fuer Jahresendabrechnung (FINAL)
 * Enthaelt Informationen ueber gezahlte Vorschuesse und Restbetrag
 */
export interface FinalSettlementResult extends SettlementCalculationResult {
  periodType: "FINAL";
  /** Summe aller gezahlten Vorschuesse im Jahr */
  paidAdvances: number;
  /** Restbetrag = totalPayment - paidAdvances (Nachzahlung wenn positiv) */
  remainingAmount: number;
  /** Details zu allen gezahlten Vorschuessen */
  advancePayments: AdvancePaymentInfo[];
  /** Verknuepfte Stromabrechnung ID */
  linkedEnergySettlementId?: string;
  /** Revenue aus verknuepfter Stromabrechnung */
  linkedEnergySettlementRevenue?: number;
}

/**
 * Erweitertes Lease-Ergebnis fuer Jahresendabrechnung
 */
export interface FinalLeaseCalculationResult extends LeaseCalculationResult {
  /** Gezahlte Vorschuesse fuer diesen Lease */
  paidAdvances: number;
  /** Restbetrag = totalPayment - paidAdvances */
  remainingAmount: number;
  /** Details zu gezahlten Vorschuessen */
  advancePayments: AdvancePaymentInfo[];
}

// ===========================================
// MAIN CALCULATOR
// ===========================================

/**
 * Berechnet die Pachtabrechnung fuer einen Park und ein Jahr
 *
 * Unterstuetzt zwei Modi:
 * - ADVANCE: Monatlicher Vorschuss (1/12 der Jahresmindestpacht)
 * - FINAL: Jahresendabrechnung mit Verrechnung der Vorschuesse
 *
 * @example
 * // Monatlicher Vorschuss (Februar)
 * const advance = await calculateSettlement({
 *   parkId: "...",
 *   year: 2025,
 *   month: 2,
 *   periodType: "ADVANCE",
 *   tenantId: "..."
 * });
 *
 * @example
 * // Jahresendabrechnung
 * const final = await calculateSettlement({
 *   parkId: "...",
 *   year: 2025,
 *   periodType: "FINAL",
 *   linkedEnergySettlementId: "...",
 *   tenantId: "..."
 * });
 */
export async function calculateSettlement(
  options: CalculateSettlementOptions
): Promise<SettlementCalculationResult | FinalSettlementResult> {
  const {
    parkId,
    year,
    totalRevenue: overrideRevenue,
    tenantId,
    periodType = "FINAL",
    month,
    linkedEnergySettlementId,
  } = options;

  // 1. Lade Park mit Pacht-Konfiguration
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: {
      turbines: {
        where: { status: "ACTIVE" },
        select: { id: true, designation: true },
      },
      revenuePhases: {
        orderBy: { phaseNumber: "asc" },
      },
    },
  });

  if (!park) {
    throw new Error(`Park mit ID ${parkId} nicht gefunden`);
  }

  if (park.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung fuer diesen Park");
  }

  // 2. Lade verknuepfte EnergySettlement wenn vorhanden
  let linkedEnergySettlementRevenue: number | undefined;
  if (linkedEnergySettlementId) {
    const energySettlement = await prisma.energySettlement.findUnique({
      where: { id: linkedEnergySettlementId },
      select: { netOperatorRevenueEur: true },
    });
    if (energySettlement) {
      linkedEnergySettlementRevenue = Number(
        energySettlement.netOperatorRevenueEur
      );
    }
  }

  // 3. Lade Settlement Period (falls vorhanden)
  const period = await prisma.leaseSettlementPeriod.findFirst({
    where: {
      parkId,
      year,
      tenantId,
      periodType: "FINAL", // Fuer Revenue-Daten die Jahresperiode nutzen
    },
  });

  // 4. Bestimme totalRevenue (Prioritaet: Override > LinkedEnergy > Period)
  const totalRevenue =
    overrideRevenue ??
    linkedEnergySettlementRevenue ??
    (period?.totalRevenue ? Number(period.totalRevenue) : 0);

  // 4. Bestimme aktuelle Revenue Phase basierend auf Inbetriebnahme-Jahr
  const commissioningYear = park.commissioningDate
    ? new Date(park.commissioningDate).getFullYear()
    : null;
  const yearsInOperation = commissioningYear ? year - commissioningYear + 1 : 1;

  const activePhase = park.revenuePhases.find((phase) => {
    const startOk = yearsInOperation >= phase.startYear;
    const endOk = phase.endYear === null || yearsInOperation <= phase.endYear;
    return startOk && endOk;
  });

  const revenuePhasePercentage = activePhase
    ? Number(activePhase.revenueSharePercentage)
    : null;

  // 5. Lade alle Plots des Parks mit PlotAreas und Leases
  const plots = await prisma.plot.findMany({
    where: {
      parkId,
      tenantId,
      status: "ACTIVE",
    },
    include: {
      plotAreas: {
        where: {
          compensationType: "ANNUAL", // Nur jaehrliche Zahlungen
        },
      },
      leasePlots: {
        include: {
          lease: {
            include: {
              lessor: true,
            },
          },
        },
      },
    },
  });

  // 6. Park-Konfiguration
  const minimumRentPerTurbine = park.minimumRentPerTurbine
    ? Number(park.minimumRentPerTurbine)
    : null;
  const weaSharePercentage = park.weaSharePercentage
    ? Number(park.weaSharePercentage)
    : null;
  const poolSharePercentage = park.poolSharePercentage
    ? Number(park.poolSharePercentage)
    : null;
  const turbineCount = park.turbines.length;

  // Entschaedigungssaetze fuer Sonderflaechentypen
  const wegRate = park.wegCompensationPerSqm ? Number(park.wegCompensationPerSqm) : 0;
  const ausgleichRate = park.ausgleichCompensationPerSqm ? Number(park.ausgleichCompensationPerSqm) : 0;
  const kabelRate = park.kabelCompensationPerM ? Number(park.kabelCompensationPerM) : 0;

  // =================================================================
  // KERNLOGIK: Berechnung pro Turbine, dann Verteilung nach m²
  //
  // 1. Erloesanteil pro WKA = totalRevenue * revenuePhasePercentage% / turbineCount
  // 2. Mindestpacht pro WKA = minimumRentPerTurbine
  // 3. Zahlung pro WKA = MAX(Erloesanteil, Mindestpacht)
  // 4. Verteilung: weaSharePercentage% → Standort (nach m²),
  //    poolSharePercentage% → Pool (nach m²)
  // 5. WEG/AUSGLEICH/KABEL: Gesondert nach Park-Entschaedigungssaetzen
  // =================================================================

  // Berechne Betrag pro Turbine
  const revenuePerTurbine =
    totalRevenue > 0 && revenuePhasePercentage !== null && turbineCount > 0
      ? (totalRevenue * revenuePhasePercentage) / 100 / turbineCount
      : 0;

  const paymentPerTurbine =
    minimumRentPerTurbine !== null
      ? Math.max(revenuePerTurbine, minimumRentPerTurbine)
      : revenuePerTurbine;

  // 6b. Berechne Gesamtflaechen fuer proportionale Verteilung
  let totalStandortSqm = 0;
  let totalPoolAreaSqm = 0;
  let totalWeaAreaCount = 0;
  for (const plot of plots) {
    for (const area of plot.plotAreas) {
      if (area.areaType === "WEA_STANDORT") {
        totalWeaAreaCount++;
        if (area.areaSqm) totalStandortSqm += Number(area.areaSqm);
      }
      if (area.areaType === "POOL" && area.areaSqm) {
        totalPoolAreaSqm += Number(area.areaSqm);
      }
    }
  }

  // 7. Berechne pro Lease
  const leaseMap = new Map<string, LeaseCalculationResult>();

  for (const plot of plots) {
    // Finde aktiven Lease fuer dieses Plot
    const activeLeasePlot = plot.leasePlots.find(
      (lp) => lp.lease && lp.lease.status === "ACTIVE"
    );

    if (!activeLeasePlot || !activeLeasePlot.lease) continue;

    const lease = activeLeasePlot.lease;
    const lessor = lease.lessor;

    // Initialisiere LeaseCalculation wenn nicht vorhanden
    if (!leaseMap.has(lease.id)) {
      const lessorName =
        lessor.companyName ||
        `${lessor.firstName || ""} ${lessor.lastName || ""}`.trim() ||
        "Unbekannt";

      const lessorAddress = formatAddress(lessor);

      leaseMap.set(lease.id, {
        leaseId: lease.id,
        lessorId: lessor.id,
        lessorName,
        lessorAddress,
        lessorBankIban: lessor.bankIban,
        lessorBankBic: lessor.bankBic,
        lessorBankName: lessor.bankName,
        plotAreas: [],
        totalMinimumRent: 0,
        totalRevenueShare: 0,
        totalPayment: 0,
        totalDifference: 0,
        weaCount: 0,
        poolCount: 0,
        otherCount: 0,
      });
    }

    const leaseCalc = leaseMap.get(lease.id)!;

    // 8. Berechne fuer jede PlotArea
    for (const area of plot.plotAreas) {
      const areaCalc = calculatePlotArea({
        area,
        plot,
        totalStandortSqm,
        totalPoolAreaSqm,
        totalWeaAreaCount,
        turbineCount,
        paymentPerTurbine,
        revenuePerTurbine,
        minimumRentPerTurbine,
        weaSharePercentage,
        poolSharePercentage,
        wegRate,
        ausgleichRate,
        kabelRate,
      });

      leaseCalc.plotAreas.push(areaCalc);

      // Aktualisiere Summen
      leaseCalc.totalMinimumRent += areaCalc.minimumRent;
      leaseCalc.totalRevenueShare += areaCalc.revenueShare;
      leaseCalc.totalPayment += areaCalc.calculatedAmount;

      // Zaehle Typen
      if (area.areaType === "WEA_STANDORT") {
        leaseCalc.weaCount++;
      } else if (area.areaType === "POOL") {
        leaseCalc.poolCount++;
      } else {
        leaseCalc.otherCount++;
      }
    }
  }

  // 9. Finalisiere Lease-Berechnungen
  for (const leaseCalc of leaseMap.values()) {
    // Differenz (Nachzahlung wenn positiv)
    leaseCalc.totalDifference =
      leaseCalc.totalRevenueShare - leaseCalc.totalMinimumRent;
  }

  // 10. Berechne Gesamtsummen
  const leases = Array.from(leaseMap.values());
  const totals = {
    leaseCount: leases.length,
    totalMinimumRent: leases.reduce((sum, l) => sum + l.totalMinimumRent, 0),
    totalRevenueShare: leases.reduce((sum, l) => sum + l.totalRevenueShare, 0),
    totalPayment: leases.reduce((sum, l) => sum + l.totalPayment, 0),
    totalDifference: leases.reduce((sum, l) => sum + l.totalDifference, 0),
    weaAreaCount: leases.reduce((sum, l) => sum + l.weaCount, 0),
    poolAreaCount: leases.reduce((sum, l) => sum + l.poolCount, 0),
    otherAreaCount: leases.reduce((sum, l) => sum + l.otherCount, 0),
  };

  // 11. Basis-Ergebnis
  const baseResult: SettlementCalculationResult = {
    parkId: park.id,
    parkName: park.name,
    year,
    calculatedAt: new Date(),
    minimumRentPerTurbine,
    weaSharePercentage,
    poolSharePercentage,
    totalRevenue,
    revenuePhasePercentage,
    leases,
    totals,
  };

  // 12. Bei FINAL: Lade und verrechne gezahlte Vorschuesse
  if (periodType === "FINAL") {
    const advancePayments = await loadAdvancePayments(parkId, year, tenantId);

    // Berechne Summe der gezahlten Vorschuesse
    const paidAdvances = advancePayments.reduce(
      (sum, ap) => sum + ap.amount,
      0
    );

    // Restbetrag = Tatsaechliche Pacht - gezahlte Vorschuesse
    // (Nachzahlung wenn positiv, sonst 0 - keine Rueckzahlung)
    const remainingAmount = Math.max(0, totals.totalPayment - paidAdvances);

    return {
      ...baseResult,
      periodType: "FINAL",
      paidAdvances,
      remainingAmount,
      advancePayments,
      linkedEnergySettlementId,
      linkedEnergySettlementRevenue,
    } satisfies FinalSettlementResult;
  }

  return baseResult;
}

// ===========================================
// MONTHLY ADVANCE CALCULATOR
// ===========================================

export interface CalculateMonthlyAdvanceOptions {
  parkId: string;
  year: number;
  month: number;
  tenantId: string;
}

/**
 * Berechnet den monatlichen Mindestpacht-Vorschuss (ADVANCE)
 *
 * Formel: Jahresmindestpacht / 12
 *
 * Die Verteilung erfolgt nach dem WP Barenburg Schema:
 * - 10% fuer WEA-Standorte (aufgeteilt auf Anzahl WEAs)
 * - 90% Umlage auf Flaeche (Pool-Bereich)
 *
 * @example
 * ```typescript
 * const advance = await calculateMonthlyAdvance({
 *   parkId: "...",
 *   year: 2025,
 *   month: 2, // Februar
 *   tenantId: "..."
 * });
 *
 * // Ergebnis:
 * // {
 * //   parkId: "...",
 * //   parkName: "WP Barenburg",
 * //   year: 2025,
 * //   month: 2,
 * //   yearlyMinimumRentTotal: 16500,
 * //   monthlyMinimumRentTotal: 1375,
 * //   advances: [
 * //     { lessorName: "Meier", monthlyMinimumRent: 137.50, ... },
 * //     ...
 * //   ]
 * // }
 * ```
 */
export async function calculateMonthlyAdvance(
  options: CalculateMonthlyAdvanceOptions
): Promise<MonthlyAdvanceResult> {
  const { parkId, year, month, tenantId } = options;

  // Validierung
  if (month < 1 || month > 12) {
    throw new Error("Monat muss zwischen 1 und 12 liegen");
  }

  // 1. Lade Park mit Pacht-Konfiguration
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: {
      turbines: {
        where: { status: "ACTIVE" },
        select: { id: true, designation: true },
      },
    },
  });

  if (!park) {
    throw new Error(`Park mit ID ${parkId} nicht gefunden`);
  }

  if (park.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung fuer diesen Park");
  }

  // 2. Park-Konfiguration
  const minimumRentPerTurbine = park.minimumRentPerTurbine
    ? Number(park.minimumRentPerTurbine)
    : 0;
  const weaSharePercentage = park.weaSharePercentage
    ? Number(park.weaSharePercentage)
    : 10; // Default: 10% fuer WEA-Standorte
  const poolSharePercentage = park.poolSharePercentage
    ? Number(park.poolSharePercentage)
    : 90; // Default: 90% fuer Pool/Flaechen
  const turbineCount = park.turbines.length;

  // Entschaedigungssaetze fuer WEG/AUSGLEICH/KABEL
  const wegRate = park.wegCompensationPerSqm ? Number(park.wegCompensationPerSqm) : 0;
  const ausgleichRate = park.ausgleichCompensationPerSqm ? Number(park.ausgleichCompensationPerSqm) : 0;
  const kabelRate = park.kabelCompensationPerM ? Number(park.kabelCompensationPerM) : 0;

  // 3. Lade alle Plots des Parks mit PlotAreas und Leases
  const plots = await prisma.plot.findMany({
    where: {
      parkId,
      tenantId,
      status: "ACTIVE",
    },
    include: {
      plotAreas: {
        where: {
          compensationType: "ANNUAL",
        },
      },
      leasePlots: {
        include: {
          lease: {
            include: {
              lessor: true,
            },
          },
        },
      },
    },
  });

  // 4. Vorberechnung: Gesamtflaechen fuer proportionale Verteilung
  let totalWeaCount = 0;
  let totalStandortSqm = 0;
  let totalPoolAreaSqm = 0;
  for (const plot of plots) {
    for (const area of plot.plotAreas) {
      if (area.areaType === "WEA_STANDORT") {
        totalWeaCount++;
        if (area.areaSqm) totalStandortSqm += Number(area.areaSqm);
      }
      if (area.areaType === "POOL" && area.areaSqm) {
        totalPoolAreaSqm += Number(area.areaSqm);
      }
    }
  }

  // 5. Jahres-Mindestpacht: minimumRentPerTurbine * turbineCount
  // Aufgeteilt: weaSharePercentage% → Standort, poolSharePercentage% → Pool
  const yearlyMinimumRentBase = minimumRentPerTurbine * turbineCount;
  const yearlyWeaTotal = (yearlyMinimumRentBase * weaSharePercentage) / 100;
  const yearlyPoolTotal = (yearlyMinimumRentBase * poolSharePercentage) / 100;

  // Zusaetzlich: WEG/AUSGLEICH/KABEL Entschaedigungen (jaehrlich)
  let yearlySpecialCompensation = 0;
  for (const plot of plots) {
    for (const area of plot.plotAreas) {
      const areaSqm = area.areaSqm ? Number(area.areaSqm) : 0;
      const lengthM = area.lengthM ? Number(area.lengthM) : 0;
      if (area.compensationFixedAmount) {
        // Fixed override on area
        if (["WEG", "AUSGLEICH", "KABEL"].includes(area.areaType)) {
          yearlySpecialCompensation += Number(area.compensationFixedAmount);
        }
      } else {
        switch (area.areaType) {
          case "WEG":
            yearlySpecialCompensation += areaSqm * wegRate;
            break;
          case "AUSGLEICH":
            yearlySpecialCompensation += areaSqm * ausgleichRate;
            break;
          case "KABEL":
            yearlySpecialCompensation += lengthM * kabelRate;
            break;
        }
      }
    }
  }

  const totalYearlyMinimumRent = yearlyMinimumRentBase + yearlySpecialCompensation;

  // 6. Berechne monatliche Vorschuesse pro Lease
  const leaseAdvanceMap = new Map<string, AdvanceCalculationResult>();

  for (const plot of plots) {
    const activeLeasePlot = plot.leasePlots.find(
      (lp) => lp.lease && lp.lease.status === "ACTIVE"
    );

    if (!activeLeasePlot || !activeLeasePlot.lease) continue;

    const lease = activeLeasePlot.lease;
    const lessor = lease.lessor;

    // Initialisiere LeaseAdvance wenn nicht vorhanden
    if (!leaseAdvanceMap.has(lease.id)) {
      const lessorName =
        lessor.companyName ||
        `${lessor.firstName || ""} ${lessor.lastName || ""}`.trim() ||
        "Unbekannt";

      leaseAdvanceMap.set(lease.id, {
        leaseId: lease.id,
        lessorId: lessor.id,
        lessorName,
        lessorAddress: formatAddress(lessor),
        lessorBankIban: lessor.bankIban,
        lessorBankBic: lessor.bankBic,
        lessorBankName: lessor.bankName,
        monthlyMinimumRent: 0,
        weaShareAmount: 0,
        poolShareAmount: 0,
        totalAdvance: 0,
        weaCount: 0,
        poolAreaSqm: 0,
      });
    }

    const leaseAdvance = leaseAdvanceMap.get(lease.id)!;

    // Berechne Anteil pro PlotArea fuer dieses Lease
    for (const area of plot.plotAreas) {
      const areaSqm = area.areaSqm ? Number(area.areaSqm) : 0;
      const lengthM = area.lengthM ? Number(area.lengthM) : 0;
      const compensationFixedAmount = area.compensationFixedAmount
        ? Number(area.compensationFixedAmount)
        : null;

      switch (area.areaType) {
        case "WEA_STANDORT": {
          leaseAdvance.weaCount++;
          // Proportional by m² (fallback: equal by count)
          let ratio = 0;
          if (totalStandortSqm > 0 && areaSqm > 0) {
            ratio = areaSqm / totalStandortSqm;
          } else if (totalWeaCount > 0) {
            ratio = 1 / totalWeaCount;
          }
          leaseAdvance.weaShareAmount += (yearlyWeaTotal * ratio) / 12;
          break;
        }
        case "POOL": {
          if (areaSqm > 0) {
            leaseAdvance.poolAreaSqm += areaSqm;
            const ratio = totalPoolAreaSqm > 0 ? areaSqm / totalPoolAreaSqm : 0;
            leaseAdvance.poolShareAmount += (yearlyPoolTotal * ratio) / 12;
          }
          break;
        }
        case "WEG": {
          const wegAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : areaSqm * wegRate;
          leaseAdvance.totalAdvance += wegAmount / 12;
          break;
        }
        case "AUSGLEICH": {
          const ausglAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : areaSqm * ausgleichRate;
          leaseAdvance.totalAdvance += ausglAmount / 12;
          break;
        }
        case "KABEL": {
          const kabelAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : lengthM * kabelRate;
          leaseAdvance.totalAdvance += kabelAmount / 12;
          break;
        }
      }
    }
  }

  // Finalisiere Vorschuesse
  for (const leaseAdvance of leaseAdvanceMap.values()) {
    leaseAdvance.monthlyMinimumRent =
      leaseAdvance.weaShareAmount + leaseAdvance.poolShareAmount;
    leaseAdvance.totalAdvance += leaseAdvance.monthlyMinimumRent;
  }

  const monthlyMinimumRentTotal = totalYearlyMinimumRent / 12;
  const advances = Array.from(leaseAdvanceMap.values());

  return {
    parkId: park.id,
    parkName: park.name,
    year,
    month,
    calculatedAt: new Date(),
    periodType: "ADVANCE",
    yearlyMinimumRentTotal: totalYearlyMinimumRent,
    monthlyMinimumRentTotal,
    weaSharePercentage,
    poolSharePercentage,
    advances,
    totals: {
      leaseCount: advances.length,
      totalMonthlyAdvance: advances.reduce((sum, a) => sum + a.totalAdvance, 0),
      totalWeaShare: advances.reduce((sum, a) => sum + a.weaShareAmount, 0),
      totalPoolShare: advances.reduce((sum, a) => sum + a.poolShareAmount, 0),
      totalWeaCount,
      totalPoolAreaSqm,
    },
  };
}

// ===========================================
// ADVANCE PAYMENTS LOADER
// ===========================================

/**
 * Laedt alle gezahlten Vorschuesse fuer ein Jahr
 *
 * Sucht nach Invoices die mit ADVANCE Settlement Periods verknuepft sind
 */
async function loadAdvancePayments(
  parkId: string,
  year: number,
  tenantId: string
): Promise<AdvancePaymentInfo[]> {
  // Lade alle ADVANCE Periods fuer dieses Jahr mit ihren Invoices
  const advancePeriods = await prisma.leaseSettlementPeriod.findMany({
    where: {
      parkId,
      year,
      tenantId,
      periodType: "ADVANCE",
    },
    orderBy: { month: "asc" },
  });

  const advancePayments: AdvancePaymentInfo[] = [];

  for (const period of advancePeriods) {
    if (period.month === null) continue;

    // Lade Invoices fuer diese Settlement Period separat
    const invoices = await prisma.invoice.findMany({
      where: {
        settlementPeriodId: period.id,
        status: { in: ["SENT", "PAID"] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        grossAmount: true, // Bruttobetrag (inkl. MwSt)
        paidAt: true,
      },
    });

    // Summe aller Invoices fuer diese Periode
    const periodTotal = invoices.reduce(
      (sum: number, inv) => sum + (inv.grossAmount ? Number(inv.grossAmount) : 0),
      0
    );

    if (periodTotal > 0) {
      advancePayments.push({
        month: period.month,
        amount: periodTotal,
        invoiceId: invoices[0]?.id,
        invoiceNumber: invoices[0]?.invoiceNumber ?? undefined,
        paidAt: invoices[0]?.paidAt ?? undefined,
      });
    }
  }

  return advancePayments;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

interface CalculatePlotAreaParams {
  area: {
    id: string;
    areaType: PlotAreaType;
    areaSqm: Decimal | null;
    lengthM: Decimal | null;
    compensationType: CompensationType;
    compensationFixedAmount: Decimal | null;
    compensationPercentage: Decimal | null;
  };
  plot: {
    id: string;
    plotNumber: string;
    cadastralDistrict: string;
    fieldNumber: string;
  };
  // Park-wide totals for proportional distribution
  totalStandortSqm: number;
  totalPoolAreaSqm: number;
  totalWeaAreaCount: number;
  // Per-turbine calculation results (MAX already applied at turbine level)
  turbineCount: number;
  paymentPerTurbine: number;
  revenuePerTurbine: number;
  minimumRentPerTurbine: number | null;
  // Park distribution percentages (e.g., WEA 10%, Pool 90%)
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
  // Park compensation rates for special area types
  wegRate: number;
  ausgleichRate: number;
  kabelRate: number;
}

/**
 * Berechnet den Pachtanteil fuer eine einzelne PlotArea
 *
 * Die Kernlogik (MAX pro Turbine) ist bereits in calculateSettlement erledigt.
 * Diese Funktion verteilt den Betrag auf die einzelnen Flaechen:
 *
 * - WEA_STANDORT: weaSharePercentage% von paymentPerTurbine * turbineCount, proportional nach m²
 * - POOL: poolSharePercentage% von paymentPerTurbine * turbineCount, proportional nach m²
 * - WEG: areaSqm * wegRate (€/m²) — gesonderte Verguetung
 * - AUSGLEICH: areaSqm * ausgleichRate (€/m²) — gesonderte Verguetung
 * - KABEL: lengthM * kabelRate (€/m) — gesonderte Verguetung
 * - compensationFixedAmount auf PlotArea ueberschreibt immer die automatische Berechnung
 */
function calculatePlotArea(
  params: CalculatePlotAreaParams
): PlotAreaCalculationResult {
  const {
    area,
    plot,
    totalStandortSqm,
    totalPoolAreaSqm,
    totalWeaAreaCount,
    turbineCount,
    paymentPerTurbine,
    revenuePerTurbine,
    minimumRentPerTurbine,
    weaSharePercentage,
    poolSharePercentage,
    wegRate,
    ausgleichRate,
    kabelRate,
  } = params;

  const compensationFixedAmount = area.compensationFixedAmount
    ? Number(area.compensationFixedAmount)
    : null;
  const compensationPercentage = area.compensationPercentage
    ? Number(area.compensationPercentage)
    : null;
  const areaSqm = area.areaSqm ? Number(area.areaSqm) : 0;
  const lengthM = area.lengthM ? Number(area.lengthM) : 0;

  let minimumRent = 0;
  let revenueShare = 0;
  let calculatedAmount = 0;

  // Override: compensationFixedAmount on PlotArea always takes precedence
  if (compensationFixedAmount !== null) {
    calculatedAmount = compensationFixedAmount;
    minimumRent = compensationFixedAmount;
  } else {
    switch (area.areaType) {
      case "WEA_STANDORT": {
        const weaPct = weaSharePercentage ?? 0;

        // Proportional share by m² (fallback: equal by count)
        let ratio = 0;
        if (totalStandortSqm > 0 && areaSqm > 0) {
          ratio = areaSqm / totalStandortSqm;
        } else if (totalWeaAreaCount > 0) {
          ratio = 1 / totalWeaAreaCount;
        }

        // Actual payment: share of MAX-based total (paymentPerTurbine already = MAX)
        calculatedAmount = (paymentPerTurbine * weaPct / 100 * turbineCount) * ratio;
        // Display: minimum rent component
        minimumRent = minimumRentPerTurbine !== null
          ? (minimumRentPerTurbine * weaPct / 100 * turbineCount) * ratio
          : 0;
        // Display: revenue share component
        revenueShare = (revenuePerTurbine * weaPct / 100 * turbineCount) * ratio;
        break;
      }

      case "POOL": {
        const poolPct = poolSharePercentage ?? 0;

        // Proportional by m²
        const ratio = (totalPoolAreaSqm > 0 && areaSqm > 0)
          ? areaSqm / totalPoolAreaSqm
          : 0;

        calculatedAmount = (paymentPerTurbine * poolPct / 100 * turbineCount) * ratio;
        minimumRent = minimumRentPerTurbine !== null
          ? (minimumRentPerTurbine * poolPct / 100 * turbineCount) * ratio
          : 0;
        revenueShare = (revenuePerTurbine * poolPct / 100 * turbineCount) * ratio;
        break;
      }

      case "WEG":
        // Separate compensation from Park rates (€/m²)
        calculatedAmount = areaSqm * wegRate;
        break;

      case "AUSGLEICH":
        // Separate compensation from Park rates (€/m²)
        calculatedAmount = areaSqm * ausgleichRate;
        break;

      case "KABEL":
        // Separate compensation from Park rates (€/m)
        calculatedAmount = lengthM * kabelRate;
        break;
    }
  }

  const difference = revenueShare - minimumRent;

  return {
    plotAreaId: area.id,
    plotId: plot.id,
    plotNumber: plot.plotNumber,
    cadastralDistrict: plot.cadastralDistrict,
    fieldNumber: plot.fieldNumber,
    areaType: area.areaType,
    areaSqm: areaSqm || null,
    lengthM: lengthM || null,
    compensationType: area.compensationType,
    compensationFixedAmount,
    compensationPercentage,
    minimumRent,
    revenueShare,
    calculatedAmount,
    difference,
  };
}

/**
 * Formatiert die Adresse einer Person
 */
function formatAddress(person: {
  street: string | null;
  houseNumber?: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
}): string | null {
  const parts: string[] = [];

  if (person.street) {
    parts.push(person.street + (person.houseNumber ? ' ' + person.houseNumber : ''));
  }
  if (person.postalCode && person.city) {
    parts.push(`${person.postalCode} ${person.city}`);
  } else if (person.city) {
    parts.push(person.city);
  }
  if (person.country && person.country !== "Deutschland") {
    parts.push(person.country);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

// ===========================================
// PERSISTENCE
// ===========================================

/**
 * Speichert das Berechnungsergebnis in der SettlementPeriod
 */
export async function saveSettlementCalculation(
  periodId: string,
  calculation: SettlementCalculationResult
): Promise<void> {
  await prisma.leaseSettlementPeriod.update({
    where: { id: periodId },
    data: {
      totalRevenue: new Decimal(calculation.totalRevenue),
      totalMinimumRent: new Decimal(calculation.totals.totalMinimumRent),
      totalActualRent: new Decimal(calculation.totals.totalPayment),
      status: "IN_PROGRESS",
      // Das vollstaendige Berechnungsergebnis koennte in einem JSON-Feld gespeichert werden
      // falls das Schema erweitert wird
    },
  });
}

