// Typed interfaces for report page tables

export interface ReportPark {
  id: string;
  name: string;
  shortName?: string;
  location?: string;
  operationalTurbines: number;
  turbineCount: number;
  totalCapacityMw: number;
  funds?: string;
}

export interface ReportTurbine {
  id: string;
  designation: string;
  park: string;
  manufacturer: string;
  model: string;
  ratedPowerKw?: number;
  commissioningDate?: string;
  status: string;
}

export interface ReportShareholder {
  id: string;
  name: string;
  fund: string;
  type: string;
  ownershipPercentage: number;
  votingRightsPercentage: number;
  entryDate?: string;
  status: string;
}

export interface ReportContract {
  id: string;
  title: string;
  contractNumber?: string;
  contractType: string;
  park?: string;
  partner?: string;
  startDate: string;
  endDate?: string;
  annualValue?: number;
  status: string;
}

export interface ReportInvoice {
  id: string;
  invoiceNumber: string;
  fund?: string;
  recipient?: string;
  invoiceDate: string;
  totalGross: number;
  status: string;
}

export interface ReportVoteResult {
  percentage: number;
}

export interface ReportVote {
  id: string;
  title: string;
  fund?: string;
  endDate: string;
  totalResponses: number;
  results?: Record<string, ReportVoteResult>;
}

export interface ReportFund {
  id: string;
  name: string;
  fundType: string;
  shareholderCount: number;
  parkCount: number;
  totalInvoiced: number;
  outstandingAmount: number;
}

export interface ReportSummary {
  totalParks?: number;
  totalTurbines?: number;
  totalCapacityMw?: number;
  totalShareholders?: number;
  totalOwnershipPercentage?: number;
  totalContracts?: number;
  totalAnnualValue?: number;
  totalExpiring?: number;
  withinNotice?: number;
  withinEnd?: number;
  totalInvoices?: number;
  totalAmount?: number;
  totalVotes?: number;
  totalFunds?: number;
  byStatus?: Record<string, number>;
  [key: string]: unknown;
}

export interface ReportDataPayload {
  summary?: ReportSummary;
  parks?: ReportPark[];
  turbines?: ReportTurbine[];
  shareholders?: ReportShareholder[];
  contracts?: ReportContract[];
  invoices?: ReportInvoice[];
  votes?: ReportVote[];
  funds?: ReportFund[];
}

export interface ReportTenant {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface ReportData {
  title: string;
  generatedAt: string;
  tenant: ReportTenant;
  data: ReportDataPayload;
}
