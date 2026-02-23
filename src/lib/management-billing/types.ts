// Management Billing Type Definitions
// Cross-tenant billing system for external management companies (BF roles)

export interface ClientSettlementData {
  totalRevenueEur: number;
  settlements: Array<{
    id: string;
    year: number;
    month: number | null;
    parkId: string;
    items: Array<{
      id: string;
      recipientFundId: string;
      fundName: string;
      productionShareKwh: number;
      productionSharePct: number;
      revenueShareEur: number;
    }>;
  }>;
  contract: {
    id: string;
    role: string;
    feePercentage: number;
    parkTenantId: string;
    parkId: string;
    stakeholderTenantId: string;
    visibleFundIds: string[];
  };
}

export interface FundDetails {
  id: string;
  name: string;
  legalForm: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

export interface ParkDetails {
  id: string;
  name: string;
  turbineCount: number;
  totalCapacityKw: number | null;
}

export interface ManagementBillingInput {
  stakeholderId: string;
  year: number;
  month: number | null;
}

export interface ManagementBillingDetail {
  fundId: string;
  fundName: string;
  productionKwh: number;
  revenueEur: number;
  feeEur: number;
}

export interface ManagementBillingResult {
  baseRevenueEur: number;
  feePercentage: number;
  feeAmountNet: number;
  taxRate: number;
  taxAmount: number;
  feeAmountGross: number;
  details: ManagementBillingDetail[];
}

/**
 * @deprecated Use `getTaxRate()` from `@/lib/tax/tax-rates` instead.
 * This constant will be removed once all synchronous callers have been
 * migrated to the async, DB-backed tax rate lookup.
 */
export const TAX_RATES: Record<string, number> = {
  STANDARD: 19,
  REDUCED: 7,
  EXEMPT: 0,
};
