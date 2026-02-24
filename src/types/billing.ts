// ===========================================
// Types and Zod schemas for BILLING-001:
// Nutzungsentgelt-Abrechnung & Kostenaufteilung
// ===========================================

import { z } from "zod";

// ===========================================
// ENUMS (matching Prisma enums)
// ===========================================

export const LeaseRevenueSettlementStatus = {
  OPEN: "OPEN",
  ADVANCE_CREATED: "ADVANCE_CREATED",
  CALCULATED: "CALCULATED",
  SETTLED: "SETTLED",
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type LeaseRevenueSettlementStatus =
  (typeof LeaseRevenueSettlementStatus)[keyof typeof LeaseRevenueSettlementStatus];

export const ParkCostAllocationStatus = {
  DRAFT: "DRAFT",
  INVOICED: "INVOICED",
  CLOSED: "CLOSED",
} as const;

export type ParkCostAllocationStatus =
  (typeof ParkCostAllocationStatus)[keyof typeof ParkCostAllocationStatus];

export const LeaseSettlementMode = {
  NETWORK_COMPANY: "NETWORK_COMPANY",
  OPERATOR_DIRECT: "OPERATOR_DIRECT",
} as const;

export type LeaseSettlementMode =
  (typeof LeaseSettlementMode)[keyof typeof LeaseSettlementMode];

// ===========================================
// STATUS LABELS (German UI)
// ===========================================

export const SETTLEMENT_STATUS_LABELS: Record<LeaseRevenueSettlementStatus, string> = {
  OPEN: "Offen",
  ADVANCE_CREATED: "Vorschuss erstellt",
  CALCULATED: "Berechnet",
  SETTLED: "Abgerechnet",
  PENDING_REVIEW: "Zur Prüfung",
  APPROVED: "Freigegeben",
  CLOSED: "Abgeschlossen",
  CANCELLED: "Storniert",
};

// Period type constants
export const SettlementPeriodType = {
  ADVANCE: "ADVANCE",
  FINAL: "FINAL",
} as const;

export type SettlementPeriodType =
  (typeof SettlementPeriodType)[keyof typeof SettlementPeriodType];

export const AdvanceInterval = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
} as const;

export type AdvanceInterval =
  (typeof AdvanceInterval)[keyof typeof AdvanceInterval];

export const PERIOD_TYPE_LABELS: Record<string, string> = {
  FINAL: "Endabrechnung",
  ADVANCE: "Vorschuss",
};

export const ADVANCE_INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartalsweise",
  YEARLY: "Jährlich",
};

/**
 * Returns divisor for advance interval (how many periods per year)
 */
export function getIntervalDivisor(interval: string | null): number {
  switch (interval) {
    case "MONTHLY": return 12;
    case "QUARTERLY": return 4;
    case "YEARLY": return 1;
    default: return 1;
  }
}

/**
 * Returns display label for a settlement period
 */
export function getSettlementPeriodLabel(
  periodType: string,
  advanceInterval: string | null,
  month: number | null,
  year: number
): string {
  if (periodType === "FINAL") return `Endabrechnung ${year}`;
  if (advanceInterval === "QUARTERLY" && month != null) {
    const q = Math.ceil(month / 3);
    return `Q${q} ${year}`;
  }
  if (advanceInterval === "MONTHLY" && month != null) {
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    return `${months[month - 1]} ${year}`;
  }
  return `Jahresvorschuss ${year}`;
}

export const ALLOCATION_STATUS_LABELS: Record<ParkCostAllocationStatus, string> = {
  DRAFT: "Entwurf",
  INVOICED: "Abgerechnet",
  CLOSED: "Abgeschlossen",
};

export const SETTLEMENT_MODE_LABELS: Record<LeaseSettlementMode, string> = {
  NETWORK_COMPANY: "Netzgesellschaft rechnet ab",
  OPERATOR_DIRECT: "Betreiber rechnet selbst ab",
};

// ===========================================
// ZOD SCHEMAS - API Validation
// ===========================================

// Create a new lease revenue settlement (consolidated: supports ADVANCE + FINAL)
export const createLeaseRevenueSettlementSchema = z.object({
  parkId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  periodType: z.enum(["ADVANCE", "FINAL"]).default("FINAL"),
  advanceInterval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional().nullable(),
  month: z.number().int().min(1).max(12).optional().nullable(),
  linkedEnergySettlementId: z.string().uuid().optional().nullable(),
  advanceDueDate: z.string().datetime().optional().nullable(),
  settlementDueDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Update a lease revenue settlement
export const updateLeaseRevenueSettlementSchema = z.object({
  advanceDueDate: z.string().datetime().optional().nullable(),
  settlementDueDate: z.string().datetime().optional().nullable(),
  linkedEnergySettlementId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Setup: Configure lease settlement mode for a park
export const parkLeaseSettlementSetupSchema = z.object({
  leaseSettlementMode: z.enum(["NETWORK_COMPANY", "OPERATOR_DIRECT"]),
  // Direct billing assignments: leaseId -> fundId
  directBillingAssignments: z
    .array(
      z.object({
        leaseId: z.string().uuid(),
        directBillingFundId: z.string().uuid().nullable(),
      })
    )
    .optional(),
});

// Create cost allocation
export const createCostAllocationSchema = z.object({
  leaseRevenueSettlementId: z.string().uuid(),
  periodLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Historical import
export const importHistoricalSettlementSchema = z.object({
  parkId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  totalParkRevenueEur: z.number().min(0),
  actualFeeEur: z.number().min(0),
  usedMinimum: z.boolean(),
  items: z.array(
    z.object({
      leaseId: z.string().uuid(),
      lessorPersonId: z.string().uuid(),
      subtotalEur: z.number().min(0),
      taxableAmountEur: z.number().min(0),
      exemptAmountEur: z.number().min(0),
    })
  ),
});

// ===========================================
// TYPESCRIPT INTERFACES - API Response Types
// ===========================================

export interface PlotSummaryItem {
  plotId: string;
  plotNumber: string;
  areaSqm: number;
  turbineCount: number;
  sealedSqm: number;
  areaType: string;
}

export interface LeaseRevenueSettlementItemResponse {
  id: string;
  settlementId: string;
  leaseId: string;
  lessorPersonId: string;
  plotSummary: PlotSummaryItem[];

  // Flaechen-Anteil (Pool)
  poolAreaSqm: number;
  poolAreaSharePercent: number;
  poolFeeEur: number;

  // Standort-Anteil (WEA)
  turbineCount: number;
  standortFeeEur: number;

  // Zusatzgebühren
  sealedAreaSqm: number;
  sealedAreaRate: number;
  sealedAreaFeeEur: number;
  roadUsageFeeEur: number;
  cableFeeEur: number;

  // Summen
  subtotalEur: number;
  taxableAmountEur: number;
  exemptAmountEur: number;

  // Vorschuss
  advancePaidEur: number;
  remainderEur: number;

  // Direktabrechnung
  directBillingFundId: string | null;
  directBillingFund?: {
    id: string;
    name: string;
    legalForm: string | null;
  } | null;

  // Verknuepfte Rechnungen
  advanceInvoiceId: string | null;
  settlementInvoiceId: string | null;
  advanceInvoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
  } | null;
  settlementInvoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
  } | null;

  // Eigentuemer-Info
  lessorPerson: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };

  // Lease-Info
  lease: {
    id: string;
    startDate: string;
    endDate: string | null;
  };
}

export interface LeaseRevenueSettlementResponse {
  id: string;
  tenantId: string;
  parkId: string;
  year: number;
  status: LeaseRevenueSettlementStatus;

  // Erlösbasis
  totalParkRevenueEur: number;
  revenueSharePercent: number;

  // Berechnung
  calculatedFeeEur: number;
  minimumGuaranteeEur: number;
  actualFeeEur: number;
  usedMinimum: boolean;

  // Verteilung
  weaStandortTotalEur: number;
  poolAreaTotalEur: number;
  totalWEACount: number;
  totalPoolAreaSqm: number;

  // Konfiguration
  advanceDueDate: string | null;
  settlementDueDate: string | null;
  advanceCreatedAt: string | null;
  settlementCreatedAt: string | null;

  calculationDetails: Record<string, unknown> | null;

  createdAt: string;
  updatedAt: string;

  // Relations (optional, included when requested)
  park?: {
    id: string;
    name: string;
    shortName: string | null;
  };
  items?: LeaseRevenueSettlementItemResponse[];
  costAllocations?: ParkCostAllocationResponse[];
}

export interface ParkCostAllocationItemResponse {
  id: string;
  allocationId: string;
  operatorFundId: string;

  allocationBasis: string;
  allocationSharePercent: number;

  totalAllocatedEur: number;
  directSettlementEur: number;

  taxableAmountEur: number;
  taxableVatEur: number;
  exemptAmountEur: number;

  netPayableEur: number;

  vatInvoiceId: string | null;
  exemptInvoiceId: string | null;

  // Relations
  operatorFund: {
    id: string;
    name: string;
    legalForm: string | null;
  };
  vatInvoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
  } | null;
  exemptInvoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
  } | null;
}

export interface ParkCostAllocationResponse {
  id: string;
  tenantId: string;
  leaseRevenueSettlementId: string;
  status: ParkCostAllocationStatus;

  totalUsageFeeEur: number;
  totalTaxableEur: number;
  totalExemptEur: number;

  periodLabel: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;

  // Relations
  items?: ParkCostAllocationItemResponse[];
  leaseRevenueSettlement?: LeaseRevenueSettlementResponse;
}

// ===========================================
// SETUP TYPES
// ===========================================

export interface LeaseSetupInfo {
  leaseId: string;
  lessor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
  plots: {
    plotId: string;
    plotNumber: string;
    areaSqm: number;
    turbineCount: number;
    sealedSqm: number;
    areaType: string;
  }[];
  totalAreaSqm: number;
  totalTurbineCount: number;
  directBillingFundId: string | null;
}

export interface ParkSetupData {
  parkId: string;
  parkName: string;
  leaseSettlementMode: LeaseSettlementMode;
  billingEntityFund: {
    id: string;
    name: string;
    legalForm: string | null;
  } | null;
  operatorFunds: {
    id: string;
    name: string;
    legalForm: string | null;
  }[];
  leases: LeaseSetupInfo[];
  totalWEACount: number;
  totalPoolAreaSqm: number;
  minimumRentPerTurbine: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
  revenuePhases: {
    phaseNumber: number;
    startYear: number;
    endYear: number | null;
    revenueSharePercentage: number;
  }[];
}

// ===========================================
// CALCULATION TYPES (internal use)
// ===========================================

export interface SettlementCalculationInput {
  parkId: string;
  year: number;
  totalParkRevenueEur: number;
  revenueSharePercent: number;
  minimumRentPerTurbine: number;
  weaSharePercentage: number;
  poolSharePercentage: number;
  totalWEACount: number;
  totalPoolAreaSqm: number;
  leases: {
    leaseId: string;
    lessorPersonId: string;
    poolAreaSqm: number;
    turbineCount: number;
    sealedAreaSqm: number;
    sealedAreaRate: number;
    roadUsageFeeEur: number;
    cableLengthM: number;
    cableRate: number;
    directBillingFundId: string | null;
  }[];
}

export interface SettlementCalculationResult {
  calculatedFeeEur: number;
  minimumGuaranteeEur: number;
  actualFeeEur: number;
  usedMinimum: boolean;
  weaStandortTotalEur: number;
  poolAreaTotalEur: number;
  items: {
    leaseId: string;
    lessorPersonId: string;
    poolAreaSqm: number;
    poolAreaSharePercent: number;
    poolFeeEur: number;
    turbineCount: number;
    standortFeeEur: number;
    sealedAreaSqm: number;
    sealedAreaRate: number;
    sealedAreaFeeEur: number;
    roadUsageFeeEur: number;
    cableFeeEur: number;
    subtotalEur: number;
    taxableAmountEur: number;
    exemptAmountEur: number;
    directBillingFundId: string | null;
  }[];
}
