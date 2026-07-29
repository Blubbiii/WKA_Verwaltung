/**
 * Settlement Calculator - Pacht-Abrechnungslogik
 *
 * Berechnet die jährliche Pachtabrechnung für einen Windpark:
 * - Mindestpacht pro Lease
 * - Erlösanteil basierend auf PlotArea-Typ (WEA vs. Pool)
 * - Finale Zahlung = MAX(Mindestpacht, Erlösanteil)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Decimal } from "@prisma/client-runtime-utils";
import type { PlotAreaType, CompensationType } from "@prisma/client";

/**
 * Hinweis für Operatoren, der im Ergebnis (und damit in der API-Response)
 * mitgeführt wird. Ersetzt reine console.warn-Ausgaben, die im Serverlog
 * verschwinden (Audit 3.4).
 */
/**
 * Branchenpraxis Windkraft: wenn der Park keinen expliziten Verteilschlüssel
 * konfiguriert hat, gelten 10 % Standort / 90 % Pool als typischer Default für
 * Mehr-Anlagen-Pools. Tenants mit anderen Verteilmodellen MÜSSEN
 * park.weaSharePercentage/poolSharePercentage explizit setzen.
 *
 * Beide Pfade (ADVANCE und FINAL) MÜSSEN denselben Default nutzen, sonst
 * werden Vorschüsse gezahlt, die die Endabrechnung nicht wiederfindet (F11).
 */
const DEFAULT_WEA_SHARE_PERCENT = 10;
const DEFAULT_POOL_SHARE_PERCENT = 90;

export interface SettlementWarning {
  code: "PLOT_MULTIPLE_LESSORS" | "LEASE_PARTIAL_PERIOD" | "SHARE_SPLIT_INVALID";
  message: string;
  plotId?: string;
  leaseId?: string;
}

/**
 * Bestimmt EINE park-weit einheitliche Basis für die Verteilung des
 * WEA-Standort-Topfes (Audit Randfall 3).
 *
 * Nur wenn ALLE WEA_STANDORT-Flächen eine `areaSqm` haben, darf nach m²
 * verteilt werden. Sobald eine Fläche ohne m² dabei ist, würde eine
 * gemischte Basis (m² für die einen, 1/n für die anderen) in Summe mehr
 * oder weniger als 100 % ergeben.
 */
function collectStandortTotals(
  plots: { plotAreas: { areaType: PlotAreaType; areaSqm: Decimal | null }[] }[]
): { totalStandortSqm: number; totalWeaAreaCount: number; distributeByArea: boolean } {
  let totalStandortSqm = 0;
  let totalWeaAreaCount = 0;
  let allHaveArea = true;

  for (const plot of plots) {
    for (const area of plot.plotAreas) {
      if (area.areaType !== "WEA_STANDORT") continue;
      totalWeaAreaCount++;
      const sqm = area.areaSqm ? Number(area.areaSqm) : 0;
      if (sqm > 0) {
        totalStandortSqm += sqm;
      } else {
        allHaveArea = false;
      }
    }
  }

  const distributeByArea = allHaveArea && totalStandortSqm > 0 && totalWeaAreaCount > 0;
  if (!distributeByArea && totalStandortSqm > 0) {
    logger.info(
      { totalWeaAreaCount, totalStandortSqm },
      "Not all WEA_STANDORT areas have areaSqm - falling back to equal distribution by count"
    );
  }

  return { totalStandortSqm, totalWeaAreaCount, distributeByArea };
}

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
  minimumRent: number; // Mindestpacht für diese Flaeche
  revenueShare: number; // Erlösanteil für diese Flaeche
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

  /**
   * Hinweise, die manuelle Nacharbeit erfordern können (Miteigentum,
   * unterjähriger Vertragswechsel, inkonsistenter Verteilschlüssel).
   * Von den API-Routes an das UI durchzureichen (Audit 3.4).
   */
  warnings: SettlementWarning[];
}

export interface CalculateSettlementOptions {
  parkId: string;
  year: number;
  totalRevenue?: number; // Optional: Überschreibt Period.totalRevenue
  tenantId: string;
  /**
   * Typ der Abrechnungsperiode:
   * - "ADVANCE": Monatlicher Vorschuss (1/12 der Jahresmindestpacht)
   * - "FINAL": Jahresendabrechnung mit Verrechnung der Vorschüsse
   */
  periodType?: "ADVANCE" | "FINAL";
  /**
   * Monat für monatliche Vorschuss-Berechnung (1-12)
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
  /** Anteil für WEA-Standorte (10% der Mindestpacht) */
  weaShareAmount: number;
  /** Anteil für Pool/Flaechen-Umlage (90% der Mindestpacht) */
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

  // Vorschüsse pro Lease
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
 * Erweitertes Settlement-Ergebnis für Jahresendabrechnung (FINAL)
 * Enthaelt Informationen über gezahlte Vorschüsse und Restbetrag
 */
export interface FinalSettlementResult extends SettlementCalculationResult {
  periodType: "FINAL";
  /** Summe aller gezahlten Vorschüsse im Jahr */
  paidAdvances: number;
  /** Restbetrag = totalPayment - paidAdvances (Nachzahlung wenn positiv) */
  remainingAmount: number;
  /** Details zu allen gezahlten Vorschüssen */
  advancePayments: AdvancePaymentInfo[];
  /** Verknuepfte Stromabrechnung ID */
  linkedEnergySettlementId?: string;
  /** Revenue aus verknuepfter Stromabrechnung */
  linkedEnergySettlementRevenue?: number;
}

/**
 * Erweitertes Lease-Ergebnis für Jahresendabrechnung
 */
export interface FinalLeaseCalculationResult extends LeaseCalculationResult {
  /** Gezahlte Vorschüsse für diesen Lease */
  paidAdvances: number;
  /** Restbetrag = totalPayment - paidAdvances */
  remainingAmount: number;
  /** Details zu gezahlten Vorschüssen */
  advancePayments: AdvancePaymentInfo[];
}

// ===========================================
// MAIN CALCULATOR
// ===========================================

/**
 * Berechnet die Pachtabrechnung für einen Park und ein Jahr
 *
 * Unterstuetzt zwei Modi:
 * - ADVANCE: Monatlicher Vorschuss (1/12 der Jahresmindestpacht)
 * - FINAL: Jahresendabrechnung mit Verrechnung der Vorschüsse
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
    month: _month,
    linkedEnergySettlementId,
  } = options;

  // 1. Lade Park mit Pacht-Konfiguration
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: {
      turbines: {
        where: { status: "ACTIVE" },
        select: {
          id: true, designation: true,
          minimumRent: true, weaSharePercentage: true, poolSharePercentage: true,
        },
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
    throw new Error("Keine Berechtigung für diesen Park");
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
      periodType: "FINAL", // Für Revenue-Daten die Jahresperiode nutzen
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
          compensationType: "ANNUAL", // Nur jährliche Zahlungen
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

  // 6. Park-Konfiguration (mit per-turbine Overrides)
  const parkMinRent =
    park.minimumRentPerTurbine != null ? Number(park.minimumRentPerTurbine) : null;
  // Audit F11: Der ADVANCE-Pfad (calculateMonthlyAdvance) fällt auf 10/90
  // zurück, der FINAL-Pfad tat das nicht und lieferte 0/0 — Vorschüsse wurden
  // ausgezahlt, die Endabrechnung ergab 0 und die Rückforderung wurde durch
  // Math.max(0, ...) verschluckt. Jetzt identische Defaults in beiden Pfaden.
  const parkWeaShare =
    park.weaSharePercentage != null
      ? Number(park.weaSharePercentage)
      : DEFAULT_WEA_SHARE_PERCENT;
  const parkPoolShare =
    park.poolSharePercentage != null
      ? Number(park.poolSharePercentage)
      : DEFAULT_POOL_SHARE_PERCENT;
  const turbineCount = park.turbines.length;

  // Per-turbine overrides: use turbine value if set, otherwise park default
  let totalMinRent = 0;
  let totalWeaShare = 0;
  let totalPoolShare = 0;
  for (const t of park.turbines) {
    totalMinRent += t.minimumRent != null ? Number(t.minimumRent) : (parkMinRent ?? 0);
    totalWeaShare += t.weaSharePercentage != null ? Number(t.weaSharePercentage) : parkWeaShare;
    totalPoolShare += t.poolSharePercentage != null ? Number(t.poolSharePercentage) : parkPoolShare;
  }
  const minimumRentPerTurbine = turbineCount > 0 ? totalMinRent / turbineCount : parkMinRent;
  const weaSharePercentage = turbineCount > 0 ? totalWeaShare / turbineCount : parkWeaShare;
  const poolSharePercentage = turbineCount > 0 ? totalPoolShare / turbineCount : parkPoolShare;

  // Entschaedigungssaetze für Sonderflaechentypen
  const wegRate = park.wegCompensationPerSqm ? Number(park.wegCompensationPerSqm) : 0;
  const ausgleichRate = park.ausgleichCompensationPerSqm ? Number(park.ausgleichCompensationPerSqm) : 0;
  const kabelRate = park.kabelCompensationPerM ? Number(park.kabelCompensationPerM) : 0;

  // =================================================================
  // KERNLOGIK: Berechnung pro Turbine, dann Verteilung nach m²
  //
  // 1. Erlösanteil pro WKA = totalRevenue * revenuePhasePercentage% / turbineCount
  // 2. Mindestpacht pro WKA = minimumRentPerTurbine
  // 3. Zahlung pro WKA = MAX(Erlösanteil, Mindestpacht)
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

  // 6b. Berechne Gesamtflaechen für proportionale Verteilung
  const standortTotals = collectStandortTotals(plots);
  const totalStandortSqm = standortTotals.totalStandortSqm;
  const totalWeaAreaCount = standortTotals.totalWeaAreaCount;
  const standortByArea = standortTotals.distributeByArea;
  let totalPoolAreaSqm = 0;
  for (const plot of plots) {
    for (const area of plot.plotAreas) {
      if (area.areaType === "POOL" && area.areaSqm) {
        totalPoolAreaSqm += Number(area.areaSqm);
      }
    }
  }

  // 7. Berechne pro Lease
  const leaseMap = new Map<string, LeaseCalculationResult>();

  // Periode-Grenzen für Plausibilitäts-Warning (R-4)
  const periodStartDate = new Date(Date.UTC(year, 0, 1));
  const periodEndDate = new Date(Date.UTC(year, 11, 31));

  // Warnungen, die für Operatoren sichtbar sein müssen (3.4)
  const warnings: SettlementWarning[] = [];

  // Audit F10: Verteilschlüssel muss 100 % ergeben, sonst wird der Topf
  // über- oder unterverteilt. Hier nur Warnung (kein throw), damit bestehende
  // Abrechnungen weiter angezeigt werden können.
  if (weaSharePercentage != null && poolSharePercentage != null) {
    const shareSum = weaSharePercentage + poolSharePercentage;
    if (Math.abs(shareSum - 100) > 0.01) {
      const msg =
        `Verteilschlüssel inkonsistent: WEA-Standort ${weaSharePercentage.toFixed(2)} % + ` +
        `Pool ${poolSharePercentage.toFixed(2)} % = ${shareSum.toFixed(2)} % (erwartet 100 %). ` +
        `Park- bzw. Turbinen-Konfiguration prüfen.`;
      warnings.push({ code: "SHARE_SPLIT_INVALID", message: msg });
      logger.warn({ parkId, year, weaSharePercentage, poolSharePercentage }, msg);
    }
  }

  for (const plot of plots) {
    // Audit F2 / 3.5: Vorher `.find(...)` — nur der ERSTE aktive Pachtvertrag
    // wurde bedient, alle weiteren Miteigentümer bekamen 0 €, und ohne
    // orderBy war zusätzlich nicht deterministisch WER der Erste ist.
    // Jetzt: alle aktiven Verträge, Flächen gleichmäßig geteilt.
    // TODO(schema): `LeasePlot.sharePercent` würde echte Miteigentumsquoten
    // erlauben; ohne diese Spalte ist Kopfteilung die einzige Annahme.
    const activeLeasePlots = plot.leasePlots
      .filter((lp) => lp.lease && lp.lease.status === "ACTIVE")
      .sort((a, b) => a.lease!.id.localeCompare(b.lease!.id));

    if (activeLeasePlots.length === 0) continue;

    const shareFactor = 1 / activeLeasePlots.length;

    if (activeLeasePlots.length > 1) {
      warnings.push({
        code: "PLOT_MULTIPLE_LESSORS",
        plotId: plot.id,
        message:
          `Flurstück ${plot.plotNumber} ist an ${activeLeasePlots.length} aktive Pachtverträge ` +
          `verpachtet. Die Flächen werden zu gleichen Teilen aufgeteilt, da keine ` +
          `Miteigentumsquote hinterlegt ist.`,
      });
    }

    for (const activeLeasePlot of activeLeasePlots) {
    const lease = activeLeasePlot.lease!;
    const lessor = lease.lessor;

    // Pachtgeber-Wechsel mid-period:
    // Aktuell verwendet der Calculator den AKTIVEN Lease für die ganze
    // Period. Wenn Lease.startDate oder Lease.endDate INNERHALB der
    // Period liegt, ist das Ergebnis nicht zeitanteilig — der neue
    // Pachtgeber bekommt den vollen Betrag.
    //
    // TODO: Zeit-anteilige Berechnung implementieren (eigene Iteration,
    // ~3h + Tests). Bis dahin: WARN-Log damit Operatoren manuelle
    // Korrektur veranlassen können wenn ein Lease in der Period startet
    // oder endet.
    const leaseStartsInPeriod =
      lease.startDate && lease.startDate > periodStartDate && lease.startDate < periodEndDate;
    const leaseEndsInPeriod =
      lease.endDate && lease.endDate > periodStartDate && lease.endDate < periodEndDate;
    if (leaseStartsInPeriod || leaseEndsInPeriod) {
      const lessorLabel =
        lessor.companyName ||
        `${lessor.firstName ?? ""} ${lessor.lastName ?? ""}`.trim() ||
        lessor.id;
      logger.warn(
        {
          leaseId: lease.id,
          parkId,
          year,
          lessorId: lessor.id,
          startDate: lease.startDate?.toISOString() ?? null,
          endDate: lease.endDate?.toISOString() ?? null,
        },
        "Lease starts/ends within settlement period - pro-rata calculation not implemented, full period amount is billed"
      );
      if (!warnings.some((w) => w.code === "LEASE_PARTIAL_PERIOD" && w.leaseId === lease.id)) {
        warnings.push({
          code: "LEASE_PARTIAL_PERIOD",
          leaseId: lease.id,
          message:
            `Pachtvertrag von ${lessorLabel} beginnt oder endet innerhalb des Jahres ${year}. ` +
            `Eine zeitanteilige Berechnung ist nicht implementiert — es fließt der volle ` +
            `Jahresbetrag. Manuelle Korrektur erforderlich.`,
        });
      }
    }

    // Initialisiere LeaseCalculation wenn nicht vorhanden
    if (!leaseMap.has(lease.id)) {
      const lessorName =
        lessor.companyName ||
        `${lessor.firstName || ""} ${lessor.lastName || ""}`.trim() ||
        "Unbekannt";

      const lessorAddress = formatPersonAddressInline(lessor);

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

    // 8. Berechne für jede PlotArea
    for (const area of plot.plotAreas) {
      const areaCalc = calculatePlotArea({
        area,
        plot,
        totalStandortSqm,
        totalPoolAreaSqm,
        totalWeaAreaCount,
        standortByArea,
        shareFactor,
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
    warnings,
  };

  // 12. Bei FINAL: Lade und verrechne gezahlte Vorschüsse
  if (periodType === "FINAL") {
    const advancePayments = await loadAdvancePayments(parkId, year, tenantId);

    // Berechne Summe der gezahlten Vorschüsse
    const paidAdvances = advancePayments.reduce(
      (sum, ap) => sum + ap.amount,
      0
    );

    // Restbetrag = Tatsaechliche Pacht - gezahlte Vorschüsse.
    // Audit F9: KEIN Math.max(0, ...). Ein negativer Restbetrag ist eine
    // Rückforderung (Vorschüsse > Jahresanspruch) und muss sichtbar bleiben,
    // statt still auf 0 gekappt zu werden.
    const remainingAmount = totals.totalPayment - paidAdvances;

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
 * - 10% für WEA-Standorte (aufgeteilt auf Anzahl WEAs)
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
        select: {
          id: true, designation: true,
          minimumRent: true, weaSharePercentage: true, poolSharePercentage: true,
        },
      },
    },
  });

  if (!park) {
    throw new Error(`Park mit ID ${parkId} nicht gefunden`);
  }

  if (park.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung für diesen Park");
  }

  // 2. Park-Konfiguration (mit per-turbine Overrides)
  const parkMinRent = park.minimumRentPerTurbine != null ? Number(park.minimumRentPerTurbine) : 0;
  const parkWeaShare =
    park.weaSharePercentage != null
      ? Number(park.weaSharePercentage)
      : DEFAULT_WEA_SHARE_PERCENT;
  const parkPoolShare =
    park.poolSharePercentage != null
      ? Number(park.poolSharePercentage)
      : DEFAULT_POOL_SHARE_PERCENT;
  const turbineCount = park.turbines.length;

  // Per-turbine overrides: use turbine value if set, otherwise park default
  let totalMinRent = 0;
  let totalWeaShare = 0;
  let totalPoolShare = 0;
  for (const t of park.turbines) {
    totalMinRent += t.minimumRent != null ? Number(t.minimumRent) : parkMinRent;
    totalWeaShare += t.weaSharePercentage != null ? Number(t.weaSharePercentage) : parkWeaShare;
    totalPoolShare += t.poolSharePercentage != null ? Number(t.poolSharePercentage) : parkPoolShare;
  }
  const minimumRentPerTurbine = turbineCount > 0 ? totalMinRent / turbineCount : parkMinRent;
  const weaSharePercentage = turbineCount > 0 ? totalWeaShare / turbineCount : parkWeaShare;
  const poolSharePercentage = turbineCount > 0 ? totalPoolShare / turbineCount : parkPoolShare;

  // Entschaedigungssaetze für WEG/AUSGLEICH/KABEL
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

  // 4. Vorberechnung: Gesamtflaechen für proportionale Verteilung
  const standortTotals = collectStandortTotals(plots);
  const totalWeaCount = standortTotals.totalWeaAreaCount;
  const totalStandortSqm = standortTotals.totalStandortSqm;
  const standortByArea = standortTotals.distributeByArea;
  let totalPoolAreaSqm = 0;
  for (const plot of plots) {
    for (const area of plot.plotAreas) {
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

  // Zusätzlich: WEG/AUSGLEICH/KABEL Entschaedigungen (jährlich)
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

  // 6. Berechne monatliche Vorschüsse pro Lease
  const leaseAdvanceMap = new Map<string, AdvanceCalculationResult>();

  for (const plot of plots) {
    // Audit F2/3.5: alle aktiven Pachtverträge des Flurstücks bedienen,
    // deterministisch sortiert, Flächen zu gleichen Teilen.
    const activeLeasePlots = plot.leasePlots
      .filter((lp) => lp.lease && lp.lease.status === "ACTIVE")
      .sort((a, b) => a.lease!.id.localeCompare(b.lease!.id));

    if (activeLeasePlots.length === 0) continue;

    const shareFactor = 1 / activeLeasePlots.length;

    for (const activeLeasePlot of activeLeasePlots) {
    const lease = activeLeasePlot.lease!;
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
        lessorAddress: formatPersonAddressInline(lessor),
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

    // Berechne Anteil pro PlotArea für dieses Lease
    for (const area of plot.plotAreas) {
      const areaSqm = area.areaSqm ? Number(area.areaSqm) : 0;
      const lengthM = area.lengthM ? Number(area.lengthM) : 0;
      const compensationFixedAmount = area.compensationFixedAmount
        ? Number(area.compensationFixedAmount)
        : null;

      switch (area.areaType) {
        case "WEA_STANDORT": {
          leaseAdvance.weaCount++;
          // Randfall 3: park-weit einheitliche Basis (m² ODER Kopfzahl),
          // niemals gemischt.
          let ratio = 0;
          if (standortByArea) {
            ratio = totalStandortSqm > 0 ? areaSqm / totalStandortSqm : 0;
          } else if (totalWeaCount > 0) {
            ratio = 1 / totalWeaCount;
          }
          leaseAdvance.weaShareAmount += ((yearlyWeaTotal * ratio) / 12) * shareFactor;
          break;
        }
        case "POOL": {
          if (areaSqm > 0) {
            leaseAdvance.poolAreaSqm += areaSqm * shareFactor;
            const ratio = totalPoolAreaSqm > 0 ? areaSqm / totalPoolAreaSqm : 0;
            leaseAdvance.poolShareAmount += ((yearlyPoolTotal * ratio) / 12) * shareFactor;
          }
          break;
        }
        case "WEG": {
          const wegAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : areaSqm * wegRate;
          leaseAdvance.totalAdvance += (wegAmount / 12) * shareFactor;
          break;
        }
        case "AUSGLEICH": {
          const ausglAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : areaSqm * ausgleichRate;
          leaseAdvance.totalAdvance += (ausglAmount / 12) * shareFactor;
          break;
        }
        case "KABEL": {
          const kabelAmount = compensationFixedAmount !== null
            ? compensationFixedAmount
            : lengthM * kabelRate;
          leaseAdvance.totalAdvance += (kabelAmount / 12) * shareFactor;
          break;
        }
      }
    }
    }
  }

  // Finalisiere Vorschüsse
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
 * Laedt alle gezahlten Vorschüsse für ein Jahr
 *
 * Sucht nach Invoices die mit ADVANCE Settlement Periods verknuepft sind
 */
async function loadAdvancePayments(
  parkId: string,
  year: number,
  tenantId: string
): Promise<AdvancePaymentInfo[]> {
  // M-9 Perf: vorher 1 + N Queries (1 für Periods + 1 pro Period für Invoices).
  // Jetzt: 2 Queries — alle Periods + ALLE zugehörigen Invoices via `in: ids`.
  // Anschließend Group-by-period in JS.
  const advancePeriods = await prisma.leaseSettlementPeriod.findMany({
    where: {
      parkId,
      year,
      tenantId,
      periodType: "ADVANCE",
    },
    orderBy: { month: "asc" },
    select: { id: true, month: true },
  });

  if (advancePeriods.length === 0) return [];

  const periodIds = advancePeriods
    .filter((p) => p.month !== null)
    .map((p) => p.id);

  if (periodIds.length === 0) return [];

  // Batch-Lade ALLE Invoices über alle Periods auf einmal.
  const allInvoices = await prisma.invoice.findMany({
    where: {
      settlementPeriodId: { in: periodIds },
      // InvoiceStatus hat 6 Werte. PARTIALLY_PAID fehlte hier, dadurch wurden
      // teilbezahlte Vorschuss-Gutschriften nicht verrechnet (Audit 3.1).
      status: { in: ["SENT", "PAID", "PARTIALLY_PAID"] },
      // Storno-Belege (negative Spiegelbuchung, Status SENT) dürfen nicht
      // mitsummiert werden: das stornierte Original ist bereits über den
      // Status CANCELLED ausgeschlossen, sonst ergäbe das Paar -X statt 0.
      cancelledInvoiceId: null,
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      netAmount: true,
      paidAt: true,
      settlementPeriodId: true,
    },
  });

  // In-Memory-Gruppierung: settlementPeriodId → Invoices[].
  const invoicesByPeriod = new Map<string, typeof allInvoices>();
  for (const inv of allInvoices) {
    if (!inv.settlementPeriodId) continue;
    let bucket = invoicesByPeriod.get(inv.settlementPeriodId);
    if (!bucket) {
      bucket = [];
      invoicesByPeriod.set(inv.settlementPeriodId, bucket);
    }
    bucket.push(inv);
  }

  const advancePayments: AdvancePaymentInfo[] = [];
  for (const period of advancePeriods) {
    if (period.month === null) continue;
    const invoices = invoicesByPeriod.get(period.id) ?? [];

    // Audit F8: NETTO, nicht brutto. `totals.totalPayment` ist die Summe der
    // Nettobeträge aus den Park-Entschädigungssätzen. Wurde hier brutto
    // gegengerechnet, war die Nachzahlung um die enthaltene USt zu niedrig.
    const periodTotal = invoices.reduce(
      (sum: number, inv) => sum + (inv.netAmount ? Number(inv.netAmount) : 0),
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

export interface CalculatePlotAreaParams {
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
  /**
   * Park-weit einheitliche Basis für die Standort-Verteilung (Randfall 3):
   * `true`  → nach m² (nur wenn ALLE WEA_STANDORT-Flächen eine areaSqm haben)
   * `false` → nach Kopfzahl der WEA-Standorte
   * Wird die Basis pro Fläche gewählt, ergibt die Summe der Quoten nicht 100 %.
   * Default `undefined` = automatisch aus `totalStandortSqm` ableiten (Legacy).
   */
  standortByArea?: boolean;
  /**
   * Anteil dieses Pachtvertrags an der Fläche, wenn ein Flurstück an mehrere
   * Pachtgeber verpachtet ist (1 / Anzahl aktiver Verträge). Default 1.
   */
  shareFactor?: number;
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
 * Berechnet den Pachtanteil für eine einzelne PlotArea
 *
 * Die Kernlogik (MAX pro Turbine) ist bereits in calculateSettlement erledigt.
 * Diese Funktion verteilt den Betrag auf die einzelnen Flaechen:
 *
 * - WEA_STANDORT: weaSharePercentage% von paymentPerTurbine * turbineCount, proportional nach m²
 * - POOL: poolSharePercentage% von paymentPerTurbine * turbineCount, proportional nach m²
 * - WEG: areaSqm * wegRate (€/m²) — gesonderte Vergütung
 * - AUSGLEICH: areaSqm * ausgleichRate (€/m²) — gesonderte Vergütung
 * - KABEL: lengthM * kabelRate (€/m) — gesonderte Vergütung
 * - compensationFixedAmount auf PlotArea überschreibt immer die automatische Berechnung
 */
export function calculatePlotArea(
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

  const shareFactor = params.shareFactor ?? 1;
  const standortByArea = params.standortByArea ?? totalStandortSqm > 0;

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
  // Beträge werden am Ende mit shareFactor multipliziert; bei Alleinpacht ist
  // shareFactor = 1 und das Ergebnis identisch zum bisherigen Verhalten.

  // Override: compensationFixedAmount on PlotArea always takes precedence
  if (compensationFixedAmount !== null) {
    calculatedAmount = compensationFixedAmount;
    minimumRent = compensationFixedAmount;
  } else {
    switch (area.areaType) {
      case "WEA_STANDORT": {
        const weaPct = weaSharePercentage ?? 0;

        // Randfall 3: EINE park-weit einheitliche Basis. Vorher wurde pro
        // Fläche entschieden (m² wenn vorhanden, sonst 1/Anzahl) — dabei
        // mischen sich zwei Nenner und die Summe aller Quoten kann z.B.
        // 140 % ergeben, wenn nur ein Teil der Flächen m² gepflegt hat.
        let ratio = 0;
        if (standortByArea) {
          ratio = totalStandortSqm > 0 ? areaSqm / totalStandortSqm : 0;
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

  // Miteigentum: Betrag anteilig auf die aktiven Pachtverträge des Flurstücks
  if (shareFactor !== 1) {
    minimumRent *= shareFactor;
    revenueShare *= shareFactor;
    calculatedAmount *= shareFactor;
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
 * Formatiert die Adresse einer Person als einzeiligen, komma-getrennten String
 * für UI-Display in Lessor-Listen. Unterscheidet sich bewusst von:
 *  - pdf/utils/formatters.ts#formatAddress (Tuple-Args, newline-getrennt, für PDF)
 *  - lease-revenue/invoice-generator.ts#buildRecipientAddress (newline-getrennt, für Rechnungs-Empfänger)
 */
export function formatPersonAddressInline(person: {
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

/** @deprecated Use formatPersonAddressInline. Alias kept for backward-compat with existing tests/imports. */
export const formatAddress = formatPersonAddressInline;

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
      // Das vollstaendige Berechnungsergebnis könnte in einem JSON-Feld gespeichert werden
      // falls das Schema erweitert wird
    },
  });
}

