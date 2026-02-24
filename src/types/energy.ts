// ===========================================
// Energy Settlement Types für WindparkManager
// Phase 6.1 - Stromabrechnung & Erweiterte Pacht
// ===========================================

import { Decimal } from "@prisma/client/runtime/library";

// ===========================================
// ENUMS (Spiegeln Prisma Schema)
// ===========================================

/**
 * FundCategory relation - the old FundType enum has been replaced with a relation to FundCategory table
 */
export interface FundCategoryRef {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

export type ProductionDataSource =
  | "MANUAL"
  | "CSV_IMPORT"
  | "EXCEL_IMPORT"
  | "SCADA";

export type EnergyCalculationType =
  | "FIXED_RATE"
  | "MARKET_PRICE"
  | "MANUAL";

export type DistributionMode =
  | "PROPORTIONAL"
  | "SMOOTHED"
  | "TOLERATED";

export type ProductionStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "INVOICED";

export type EnergySettlementStatus =
  | "DRAFT"
  | "CALCULATED"
  | "INVOICED"
  | "CLOSED";

// ===========================================
// VERGÜTUNGSARTEN (EnergyRevenueType)
// ===========================================

export interface EnergyRevenueType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  calculationType: EnergyCalculationType;
  hasTax: boolean;
  taxRate: number | null;
  isActive: boolean;
  sortOrder: number;
  tenantId: string;
}

// Vordefinierte Vergütungsarten-Codes
export const REVENUE_TYPE_CODES = {
  EEG: "EEG", // EEG-Vergütung
  DIRECT: "DIRECT", // Direktvermarktung
  REDISPATCH: "REDISPATCH", // Redispatch 2.0
  MARKTPRAEMIE: "MARKTPRAEMIE", // Marktprämie (ohne MwSt)
} as const;

export type RevenueTypeCode = (typeof REVENUE_TYPE_CODES)[keyof typeof REVENUE_TYPE_CODES];

// ===========================================
// MONATLICHE VERGÜTUNGSSÄTZE
// ===========================================

export interface EnergyMonthlyRate {
  id: string;
  year: number;
  month: number;
  ratePerKwh: number; // Hauptsatz in ct/kWh
  marketValue: number | null; // Marktwert MW
  managementFee: number | null; // Managementfee MF
  notes: string | null;
  revenueTypeId: string;
  tenantId: string;
}

export interface EnergyMonthlyRateInput {
  year: number;
  month: number;
  ratePerKwh: number;
  marketValue?: number | null;
  managementFee?: number | null;
  notes?: string | null;
  revenueTypeId: string;
}

// ===========================================
// PRODUKTIONSDATEN
// ===========================================

export interface TurbineProduction {
  id: string;
  year: number;
  month: number;
  productionKwh: number;
  operatingHours: number | null;
  availabilityPct: number | null;
  source: ProductionDataSource;
  status: ProductionStatus;
  notes: string | null;
  turbineId: string;
  tenantId: string;
}

export interface TurbineProductionInput {
  year: number;
  month: number;
  productionKwh: number;
  operatingHours?: number | null;
  availabilityPct?: number | null;
  source?: ProductionDataSource;
  turbineId: string;
}

// CSV/Excel Import Format
export interface ProductionImportRow {
  turbineId?: string;
  turbineDesignation?: string; // Alternative: WKA-Bezeichnung
  year: number;
  month: number;
  productionKwh: number;
  operatingHours?: number;
  availabilityPct?: number;
}

export interface ProductionImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ProductionImportError[];
}

export interface ProductionImportError {
  row: number;
  field?: string;
  message: string;
  data?: ProductionImportRow;
}

// ===========================================
// WKA-BETREIBER-ZUORDNUNG
// ===========================================

export interface TurbineOperator {
  id: string;
  ownershipPercentage: number;
  validFrom: Date;
  validTo: Date | null;
  status: "ACTIVE" | "HISTORICAL";
  notes: string | null;
  turbineId: string;
  operatorFundId: string;
  // Erweiterte Daten (für UI)
  operatorFund?: {
    id: string;
    name: string;
    fundCategory?: FundCategoryRef | null;
    legalForm: string | null;
  };
  turbine?: {
    id: string;
    designation: string;
    parkId: string;
  };
}

export interface TurbineOperatorInput {
  turbineId: string;
  operatorFundId: string;
  ownershipPercentage?: number;
  validFrom: Date | string;
  validTo?: Date | string | null;
  notes?: string | null;
}

// ===========================================
// GESELLSCHAFTS-HIERARCHIEN
// ===========================================

export interface FundHierarchy {
  id: string;
  ownershipPercentage: number;
  validFrom: Date;
  validTo: Date | null;
  notes: string | null;
  parentFundId: string;
  childFundId: string;
  // Erweiterte Daten (für UI)
  parentFund?: {
    id: string;
    name: string;
    fundCategory?: FundCategoryRef | null;
    legalForm: string | null;
  };
  childFund?: {
    id: string;
    name: string;
    fundCategory?: FundCategoryRef | null;
    legalForm: string | null;
  };
}

export interface FundHierarchyInput {
  parentFundId: string;
  childFundId: string;
  ownershipPercentage: number;
  validFrom: Date | string;
  validTo?: Date | string | null;
  notes?: string | null;
}

// Hierarchie-Baum für Visualisierung
export interface FundHierarchyNode {
  fundId: string;
  fundName: string;
  fundCategory?: FundCategoryRef | null;
  legalForm: string | null;
  ownershipPercentage: number | null; // null für Root
  children: FundHierarchyNode[];
}

// ===========================================
// STROMABRECHNUNG
// ===========================================

export interface EnergySettlement {
  id: string;
  year: number;
  month: number | null;
  netOperatorRevenueEur: number;
  netOperatorReference: string | null;
  totalProductionKwh: number;
  distributionMode: DistributionMode;
  smoothingFactor: number | null;
  tolerancePercentage: number | null;
  status: EnergySettlementStatus;
  calculationDetails: EnergySettlementCalculation | null;
  notes: string | null;
  parkId: string;
  tenantId: string;
  // Erweiterte Daten
  items?: EnergySettlementItem[];
  park?: {
    id: string;
    name: string;
  };
}

export interface EnergySettlementInput {
  year: number;
  month?: number | null;
  netOperatorRevenueEur: number;
  netOperatorReference?: string | null;
  distributionMode?: DistributionMode;
  tolerancePercentage?: number | null;
  notes?: string | null;
  parkId: string;
}

// Einzelposten einer Stromabrechnung
export interface EnergySettlementItem {
  id: string;
  productionShareKwh: number;
  productionSharePct: number;
  revenueShareEur: number;
  distributionKey: string | null;
  averageProductionKwh: number | null;
  deviationKwh: number | null;
  toleranceAdjustment: number | null;
  energySettlementId: string;
  recipientFundId: string;
  invoiceId: string | null;
  turbineId: string | null;
  // Erweiterte Daten
  recipientFund?: {
    id: string;
    name: string;
    fundCategory?: FundCategoryRef | null;
  };
  turbine?: {
    id: string;
    designation: string;
  };
}

// ===========================================
// BERECHNUNGS-DETAILS (JSON in calculationDetails)
// ===========================================

export interface EnergySettlementCalculation {
  // Gesamtwerte
  totalProductionKwh: number;
  netOperatorRevenueEur: number;
  averageProductionKwh: number;
  turbineCount: number;

  // Pro WKA/Betreiber
  distributions: EnergyDistributionDetail[];

  // DULDUNG-spezifisch
  toleranceMode?: {
    mode: DistributionMode;
    tolerancePercentage?: number;
    smoothingFactor?: number;
  };

  // Zeitstempel
  calculatedAt: string;
  calculatedBy?: string;
}

export interface EnergyDistributionDetail {
  turbineId: string;
  turbineDesignation: string;
  operatorFundId: string;
  operatorFundName: string;

  // Produktion
  productionKwh: number;
  productionSharePct: number;

  // Berechnung
  baseRevenueEur: number; // Anteiliger Erlös vor Ausgleich

  // DULDUNG-Ausgleich (falls SMOOTHED/TOLERATED)
  deviationFromAverage?: number; // kWh über/unter Durchschnitt
  toleranceAdjustmentEur?: number; // Ausgleichsbetrag

  // Endergebnis
  finalRevenueEur: number;
}

// ===========================================
// API RESPONSE TYPES
// ===========================================

export interface EnergySettlementListResponse {
  settlements: EnergySettlement[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TurbineProductionListResponse {
  productions: TurbineProduction[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EnergyMonthlyRateListResponse {
  rates: EnergyMonthlyRate[];
  total: number;
}

// ===========================================
// DULDUNGS-FORMEL (aus echten PDFs verifiziert)
// ===========================================

/**
 * DULDUNG (Toleranz/Glättung) Formel:
 *
 * Duldungs-Ausgleich = (Ist-Produktion - Durchschnitt) × Vergütungssatz
 *
 * - Wenn positiv → Abzug (WKA hat mehr als Durchschnitt produziert)
 * - Wenn negativ → Zuschlag (WKA hat weniger als Durchschnitt produziert)
 *
 * Beispiel WP Barenburg Dezember 2025:
 * - E-821118: 551.286,3 kWh (Ist)
 * - Durchschnitt: 527.664,53 kWh
 * - Abweichung: +23.621,77 kWh
 * - Vergütungssatz: 8,18 ct/kWh
 * - DULDUNGS-ABZUG: 23.621,77 × 0,0818 = 1.932,26 EUR
 */
export interface ToleranceCalculation {
  turbineId: string;
  actualProductionKwh: number;
  averageProductionKwh: number;
  deviationKwh: number;
  ratePerKwh: number; // in ct/kWh
  adjustmentEur: number; // positiv = Abzug, negativ = Zuschlag
}

/**
 * Berechnet den DULDUNGS-Ausgleich für eine WKA
 */
export function calculateToleranceAdjustment(
  actualProductionKwh: number,
  averageProductionKwh: number,
  ratePerKwhCt: number // in Cent
): number {
  const deviationKwh = actualProductionKwh - averageProductionKwh;
  const adjustmentEur = deviationKwh * (ratePerKwhCt / 100);
  return Math.round(adjustmentEur * 100) / 100; // Auf Cent runden
}

// ===========================================
// STEUERLICHE BEHANDLUNG
// ===========================================

/**
 * @deprecated Use PositionTaxMapping (DB-backed, configurable per tenant) instead.
 * Tax treatment is now managed via:
 * - PositionTaxMapping (lease fee categories -> TaxType)
 * - EnergyRevenueType.taxType (energy revenue -> TaxType)
 * - TaxRateConfig (TaxType -> actual percentage with date validity)
 *
 * This constant is kept only as reference documentation.
 */
export const TAX_TREATMENT = {
  // MIT MwSt (-> TaxType.STANDARD, resolved via TaxRateConfig)
  STROMERLOES_EEG: { taxRate: 19, exempt: false, reason: "Lieferung" },
  STROMERLOES_DV: { taxRate: 19, exempt: false, reason: "Lieferung" },
  PACHT_WINDHOEFIG: { taxRate: 19, exempt: false, reason: "Sonstige Leistung" },
  PACHT_AE_MASSNAHMEN: { taxRate: 19, exempt: false, reason: "Sonstige Leistung" },

  // OHNE MwSt (-> TaxType.EXEMPT, resolved via TaxRateConfig)
  MARKTPRAEMIE: { taxRate: 0, exempt: true, reason: "Durchlaufposten" },
  PACHT_WKA_STANDORT: { taxRate: 0, exempt: true, reason: "\u00a74 Nr.12 UStG (Grundstueck)" },
  PACHT_VERSIEGELT: { taxRate: 0, exempt: true, reason: "\u00a74 Nr.12 UStG (Grundstueck)" },
  WEGENUTZUNG: { taxRate: 0, exempt: true, reason: "\u00a74 Nr.12 UStG (Grundstueck)" },
} as const;

/** @deprecated Use TaxType from Prisma instead */
export type TaxTreatmentType = keyof typeof TAX_TREATMENT;

// ===========================================
// PACHT-VERTEILUNGSSCHLÜSSEL
// ===========================================

/**
 * Pachtverteilung nach Windpark-Barenburg Modell:
 * - 10% für WKA-Standorte (EUR/WKA)
 * - 90% Umlage auf Gesamtfläche (EUR/ha)
 * - Extra: Versiegelte Fläche (m² × Satz)
 *
 * Diese Werte sind pro Park konfigurierbar via:
 * - Park.weaSharePercentage (default: 10%)
 * - Park.poolSharePercentage (default: 90%)
 */
export interface LeaseDistributionConfig {
  weaSharePercentage: number; // Anteil WKA-Standort (z.B. 10)
  poolSharePercentage: number; // Anteil Poolfläche (z.B. 90)
  sealedAreaRatePerSqm: number; // EUR/m² für versiegelte Fläche
}

export interface LeaseDistributionResult {
  lessorId: string;
  lessorName: string;

  // WKA-Standort-Anteil
  weaCount: number;
  weaShareAmount: number;

  // Flächen-Anteil
  areaSqm: number;
  areaShareAmount: number;

  // Versiegelte Fläche (extra)
  sealedAreaSqm: number;
  sealedAreaAmount: number;

  // Gesamt
  totalAmount: number;

  // Steueraufteilung
  taxableAmount: number; // MIT MwSt (windhöfig + A&E)
  exemptAmount: number; // OHNE MwSt (§4 Nr.12 UStG)
}

// ===========================================
// ABRECHNUNGSINTERVALLE
// ===========================================

export type BillingInterval = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartalsweise",
  ANNUAL: "Jährlich",
};

export const BILLING_INTERVAL_MONTHS: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

// ===========================================
// JAHRESENDABRECHNUNG
// ===========================================

export interface AnnualSettlementCalculation {
  year: number;
  parkId: string;

  // Jahres-Ertrag
  totalRevenueEur: number;

  // Prozentuale Pacht
  revenueSharePercentage: number;
  calculatedRentEur: number;

  // Mindestpacht
  minimumRentEur: number;

  // Tatsächliche Pacht = MAX(calculatedRent, minimumRent)
  actualRentEur: number;

  // Bereits gezahlte Vorschüsse
  paidAdvancesEur: number;

  // Restbetrag (Nachzahlung oder 0)
  remainingAmountEur: number;

  // Pro Verpächter
  lessorBreakdown: LessorSettlementBreakdown[];
}

export interface LessorSettlementBreakdown {
  lessorId: string;
  lessorName: string;
  leaseId: string;

  // Jahres-Anspruch
  annualEntitlementEur: number;

  // Gezahlte Vorschüsse
  paidAdvancesEur: number;

  // Restbetrag
  remainingEur: number;

  // Positionen
  positions: {
    description: string;
    amount: number;
    isDeduction: boolean; // true = Abzug (Verrechnung Vorschuss)
  }[];
}
