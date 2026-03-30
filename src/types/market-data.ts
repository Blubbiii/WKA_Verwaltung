// Types for market price comparison feature

export interface MarketPriceMonth {
  year: number;
  month: number;
  avgPriceEurMwh: number;
  minPriceEurMwh: number | null;
  maxPriceEurMwh: number | null;
  source: string;
}

export interface MarketComparisonMonth {
  month: number;
  label: string;
  productionKwh: number;
  // EEG fixed rate
  eegRateCtKwh: number;
  eegRevenueEur: number;
  // Market value
  avgMarketPriceEurMwh: number;
  avgMarketPriceCtKwh: number;
  marketRevenueEur: number;
  // Difference
  differenceEur: number;
  differencePercent: number;
}

export interface MarketComparisonSummary {
  totalProductionKwh: number;
  totalProductionMwh: number;
  totalEegRevenueEur: number;
  totalMarketRevenueEur: number;
  totalDifferenceEur: number;
  totalDifferencePercent: number;
  avgEegRateCtKwh: number;
  avgMarketPriceCtKwh: number;
  recommendation: "EEG" | "DIREKTVERMARKTUNG" | "NEUTRAL";
}

export interface MarketComparisonResponse {
  monthly: MarketComparisonMonth[];
  summary: MarketComparisonSummary;
  cumulativeDifference: { month: number; label: string; cumulativeEur: number }[];
  meta: {
    year: number;
    parkId: string;
    parkName: string;
    marketDataAvailable: boolean;
    marketDataSource: string;
    lastSyncAt: string | null;
  };
}

export const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];
